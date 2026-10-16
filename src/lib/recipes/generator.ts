import { householdId, draftOwner } from "../household-context";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  generatedRecipeSchema,
  type GeneratedRecipe,
} from "../ai/recipe-schema";
import { requestRecipe, recipeModelKey, type AiResult } from "../ai/service";
import { generateSchema, type GenerationRequest } from "../validation/planning";
import { planningData } from "../meals/service";
import { db } from "../db";
import { ApiError, log, recipeInclude, recipeScope } from "../db/service";
import { resolveRecipe, resolveFromRecipes } from "./resolver";
import { normalizeIngredient, normalizeDish } from "./aliases";
import { ingredientKnowledge } from "../dietary/ontology";
import { verifyRecipe, type Verification } from "../dietary/verifier";
type Draft = {
  token: string;
  ownerId: string;
  householdId: string;
  requestKey: string;
  request: GenerationRequest;
  recipe: GeneratedRecipe;
  verification: Verification;
  warnings: string[];
  model: string;
  generatedAt: string;
  expiresAt: number;
};
const drafts = new Map<string, Draft>();
const pending = new Map<string, Promise<Draft>>();
const prune = () => {
  for (const [key, d] of drafts)
    if (d.expiresAt < Date.now()) drafts.delete(key);
};
export function validateGeneratedRecipe(raw: unknown) {
  const recipe = generatedRecipeSchema.parse(raw);
  // Keep transformations out of the wire schema: strict Structured Outputs
  // supports JSON Schema constraints, not Zod string transformations.
  recipe.name = recipe.name.trim();
  recipe.description = recipe.description.trim();
  recipe.instructions = recipe.instructions.map((step) => step.trim());
  if (
    !recipe.name ||
    !recipe.description ||
    recipe.instructions.some((step) => !step) ||
    recipe.ingredients.some((i) => !i.name.trim())
  )
    throw new ApiError(
      502,
      "AI returned blank required fields; nothing was saved.",
    );
  const warnings: string[] = [];
  recipe.ingredients = recipe.ingredients.map((i) => {
    const id = normalizeIngredient(i.name);
    const claimed = normalizeIngredient(i.ingredientId);
    if (id !== claimed)
      warnings.push(
        `${i.name}: model identifier ${claimed} disagrees with the ingredient name; review required.`,
      );
    const knowledge = ingredientKnowledge(id);
    if (!knowledge || knowledge.uncertain || i.uncertain || i.quantity === null)
      warnings.push(
        `${i.name}: ${i.note || "composition or quantity needs review"}`,
      );
    return {
      ...i,
      ingredientId: id,
      uncertain:
        i.uncertain || id !== claimed || !knowledge || knowledge.uncertain,
    };
  });
  if (
    new Set(recipe.ingredients.map((i) => i.ingredientId)).size !==
    recipe.ingredients.length
  )
    throw new ApiError(
      502,
      "AI returned duplicate ingredient aliases. Generate a corrected draft.",
    );
  return { recipe, warnings };
}
export async function generateRecipe(
  input: unknown,
  provider: (prompt: string) => Promise<unknown> = requestRecipe,
) {
  const request = generateSchema.parse(input);
  const existing = await resolveRecipe(request.dishName);
  if (existing.recipe) return { existingRecipe: existing.recipe, draft: null };
  const data = await db.$transaction((tx) => planningData(tx, request.date));
  const members = data.members.filter(
    (m) => request.memberIds.includes(m.id) && m.active,
  );
  if (members.length !== request.memberIds.length)
    throw new ApiError(422, "Select active household members");
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        ...request,
        householdId: householdId(),
        ownerId: draftOwner(),
        memberIds: [...request.memberIds].sort(),
        version: data.stateVersion,
        model: recipeModelKey(),
      }),
    )
    .digest("hex");
  prune();
  const cached = [...drafts.values()].find((d) => d.requestKey === key);
  if (cached) return { existingRecipe: null, draft: cached };
  if (pending.has(key))
    return { existingRecipe: null, draft: await pending.get(key)! };
  if (pending.size >= 2 || drafts.size >= 30)
    throw new ApiError(
      429,
      "Too many recipe drafts. Discard a draft or try again shortly.",
    );
  const generation = (async () => {
    // Send rule values, not names, relationships, household IDs or personal notes.
    const prompt = JSON.stringify({
      dish: request.dishName,
      servings: request.servings,
      cuisine: request.cuisine,
      mealCategory: request.mealType,
      maxMinutes: request.maxMinutes,
      language: request.preferredLanguage,
      restrictions: members.map((m) => ({
        profile: m.dietaryPreference,
        allowEggs: m.allowEggs,
        allergies: m.allergies,
        exclusions: m.dietaryRules.map((r) => ({
          target: r.target,
          value: r.value,
        })),
        fasting: m.fasting
          ? {
              permittedIngredients: m.fastingRule?.permittedIngredients,
              prohibitedIngredients: m.fastingRule?.prohibitedIngredients,
              permittedCategories: m.fastingRule?.permittedCategories,
              prohibitedCategories: m.fastingRule?.prohibitedCategories,
            }
          : null,
      })),
      availableIngredients: data.inventory
        .filter((i) => i.availability === "AVAILABLE")
        .map((i) => ({
          ingredientId: i.ingredientId,
          quantity: i.quantity,
          unit: i.unit,
        })),
    });
    let validated;
    let usedModel = recipeModelKey();
    try {
      const result = await provider(prompt);
      const envelope =
        result &&
        typeof result === "object" &&
        "data" in result &&
        "provider" in result
          ? (result as AiResult<unknown>)
          : null;
      validated = validateGeneratedRecipe(envelope ? envelope.data : result);
      if (envelope)
        usedModel = `${envelope.provider}:${envelope.model}${envelope.fallbackUsed ? " (fallback)" : ""}`;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        502,
        "AI returned an invalid recipe; nothing was saved.",
      );
    }
    const { recipe, warnings } = validated;
    const verification = verifyRecipe(recipe, members, request);
    if (recipe.prepMinutes + recipe.cookMinutes > request.maxMinutes)
      warnings.push("The generated recipe exceeds your requested time limit.");
    if (warnings.length && verification.status === "VERIFIED") {
      verification.status = "NEEDS_CONFIRMATION";
      verification.clarifications.push(...warnings);
      verification.compatibleMembers = [];
      verification.members = verification.members.map((m) => ({
        ...m,
        status: "NEEDS_CONFIRMATION",
        clarifications: [...m.clarifications, ...warnings],
      }));
      verification.explanation = "Generated ingredient details require review.";
    }
    const draft: Draft = {
      token: randomUUID(),
      ownerId: draftOwner(),
      householdId: householdId(),
      requestKey: key,
      request,
      recipe,
      verification,
      warnings,
      model: usedModel,
      generatedAt: new Date().toISOString(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    await persistDraft(draft);
    return draft;
  })();
  pending.set(key, generation);
  try {
    return { existingRecipe: null, draft: await generation };
  } finally {
    pending.delete(key);
  }
}
export const saveDraftSchema = z
  .object({
    token: z.string().uuid(),
    confirmed: z.literal(true),
    acknowledgeUncertainty: z.boolean().default(false),
  })
  .strict();
