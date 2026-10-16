import { householdId } from "../household-context";
import { Prisma } from "@prisma/client";
import { db } from "./index";
import {
  canonical,
  inventorySchema,
  inventoryPatch,
  memberSchema,
  memberPatch,
  recipeSchema,
} from "../validation";
import { convertQuantity } from "../inventory/units";
import { normalizeIngredient } from "../recipes/aliases";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const memberInclude = { dietaryRules: true, fastingRule: true } as const;
export const recipeInclude = {
  ingredients: { include: { ingredient: true } },
  instructions: { orderBy: { position: "asc" as const } },
  custom: true,
  generation: true,
  importRecord: true,
  aliases: true,
} as const;
export const recipeScope = () => ({
  OR: [
    { source: "LOCAL" },
    { source: "MENDELEY" },
    { custom: { householdId: householdId() } },
    { generation: { householdId: householdId() } },
  ],
});
export async function log(
  tx: Prisma.TransactionClient,
  type: string,
  entityId: string,
  description: string,
) {
  const h = await tx.household.update({
    where: { id: householdId() },
    data: { version: { increment: 1 } },
  });
  await tx.activityLog.create({
    data: {
      householdId: householdId(),
      type,
      entityId,
      description,
      stateVersion: h.version,
    },
  });
  return h.version;
}
export async function getHousehold() {
  return db.household.findUniqueOrThrow({
    where: { id: householdId() },
    include: {
      members: { include: memberInclude },
      inventory: { include: { ingredient: true } },
      activity: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });
}
export async function getMembers() {
  return db.householdMember.findMany({
    where: { householdId: householdId() },
    include: memberInclude,
    orderBy: { createdAt: "asc" },
  });
}
export async function getMember(id: string) {
  const m = await db.householdMember.findFirst({
    where: { id, householdId: householdId() },
    include: memberInclude,
  });
  if (!m) throw new ApiError(404, "Member not found");
  return m;
}
export async function saveMember(input: unknown, id?: string) {
  const parsed = id ? memberPatch.parse(input) : memberSchema.parse(input);
  return db.$transaction(async (tx) => {
    const old = id
      ? await tx.householdMember.findFirst({
          where: { id, householdId: householdId() },
          include: memberInclude,
        })
      : null;
    if (id && !old) throw new ApiError(404, "Member not found");
    const { excludedIngredients, excludedCategories, fastingRule, ...fields } =
      parsed;
    if (
      fastingRule?.startsOn &&
      fastingRule.endsOn &&
      fastingRule.endsOn < fastingRule.startsOn
    )
      throw new ApiError(
        422,
        "Fasting end date must not precede its start date",
      );
    const active = fields.active ?? old?.active ?? true;
    const data = { ...fields, ...(!active ? { participating: false } : {}) };
    const m = old
      ? await tx.householdMember.update({ where: { id }, data })
      : await tx.householdMember.create({
          data: {
            ...data,
            householdId: householdId(),
          } as Prisma.HouseholdMemberUncheckedCreateInput,
        });
    for (const [target, values] of [
      ["INGREDIENT", excludedIngredients],
      ["CATEGORY", excludedCategories],
    ] as const) {
      if (values) {
        await tx.dietaryRule.deleteMany({ where: { memberId: m.id, target } });
        await tx.dietaryRule.createMany({
          data: values.map((value) => ({
            memberId: m.id,
            target,
            value: canonical(value),
            action: "EXCLUDE",
          })),
        });
      }
    }
    if (fastingRule)
      await tx.fastingRule.upsert({
        where: { memberId: m.id },
        create: { memberId: m.id, ...fastingRule },
        update: fastingRule,
      });
    const type = !old
      ? "MEMBER_ADDED"
      : old.active !== m.active
        ? m.active
          ? "MEMBER_REACTIVATED"
          : "MEMBER_DEACTIVATED"
        : "MEMBER_UPDATED";
    await log(
      tx,
      type,
      m.id,
      `${m.name}: ${type.toLowerCase().replaceAll("_", " ")}.`,
    );
    return tx.householdMember.findUniqueOrThrow({
      where: { id: m.id },
      include: memberInclude,
    });
  });
}
export async function deleteMember(id: string) {
  return db.$transaction(async (tx) => {
    const m = await tx.householdMember.findFirst({
      where: { id, householdId: householdId() },
    });
    if (!m) throw new ApiError(404, "Member not found");
    await tx.householdMember.delete({ where: { id } });
    await log(
      tx,
      "MEMBER_DELETED",
      id,
      `${m.name} removed from the household.`,
    );
    return { id };
  });
}
export async function getInventory() {
  return db.inventoryItem.findMany({
    where: { householdId: householdId() },
    include: { ingredient: true },
    orderBy: { updatedAt: "desc" },
  });
}
export async function saveInventory(input: unknown, id?: string) {
  const parsed = id
    ? inventoryPatch.parse(input)
    : inventorySchema.parse(input);
  return db.$transaction(async (tx) => {
    const old = id
      ? await tx.inventoryItem.findFirst({
          where: { id, householdId: householdId() },
          include: { ingredient: true },
        })
      : null;
    if (id && !old) throw new ApiError(404, "Inventory item not found");
    const merged = inventorySchema.parse({
      ...(old
        ? {
            ingredientName: old.ingredient.name,
            category: old.ingredient.category,
            quantity: old.quantity,
            unit: old.unit,
            availability: old.availability,
            notes: old.notes,
            purchaseDate: old.purchaseDate?.toISOString().slice(0, 10) ?? null,
            expiryDate: old.expiryDate?.toISOString().slice(0, 10) ?? null,
          }
        : {}),
      ...parsed,
    });
    let quantity = merged.quantity;
    if (old && merged.unit !== old.unit) {
      try {
        const converted = convertQuantity(old.quantity, old.unit, merged.unit);
        if (parsed.quantity === undefined) quantity = converted;
      } catch (e) {
        throw new ApiError(422, (e as Error).message);
      }
    }
    if (
      merged.purchaseDate &&
      merged.expiryDate &&
      merged.expiryDate < merged.purchaseDate
    )
      throw new ApiError(422, "Use-by date must be on or after purchase date");
    const ingredientId = normalizeIngredient(merged.ingredientName);
    if (!ingredientId)
      throw new ApiError(
        422,
        "Ingredient name must include letters or numbers",
      );
    const ingredient = await tx.ingredient.upsert({
      where: { id: ingredientId },
      create: {
        id: ingredientId,
        name: merged.ingredientName,
        category: merged.category,
      },
      update: {},
    });
    if (ingredient.category !== merged.category)
      throw new ApiError(
        422,
        `Existing ingredient belongs to ${ingredient.category}`,
      );
    const data = {
      ingredientId,
      quantity,
      unit: merged.unit,
      availability: merged.availability,
      purchaseDate: merged.purchaseDate ? new Date(merged.purchaseDate) : null,
      expiryDate: merged.expiryDate ? new Date(merged.expiryDate) : null,
      notes: merged.notes,
    };
    const item = old
      ? await tx.inventoryItem.update({
          where: { id },
          data,
          include: { ingredient: true },
        })
      : await tx.inventoryItem.create({
          data: { householdId: householdId(), ...data },
          include: { ingredient: true },
        });
    const type = !old
      ? "INVENTORY_ADDED"
      : item.availability === "UNAVAILABLE" &&
          old.availability !== "UNAVAILABLE"
        ? "INVENTORY_UNAVAILABLE"
        : old.quantity !== item.quantity || old.unit !== item.unit
          ? "INVENTORY_QUANTITY_CHANGED"
          : "INVENTORY_UPDATED";
    const version = await log(
      tx,
      type,
      item.id,
      `${ingredient.name}: ${item.quantity === null ? "quantity unknown" : `${item.quantity} ${item.unit}`} · ${item.availability.toLowerCase()}.`,
    );
    await tx.inventoryEvent.create({
      data: {
        householdId: householdId(),
        inventoryItemId: item.id,
        type,
        before: old ? JSON.parse(JSON.stringify(old)) : Prisma.JsonNull,
        after: JSON.parse(JSON.stringify(item)),
        stateVersion: version,
      },
    });
    return item;
  });
}
export async function deleteInventory(id: string) {
  return db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id, householdId: householdId() },
      include: { ingredient: true },
    });
    if (!item) throw new ApiError(404, "Inventory item not found");
    const version = await log(
      tx,
      "INVENTORY_REMOVED",
      id,
      `${item.ingredient.name} removed from inventory.`,
    );
    await tx.inventoryEvent.create({
      data: {
        householdId: householdId(),
        inventoryItemId: id,
        type: "INVENTORY_REMOVED",
        before: JSON.parse(JSON.stringify(item)),
        stateVersion: version,
      },
    });
    await tx.inventoryItem.delete({ where: { id } });
    return { id };
  });
}
export async function getRecipes() {
  const [owned, library] = await Promise.all([
    db.recipe.findMany({
      where: {
        OR: [
          { custom: { householdId: householdId() } },
          { generation: { householdId: householdId() } },
        ],
      },
      include: recipeInclude,
      orderBy: { createdAt: "desc" },
    }),
    db.recipe.findMany({
      where: { source: { in: ["LOCAL", "MENDELEY"] } },
      include: recipeInclude,
      orderBy: { createdAt: "asc" },
      take: 120,
    }),
  ]);
  return [...owned, ...library];
}
export async function getRecipe(id: string) {
  const r = await db.recipe.findFirst({
    where: { id, ...recipeScope() },
    include: recipeInclude,
  });
  if (!r) throw new ApiError(404, "Recipe not found");
  return r;
}
export async function saveRecipe(input: unknown, id?: string) {
  const v = recipeSchema.parse(input);
  return db.$transaction(async (tx) => {
    const custom = id
      ? await tx.householdRecipeOverride.findFirst({
          where: { recipeId: id, householdId: householdId() },
        })
      : null;
    if (id && !custom) throw new ApiError(404, "Household recipe not found");
    if (
      custom &&
      v.originalRecipeId &&
      v.originalRecipeId !== custom.originalRecipeId
    )
      throw new ApiError(422, "Cannot change original recipe");
    const original = await tx.recipe.findFirst({
      where: {
        id: custom?.originalRecipeId ?? v.originalRecipeId ?? "",
        OR: [
          { source: "LOCAL" },
          { source: "MENDELEY" },
          { generation: { householdId: householdId() } },
        ],
      },
    });
    if (!original) throw new ApiError(404, "Original recipe not found");
    const count = await tx.ingredient.count({
      where: { id: { in: v.ingredients.map((i) => i.ingredientId) } },
    });
    if (count !== v.ingredients.length)
      throw new ApiError(422, "Unknown ingredient identifier");
    const data = {
      name: v.name,
      description: v.description,
      defaultServings: v.defaultServings,
      ingredients: { create: v.ingredients },
      instructions: {
        create: v.instructions.map((text, position) => ({ text, position })),
      },
    };
    let result;
    if (custom) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      await tx.recipeInstruction.deleteMany({ where: { recipeId: id } });
      result = await tx.recipe.update({
        where: { id },
        data,
        include: recipeInclude,
      });
      await tx.householdRecipeOverride.update({
        where: { id: custom.id },
        data: { updatedAt: new Date(), preferred: true },
      });
    } else {
      result = await tx.recipe.create({
        data: {
          ...data,
          mealCategory: original.mealCategory,
          prepMinutes: original.prepMinutes,
          cookMinutes: original.cookMinutes,
          advancePreparation: original.advancePreparation,
          dietaryMetadata: original.dietaryMetadata as Prisma.InputJsonValue,
          substitutions: original.substitutions as Prisma.InputJsonValue,
          preferredLanguage: original.preferredLanguage,
          source: "HOUSEHOLD_CUSTOM",
          custom: {
            create: {
              householdId: householdId(),
              originalRecipeId: original.id,
            },
          },
        },
        include: recipeInclude,
      });
    }
    await log(
      tx,
      custom ? "CUSTOM_RECIPE_UPDATED" : "CUSTOM_RECIPE_CREATED",
      result.id,
      `${result.name}: household version ${custom ? "updated" : "saved"}.`,
    );
    return result;
  });
}
export async function getActivity() {
  return db.activityLog.findMany({
    where: { householdId: householdId() },
    orderBy: [{ createdAt: "desc" }, { stateVersion: "desc" }],
    take: 200,
  });
}
