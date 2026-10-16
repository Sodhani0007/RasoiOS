import { beforeAll, afterAll, it, expect, vi, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
const file = resolve(`prisma/test-phase34-${process.pid}.db`);
process.env.DATABASE_URL = `file:${file.replaceAll("\\", "/")}`;
const { db } = await import("../src/lib/db");
const { householdContext } = await import("../src/lib/household-context");
const { saveMealSelection, saveRequest, reviewSuggestion, familyCookUpdates } =
  await import("../src/lib/coordination/service");
const { reportShortage } = await import("../src/lib/coordination/shortages");
const { interpretCommand } = await import("../src/lib/ai/service");
const { searchRecipes } = await import("../src/lib/recipes/resolver");
const as = (fn: () => Promise<unknown>) =>
  householdContext.run({ householdId: "demo-household", memberId: member }, fn);
let member: string;
const meal = {
  mealDate: "2026-10-20",
  mealType: "lunch",
  preferredTime: "13:15",
  status: "SUBMITTED",
};
const item = (recipeId: string, requestedDishName: string, servings = 1) => ({
  recipeId,
  requestedDishName,
  servings,
});
beforeAll(async () => {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env: process.env,
    stdio: "pipe",
  });
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
    { env: process.env, stdio: "pipe" },
  );
  member = (
    await db.householdMember.findFirstOrThrow({
      where: { relationship: "Daughter" },
    })
  ).id;
  for (const r of await db.recipeIngredient.findMany())
    await db.inventoryItem.upsert({
      where: {
        householdId_ingredientId: {
          householdId: "demo-household",
          ingredientId: r.ingredientId,
        },
      },
      create: {
        householdId: "demo-household",
        ingredientId: r.ingredientId,
        quantity: 10000,
        unit: r.unit,
        availability: "AVAILABLE",
      },
      update: {
        quantity: 10000,
        unit: r.unit,
        availability: "AVAILABLE",
        expiryDate: null,
      },
    });
}, 60000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(file, { force: true });
  rmSync(file + "-journal", { force: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("saves multiple portions atomically and rejects duplicate selections", async () => {
  const result = (await as(() =>
    saveMealSelection({
      ...meal,
      items: [
        item("paneer-bhurji", "Paneer Bhurji", 2),
        item("jeera-rice", "Jeera Rice", 0.5),
      ],
    }),
  )) as { requests: { servings: number }[] };
  expect(result.requests.map((r) => r.servings)).toEqual([2, 0.5]);
  await expect(
    as(() =>
      saveMealSelection({ ...meal, items: [item("jeera-rice", "Jeera Rice")] }),
    ),
  ).rejects.toThrow("already selected");
  const count = await db.mealRequest.count();
  await expect(
    as(() =>
      saveMealSelection({
        ...meal,
        items: [
          item("dal-tadka", "Dal Tadka"),
          item("missing", "Missing dish"),
        ],
      }),
    ),
  ).rejects.toThrow("Recipe not found");
  expect(await db.mealRequest.count()).toBe(count);
});
it("reports only affected dishes, leaves choices unchanged, and applies only a confirmed alternative", async () => {
  const before = await db.mealRequest.findMany({ orderBy: { id: "asc" } });
  await expect(
    as(() =>
      reportShortage({ ...meal, ingredient: "paneer", confirmed: false }),
    ),
  ).rejects.toThrow();
  const report = (await as(() =>
    reportShortage({
      mealDate: meal.mealDate,
      mealType: meal.mealType,
      ingredient: "paneer",
      confirmed: true,
    }),
  )) as Awaited<ReturnType<typeof reportShortage>>;
  expect(report.affected).toHaveLength(1);
  expect(report.affected[0].dish).toBe("Paneer Bhurji");
  expect(report.affected[0].alternatives.length).toBeGreaterThan(0);
  expect(await db.mealRequest.findMany({ orderBy: { id: "asc" } })).toEqual(
    before,
  );
  const suggestion = await db.cookSuggestion.findFirstOrThrow({
    where: { unavailableIngredientId: "paneer", status: "PENDING" },
  });
  await expect(
    as(() =>
      reviewSuggestion(suggestion.id, {
        action: "ACCEPT",
        confirmed: false,
        recipeId: report.affected[0].alternatives[0].id,
      }),
    ),
  ).rejects.toThrow();
  await as(() =>
    reviewSuggestion(suggestion.id, {
      action: "ACCEPT",
      confirmed: true,
      recipeId: report.affected[0].alternatives[0].id,
    }),
  );
  const unaffected = before.find((r) => r.recipeId === "jeera-rice")!;
  expect(
    await db.mealRequest.findUnique({ where: { id: unaffected.id } }),
  ).toEqual(unaffected);
  expect(
    (
      await db.mealRequest.findUniqueOrThrow({
        where: { id: suggestion.requestId },
      })
    ).recipeId,
  ).toBe(report.affected[0].alternatives[0].id);
});
it("returns bounded live search results in source order", async () => {
  const r = (await as(() => searchRecipes("paneer", 8))) as Awaited<
    ReturnType<typeof searchRecipes>
  >;
  expect(r.recipes.length).toBeGreaterThan(0);
  expect(r.recipes.length).toBeLessThanOrEqual(8);
});
it("uses exactly one fallback and validates a kitchen command without database writes", async () => {
  vi.stubEnv("GROQ_API_KEY", "unit-test");
  vi.stubEnv("GEMINI_API_KEY", "unit-test");
  vi.stubEnv("AI_FALLBACK_ENABLED", "true");
  vi.stubEnv("AI_COMMAND_PROVIDER", "groq");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 429 }))
    .mockResolvedValueOnce(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    action: "REPORT_INGREDIENT_UNAVAILABLE",
                    ingredient: "paneer",
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const before = await db.inventoryItem.findMany();
  const r = await interpretCommand("Aaj paneer nahi hai");
  expect(r.provider).toBe("gemini");
  expect(r.fallbackUsed).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await db.inventoryItem.findMany()).toEqual(before);
});
it("rejects invalid AI output and stops after both providers fail", async () => {
  vi.stubEnv("GROQ_API_KEY", "unit-test");
  vi.stubEnv("GEMINI_API_KEY", "unit-test");
  vi.stubEnv("AI_FALLBACK_ENABLED", "true");
  vi.stubEnv("AI_COMMAND_PROVIDER", "groq");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"action":"DELETE_ALL"}' },
          },
        ],
      }),
    )
    .mockResolvedValueOnce(new Response("{}", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await expect(interpretCommand("Aaj paneer nahi hai")).rejects.toThrow(
    "invalid structured data",
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("fails clearly without keys and never makes a network request", async () => {
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("AI_COMMAND_PROVIDER", "groq");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(interpretCommand("Aaj paneer nahi hai")).rejects.toThrow(
    "not configured",
  );
  expect(fetch).not.toHaveBeenCalled();
});