export async function saveGeneratedRecipe(input: unknown) {
  const { token, acknowledgeUncertainty } = saveDraftSchema.parse(input);
  prune();
  const draft = await getDraft(token);
  if (!draft)
    throw new ApiError(
      410,
      "Draft expired or was discarded. Generate and review a new draft.",
    );
  if (
    !acknowledgeUncertainty &&
    (draft.recipe.ingredients.some((i) => i.quantity === null || i.uncertain) ||
      draft.warnings.length)
  )
    throw new ApiError(
      422,
      "This draft contains unresolved ingredient or time warnings. Discard it and request a clearer recipe before saving.",
    );
  return db.$transaction(async (tx) => {
    const existingRecord = await tx.recipeGenerationRecord.findUnique({
      where: {
        householdId_requestKey: {
          householdId: householdId(),
          requestKey: draft.requestKey,
        },
      },
      include: { recipe: { include: recipeInclude } },
    });
    if (existingRecord) return existingRecord.recipe;
    const library = await tx.recipe.findMany({
      where: recipeScope(),
      include: recipeInclude,
    });
    const existing =
      resolveFromRecipes(draft.request.dishName, library) ??
      resolveFromRecipes(draft.recipe.name, library);
    if (existing) return existing;
    const members = await tx.householdMember.findMany({
      where: {
        householdId: householdId(),
        id: { in: draft.request.memberIds },
        active: true,
      },
      include: { dietaryRules: true, fastingRule: true },
    });
    if (members.length !== draft.request.memberIds.length)
      throw new ApiError(
        409,
        "Participants changed. Generate and review again.",
      );
    const verification = verifyRecipe(draft.recipe, members, draft.request);
    if (
      verification.status === "REJECTED" ||
      (verification.status === "NEEDS_CONFIRMATION" && !acknowledgeUncertainty)
    )
      throw new ApiError(
        422,
        "Draft no longer satisfies all selected participants. Review their rules and generate again.",
      );
    for (const i of draft.recipe.ingredients) {
      const knowledge = ingredientKnowledge(i.ingredientId)!;
      await tx.ingredient.upsert({
        where: { id: i.ingredientId },
        create: {
          id: i.ingredientId,
          name: knowledge?.name ?? i.name,
          category: knowledge?.category ?? "unclassified",
        },
        update: {},
      });
    }
    const { ingredients, instructions, ...fields } = draft.recipe;
    const recipe = await tx.recipe.create({
      data: {
        ...fields,
        preferredLanguage: draft.request.preferredLanguage,
        ingredients: {
          create: ingredients.map((i) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            quantityStatus: i.uncertain
              ? "NEEDS_CONFIRMATION"
              : i.quantity === null
                ? "UNKNOWN"
                : "KNOWN",
            unit: i.unit,
          })),
        },
        instructions: {
          create: instructions.map((text, position) => ({ text, position })),
        },
        generation: {
          create: {
            householdId: householdId(),
            requestKey: draft.requestKey,
            requestedDish: normalizeDish(draft.request.dishName),
            model: draft.model,
            generatedAt: new Date(draft.generatedAt),
            warnings: draft.warnings,
          },
        },
      },
      include: recipeInclude,
    });
    await log(
      tx,
      "AI_RECIPE_SAVED",
      recipe.id,
      `${recipe.name}: reviewed AI recipe saved to the household library.`,
    );
    return recipe;
  });
}
export async function discardDraft(input: unknown) {
  const { token } = z
    .object({ token: z.string().uuid() })
    .strict()
    .parse(input);
  const draft = await getDraft(token);
  if (draft) {
    drafts.delete(token);
    await db.householdRecipeDraft.deleteMany({
      where: { token, householdId: draft.householdId, ownerId: draft.ownerId },
    });
  }
  return { discarded: true };
}
export type RecipeDraft = Draft;

