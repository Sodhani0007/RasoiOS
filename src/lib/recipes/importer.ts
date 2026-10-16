import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { db } from "../db";
import { normalizeDish, normalizeIngredient } from "./aliases";
import { ingredientKnowledge } from "../dietary/ontology";
export const DATASET = "10.17632/xsphgmmh7b.1";
export function parseDataset(text: string): Record<string, string>[] {
  if (Buffer.byteLength(text) > 30 * 1024 * 1024)
    throw new Error("Dataset file exceeds 30 MB");
  const header = text.split(/\r?\n/)[0];
  const rows = parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
    delimiter: header.split("|").length > header.split(",").length ? "|" : ",",
  }) as Record<string, string>[];
  if (!rows.length || !("RecipeName" in rows[0]) || !("Ingredients" in rows[0]))
    throw new Error("Expected Mendeley RecipeName and Ingredients columns");
  return rows;
}
const unitAliases: Record<string, string> = {
  gram: "g",
  grams: "g",
  g: "g",
  kg: "kg",
  kilogram: "kg",
  ml: "ml",
  liter: "L",
  litre: "L",
  l: "L",
  cup: "cups",
  cups: "cups",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  piece: "pieces",
  pieces: "pieces",
};
export function parseIngredient(rawText: string) {
  // Deliberately conservative: a named measure must be explicit. Never infer
  // weights from count, size, handful, bunch, pinch, "to taste", or ranges.
  const m = rawText
    .trim()
    .match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s+([a-zA-Z]+)\s+(.+)$/);
  let quantity: number | null = null,
    unit = "UNKNOWN",
    name = rawText.trim();
  if (m && unitAliases[m[2].toLowerCase()]) {
    const number = (s: string) =>
      s.includes("/")
        ? Number(s.split("/")[0]) / Number(s.split("/")[1])
        : Number(s);
    quantity = m[1].split(/\s+/).reduce((sum, s) => sum + number(s), 0);
    unit = unitAliases[m[2].toLowerCase()];
    name = m[3];
    if (!Number.isFinite(quantity) || quantity <= 0) quantity = null;
  } else name = name.replace(/^\d+(?:\.\d+)?(?:\s*\/\s*\d+)?\s+/, "");
  name = name.split(/\s+-\s+/)[0].trim();
  // Parenthetical regional aliases can be stripped only when the remaining
  // complete name is in our reviewed ingredient ontology.
  const plain = name.replace(/\([^)]*\)/g, "").trim();
  const normalized = normalizeIngredient(plain);
  const known = ingredientKnowledge(normalized);
  const ingredientId = known
    ? normalized
    : `dataset-${createHash("sha256").update(name.toLowerCase()).digest("hex").slice(0, 20)}`;
  return {
    ingredientId,
    name: known?.name ?? name,
    category: known?.category ?? "unclassified",
    quantity,
    unit,
    rawText,
    quantityStatus: quantity === null ? "UNKNOWN" : "KNOWN",
  };
}
const positiveInt = (s: string | undefined) =>
  s && /^\d+$/.test(s.trim()) && Number(s) > 0 ? Number(s) : null;
