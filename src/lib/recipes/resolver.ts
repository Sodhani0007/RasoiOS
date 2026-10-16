import { householdId } from "../household-context";
import {
  getRecipes,
  ApiError,
  log,
  recipeInclude,
  recipeScope,
} from "../db/service";
import { db } from "../db";
import { normalizeDish } from "./aliases";
export type ResolvedRecipe = Awaited<ReturnType<typeof getRecipes>>[number];
const priority = (r: ResolvedRecipe) =>
  r.custom?.preferred
    ? 0
    : r.source === "MENDELEY"
      ? 1
      : r.source === "LOCAL"
        ? 2
        : 3;
export function matchingRecipes(
  name: string,
  recipes: ResolvedRecipe[],
  partial = false,
) {
  const key = normalizeDish(name);
  const matches = recipes.filter((r) =>
    [
      r.name,
      r.id,
      ...(r.aliases ?? []).map((a) => a.name),
      r.generation?.requestedDish ?? "",
    ].some((n) =>
      partial ? normalizeDish(n).includes(key) : normalizeDish(n) === key,
    ),
  );
  const ids = new Set(matches.map((r) => r.id));
  for (const r of recipes)
    if (
      r.custom?.preferred &&
      ids.has(r.custom.originalRecipeId) &&
      !ids.has(r.id)
    )
      matches.push(r);
  return matches.sort(
    (a, b) =>
      priority(a) - priority(b) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}
export async function searchRecipes(query: string, limit = 60) {
  const recipes = await searchCandidates(query);
  const exact = matchingRecipes(query, recipes);
  const partial = matchingRecipes(query, recipes, true);
  return {
    recipes: [
      ...exact,
      ...partial.filter((r) => !exact.some((e) => e.id === r.id)),
    ].slice(0, limit),
    exactCount: exact.length,
    canGenerate: exact.length === 0,
    explanation: exact.length
      ? "Household versions first, then dataset, local and saved AI recipes."
      : "Recipe not found locally. Browse partial matches or generate with AI.",
  };
}
async function searchCandidates(query: string) {
  const key = normalizeDish(query);
  const contains = (value: string) =>
    Object.assign(
      { contains: value },
      /^postgres/.test(process.env.DATABASE_URL || "")
        ? { mode: "insensitive" as const }
        : {},
    );
  const equals = (value: string) =>
    Object.assign(
      { equals: value },
      /^postgres/.test(process.env.DATABASE_URL || "")
        ? { mode: "insensitive" as const }
        : {},
    );
  const matches = {
    where: {
      AND: [
        recipeScope(),
        {
          OR: [
            { name: contains(query) },
            { id: key },
            { aliases: { some: { name: { contains: key } } } },
            { generation: { requestedDish: key } },
            {
              custom: {
                originalRecipe: {
                  OR: [
                    { name: contains(query) },
                    { id: key },
                    { aliases: { some: { name: key } } },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    include: recipeInclude,
    orderBy: { name: "asc" },
    take: 200,
  } satisfies import("@prisma/client").Prisma.RecipeFindManyArgs;
  // Exact matches and preferred household versions must not disappear behind
  // a broad partial-query limit (e.g. hundreds of recipes containing "rice").
  const [exact, owned, partial] = await Promise.all([
    db.recipe.findMany({
      where: {
        AND: [
          recipeScope(),
          {
            OR: [
              { name: equals(query) },
              { id: key },
              { aliases: { some: { name: key } } },
              { generation: { requestedDish: key } },
              {
                custom: {
                  originalRecipe: {
                    OR: [
                      { name: equals(query) },
                      { id: key },
                      { aliases: { some: { name: key } } },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      include: recipeInclude,
      take: 100,
    }),
    db.recipe.findMany({
      ...matches,
      where: {
        AND: [
          ...matches.where.AND,
          { custom: { householdId: householdId(), preferred: true } },
        ],
      },
    }),
    db.recipe.findMany(matches),
  ]);
  return [
    ...new Map([...exact, ...owned, ...partial].map((r) => [r.id, r])).values(),
  ];
}
export function preferredRecipes(recipes: ResolvedRecipe[]): ResolvedRecipe[] {
  const overrides = new Map(
    recipes
      .filter((r) => r.custom?.preferred)
      .map((r) => [r.custom!.originalRecipeId, r]),
  );
  return recipes
    .filter((r) => r.source !== "HOUSEHOLD_CUSTOM")
    .map((r) => overrides.get(r.id) ?? r)
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function resolveFromRecipes(name: string, recipes: ResolvedRecipe[]) {
  return matchingRecipes(name, recipes)[0] ?? null;
}
export async function resolveRecipe(name: string) {
  const matches = matchingRecipes(name, await searchCandidates(name));
  const recipe = matches[0] ?? null;
  return {
    recipe,
    alternatives: matches.slice(1, 10),
    found: !!recipe,
    canGenerate: !recipe,
    aiConfigured: !!(
      process.env.GEMINI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.OPENAI_API_KEY
    ),
    explanation: recipe
      ? `Using ${recipe.source === "HOUSEHOLD_CUSTOM" ? "your preferred household version" : recipe.source === "MENDELEY" ? "a Mendeley dataset recipe; check source quantities and dietary compatibility" : recipe.source === "LOCAL" ? "a local recipe" : "a previously saved AI recipe"}.`
      : "Recipe not found locally. You can explicitly generate a draft with AI.",
  };
}
export async function resetRecipe(id: string) {
  return db.$transaction(async (tx) => {
    const override = await tx.householdRecipeOverride.findFirst({
      where: { recipeId: id, householdId: householdId() },
    });
    if (!override) throw new ApiError(404, "Household recipe not found");
    await tx.householdRecipeOverride.update({
      where: { id: override.id },
      data: { preferred: false },
    });
    await log(
      tx,
      "CUSTOM_RECIPE_RESET",
      id,
      "Original recipe restored as preferred; the household copy is retained.",
    );
    return tx.recipe.findUniqueOrThrow({
      where: { id: override.originalRecipeId },
      include: recipeInclude,
    });
  });
}