async function persistDraft(draft: Draft) {
  drafts.set(draft.token, draft);
  await db.householdRecipeDraft.upsert({
    where: { token: draft.token },
    create: {
      token: draft.token,
      householdId: draft.householdId,
      ownerId: draft.ownerId,
      payload: JSON.parse(JSON.stringify(draft)),
      expiresAt: new Date(draft.expiresAt),
    },
    update: { payload: JSON.parse(JSON.stringify(draft)) },
  });
}
async function getDraft(token: string): Promise<Draft | undefined> {
  const owner = draftOwner();
  let d = drafts.get(token);
  if (!d) {
    const row = await db.householdRecipeDraft.findFirst({
      where: {
        token,
        ownerId: owner,
        householdId: householdId(),
        expiresAt: { gt: new Date() },
      },
    });
    if (row) d = row.payload as unknown as Draft;
  }
  if (d && (d.ownerId !== owner || d.householdId !== householdId()))
    throw new ApiError(404, "Draft not found");
  return d && d.expiresAt > Date.now() ? d : undefined;
}
export async function updateGeneratedDraft(input: unknown) {
  const v = z
    .object({ token: z.string().uuid(), recipe: generatedRecipeSchema })
    .strict()
    .parse(input);
  const draft = await getDraft(v.token);
  if (!draft) throw new ApiError(410, "Draft expired. Generate again.");
  const { recipe, warnings } = validateGeneratedRecipe(v.recipe);
  const data = await db.$transaction((tx) =>
    planningData(tx, draft.request.date),
  );
  const members = data.members.filter(
    (m) => draft.request.memberIds.includes(m.id) && m.active,
  );
  if (members.length !== draft.request.memberIds.length)
    throw new ApiError(409, "Participants changed");
  if (recipe.prepMinutes + recipe.cookMinutes > draft.request.maxMinutes)
    warnings.push("Recipe exceeds requested time limit.");
  const result = {
    ...draft,
    recipe,
    warnings,
    verification: verifyRecipe(recipe, members, draft.request),
  };
  await persistDraft(result);
  return result;
}