export async function importDataset(rows: Record<string, string>[]) {
  if (rows.length > 10000)
    throw new Error("Import at most 10,000 records per batch");
  let imported = 0,
    duplicates = 0,
    skipped = 0;
  const errors: string[] = [];
  for (const row of rows) {
    const name = (row.TranslatedRecipeName || row.RecipeName || "").trim();
    const ingredientText = (
      row.TranslatedIngredients ||
      row.Ingredients ||
      ""
    ).trim();
    const instructionText = (
      row.TranslatedInstructions ||
      row.Instructions ||
      ""
    ).trim();
    if (!name || !ingredientText || !instructionText) {
      skipped++;
      continue;
    }
    const sourceKey = createHash("sha256")
      .update(row.URL?.trim() || normalizeDish(name))
      .digest("hex");
    if (
      await db.recipeImportRecord.findUnique({
        where: { dataset_sourceKey: { dataset: DATASET, sourceKey } },
      })
    ) {
      duplicates++;
      continue;
    }
    const warnings: string[] = [];
    const servings = positiveInt(row.Servings);
    const prep = positiveInt(row.PrepTimeInMins ?? row.Prep);
    const cook = positiveInt(row.CookTimeInMins ?? row.Cook);
    if (!servings)
      warnings.push(
        "Original servings unknown; scaling requires a corrected household copy.",
      );
    if (prep === null || cook === null)
      warnings.push("Preparation/cooking time missing or zero; review timing.");
    const ingredients = ingredientText
      .split(/,(?![^()]*\))|\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map(parseIngredient);
    // If CSV punctuation or aliases produce duplicate ingredient entries, retain
    // every raw fragment but make the combined quantity explicitly unknown.
    const unique = new Map<string, ReturnType<typeof parseIngredient>>();
    for (const i of ingredients) {
      const old = unique.get(i.ingredientId);
      if (old) {
        old.rawText += "; " + i.rawText;
        old.quantity = null;
        old.quantityStatus = "UNKNOWN";
      } else unique.set(i.ingredientId, i);
    }
    if (!servings)
      for (const i of unique.values()) {
        i.quantity = null;
        i.quantityStatus = "UNKNOWN";
      }
    if ([...unique.values()].some((i) => i.quantity === null))
      warnings.push(
        "Some ingredient quantities need confirmation. Raw text is preserved.",
      );
    try {
      await db.$transaction(
        async (tx) => {
          for (const i of unique.values())
            await tx.ingredient.upsert({
              where: { id: i.ingredientId },
              create: {
                id: i.ingredientId,
                name: i.name,
                category: i.category,
              },
              update: {},
            });
          const aliases = [
            ...new Set(
              [row.RecipeName, name, name.split(/\s+Recipe\b/i)[0]]
                .filter(Boolean)
                .map(normalizeDish),
            ),
          ];
          await tx.recipe.create({
            data: {
              name,
              description:
                row.Description ||
                `Imported ${row.Cuisine || "Indian"} recipe. Source dietary label: ${row.Diet || "not supplied"}; independently verify for each member.`,
              mealCategory: /breakfast/i.test(row.Course)
                ? "breakfast"
                : /snack|appetizer/i.test(row.Course)
                  ? "snack"
                  : "lunch dinner",
              defaultServings: servings ?? 1,
              prepMinutes: prep ?? 0,
              cookMinutes: cook ?? 0,
              advancePreparation:
                "Read the original instructions for soaking, marinating, or other advance preparation.",
              dietaryMetadata: [row.Diet || "Unknown"],
              substitutions: [],
              source: "MENDELEY",
              preferredLanguage: row.TranslatedInstructions
                ? "English (dataset machine translation)"
                : "Original source language (unverified)",
              ingredients: {
                create: [...unique.values()].map(
                  ({ name, category, ...i }) => i,
                ),
              },
              instructions: {
                create: instructionText
                  .split(/\r?\n/)
                  .filter(Boolean)
                  .map((text, position) => ({ text, position })),
              },
              aliases: { create: aliases.map((name) => ({ name })) },
              importRecord: {
                create: {
                  dataset: DATASET,
                  sourceKey,
                  originalUrl: row.URL || null,
                  cuisine: row.Cuisine || "",
                  diet: row.Diet || "",
                  raw: row,
                  warnings,
                },
              },
            },
          });
        },
        { timeout: 30000 },
      );
      imported++;
    } catch (e) {
      skipped++;
      errors.push(
        `${name}: ${e instanceof Error ? e.message : "Import failed"}`,
      );
    }
  }
  return {
    imported,
    duplicates,
    skipped,
    errors: errors.slice(0, 20),
    totalImported: await db.recipeImportRecord.count({
      where: { dataset: DATASET },
    }),
  };
}
export const importInput = z
  .object({
    csv: z.string().min(1).max(30000000),
    confirmAttribution: z.literal(true),
  })
  .strict();
