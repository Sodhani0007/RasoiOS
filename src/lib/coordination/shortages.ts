import { z } from "zod";
import { db } from "../db";
import { ApiError, log, recipeInclude, recipeScope } from "../db/service";
import { householdId } from "../household-context";
import { dateOnly, mealTypes } from "../validation/planning";
import { normalizeIngredient } from "../recipes/aliases";
import { verifyRecipe } from "../dietary/verifier";
import { scaleRecipe } from "../recipes/scaler";
import { compareInventory } from "../inventory/availability";
import { fitsMealCategory } from "../recipes/category";

export async function reportShortage(input: unknown) {
  const v = z
    .object({
      ingredient: z.string().trim().min(1).max(100),
      mealDate: dateOnly,
      mealType: z.enum(mealTypes),
      note: z.string().trim().max(1000).default(""),
      confirmed: z.literal(true),
    })
    .strict()
    .parse(input);
  const ingredientId = normalizeIngredient(v.ingredient);
  return db.$transaction(
    async (tx) => {
      const stock = await tx.inventoryItem.findMany({
        where: { householdId: householdId() },
      });
      const item = stock.find(
        (i) => normalizeIngredient(i.ingredientId) === ingredientId,
      );
      if (!item)
        throw new ApiError(
          422,
          "Select an ingredient recorded in household inventory. Add missing inventory details first.",
        );
      const before = { ...item };
      const after = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { availability: "UNAVAILABLE" },
      });
      item.availability = "UNAVAILABLE";
      const requests = await tx.mealRequest.findMany({
        where: {
          householdId: householdId(),
          mealDate: v.mealDate,
          mealType: v.mealType,
          attendance: "HOME",
          status: {
            in: ["SUBMITTED", "APPROVED", "UNDER_REVIEW", "NEEDS_CHANGE"],
          },
          recipe: { ingredients: { some: { ingredientId } } },
        },
        include: {
          member: { include: { dietaryRules: true, fastingRule: true } },
        },
      });
      const candidates = await tx.recipe.findMany({
        where: {
          AND: [
            recipeScope(),
            {
              ingredients: {
                none: { ingredientId },
                every: { quantityStatus: "KNOWN" },
              },
            },
          ],
        },
        include: recipeInclude,
        orderBy: { name: "asc" },
        take: 500,
      });
      candidates.sort(
        (a, b) =>
          Number(!a.custom?.preferred) - Number(!b.custom?.preferred) ||
          Number(a.source === "MENDELEY") - Number(b.source === "MENDELEY") ||
          a.name.localeCompare(b.name),
      );
      const affected = [];
      for (const request of requests) {
        const disliked = Array.isArray(request.member.dislikes)
          ? request.member.dislikes
              .filter((s): s is string => typeof s === "string")
              .map(normalizeIngredient)
          : [];
        const alternatives = candidates
          .filter(
            (r) =>
              r.id !== request.recipeId &&
              fitsMealCategory(r.mealCategory, v.mealType) &&
              !r.ingredients.some((i) =>
                disliked.includes(normalizeIngredient(i.ingredientId)),
              ) &&
              verifyRecipe(r, [request.member], {
                date: v.mealDate,
                mealType: v.mealType,
              }).status === "VERIFIED" &&
              compareInventory(
                scaleRecipe(r, request.servings),
                stock,
                v.mealDate,
              ).status === "READY",
          )
          .slice(0, 5);
        // Re-reporting refreshes existing pending suggestions instead of duplicating cards.
        await tx.cookSuggestion.updateMany({
          where: {
            householdId: householdId(),
            requestId: request.id,
            unavailableIngredientId: ingredientId,
            status: "PENDING",
          },
          data: { status: "SUPERSEDED", reviewedAt: new Date() },
        });
        await tx.cookSuggestion.create({
          data: {
            householdId: householdId(),
            requestId: request.id,
            requestRevision: request.revision,
            ingredientFrom: item.ingredientId,
            ingredientTo: "a reviewed alternative",
            message: `${item.ingredientId} is unavailable. ${v.note}`.trim(),
            unavailableIngredientId: ingredientId,
            proposedRecipeIds: alternatives.map((r) => r.id),
          },
        });
        affected.push({
          requestId: request.id,
          memberName: request.member.name,
          dish: request.requestedDishName,
          alternatives: alternatives.map((r) => ({ id: r.id, name: r.name })),
        });
      }
      const report = await tx.ingredientShortage.create({
        data: {
          householdId: householdId(),
          ingredientId,
          mealDate: v.mealDate,
          mealType: v.mealType,
          note: v.note,
          affectedRequests: affected,
        },
      });
      const stateVersion = await log(
        tx,
        "INGREDIENT_SHORTAGE",
        report.id,
        `${item.ingredientId} reported unavailable; ${affected.length} affected choices await family review.`,
      );
      await tx.inventoryEvent.create({
        data: {
          householdId: householdId(),
          inventoryItemId: item.id,
          type: "SHORTAGE_REPORTED",
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
          stateVersion,
        },
      });
      return {
        report,
        affected,
        message:
          "Inventory marked unavailable. Family choices are unchanged until approval.",
      };
    },
    { timeout: 30000 },
  );
}
export async function shortageReports(date?: string) {
  return db.ingredientShortage.findMany({
    where: { householdId: householdId(), ...(date ? { mealDate: date } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}
