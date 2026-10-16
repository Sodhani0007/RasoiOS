import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { rmSync, readFileSync } from "node:fs";
const file = resolve(`prisma/test-phase25-${process.pid}.db`);
process.env.DATABASE_URL = `file:${file.replaceAll("\\", "/")}`;
const { db } = await import("../src/lib/db");
const { householdContext } = await import("../src/lib/household-context");
const routes = await import("../src/app/api/[...path]/route");
const coordination = await import("../src/lib/coordination/service");
const service = await import("../src/lib/db/service");
const { importDataset, parseIngredient } = await import(
  "../src/lib/recipes/importer"
);
const { resolveRecipe, searchRecipes } = await import(
  "../src/lib/recipes/resolver"
);
const { generateRecipe, updateGeneratedDraft, saveGeneratedRecipe } =
  await import("../src/lib/recipes/generator");
type Selection = { householdId: string; memberId?: string };
let admin: Selection,
  father: Selection,
  daughter: Selection,
  cook: Selection,
  outsider: Selection;
const date = "2026-10-20";
const as = <T>(selection: Selection, fn: () => T) =>
  householdContext.run(selection, fn);
async function call(
  a: Selection | null,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const req = new Request(`http://localhost/api/${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(a
        ? {
            "x-rasoi-household": a.householdId,
            ...(a.memberId ? { "x-rasoi-member": a.memberId } : {}),
          }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const handler = routes[method as "GET" | "POST" | "PATCH" | "DELETE"];
  const response = await handler(req, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
  return {
    status: response.status,
    ...(await response.json()),
    headers: response.headers,
  };
}
const request = (extra: Record<string, unknown> = {}) => ({
  mealDate: date,
  mealType: "lunch",
  preferredTime: "13:00",
  requestedDishName: "Jeera Rice",
  recipeId: "jeera-rice",
  servings: 1,
  status: "SUBMITTED",
  ...extra,
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
  const members = await service.getMembers();
  admin = cook = { householdId: "demo-household" };
  father = {
    ...admin,
    memberId: members.find((m) => m.relationship === "Father")!.id,
  };
  daughter = {
    ...admin,
    memberId: members.find((m) => m.relationship === "Daughter")!.id,
  };
  await db.household.create({
    data: { id: "outside-household", name: "Other household" },
  });
  outsider = { householdId: "outside-household" };
}, 60000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(file, { force: true });
  rmSync(file + "-journal", { force: true });
});
describe("Login-free household and profile selection", () => {
  it("opens APIs without a session and removes authentication/account endpoints", async () => {
    for (const path of [
      "household",
      "members",
      "inventory",
      "cook/today",
      "cook/requests",
      "admin/meal-requests",
    ])
      expect((await call(null, path)).status).toBe(200);
    for (const path of [
      "auth/me",
      "auth/login",
      "auth/logout",
      "admin/accounts",
    ])
      expect((await call(null, path)).status).toBe(404);
    expect(
      (
        await call(null, "auth/login", "POST", {
          username: "unused",
          password: "unused",
        })
      ).status,
    ).toBe(404);
    expect((await call(null, "family/profile")).status).toBe(422);
  });
  it("selects existing profiles explicitly without claiming identity security", async () => {
    expect((await call(father, "members")).data).toHaveLength(4);
    expect((await call(father, "family/profile")).data.id).toBe(
      father.memberId,
    );
    expect((await call(daughter, "family/profile")).data.id).toBe(
      daughter.memberId,
    );
    expect(
      (await call({ ...outsider, memberId: father.memberId }, "family/profile"))
        .status,
    ).toBe(422);
    expect(
      (
        await call(father, "family/profile", "PATCH", {
          name: "Unexpected",
          memberId: daughter.memberId,
        })
      ).status,
    ).toBe(422);
  });
  it("scopes legacy APIs to the selected household", async () => {
    const h = await call(outsider, "household");
    expect(h.data.id).toBe("outside-household");
    expect(h.data.members).toHaveLength(0);
    expect((await call(outsider, `members/${father.memberId}`)).status).toBe(
      404,
    );
    const inventory = (await service.getInventory())[0];
    expect(
      (await call(outsider, `inventory/${inventory.id}`, "DELETE")).status,
    ).toBe(404);
  });
});
describe("Independent choices and approval workflow", () => {
  let firstId: string, secondId: string, scheduleId: string;
  it("preserves separate dishes, dates, preferred times and fractional portions", async () => {
    const first = await call(
      father,
      "family/meal-requests",
      "POST",
      request({ servings: 1.5, preferredTime: "13:30" }),
    );
    expect(first.status).toBe(201);
    firstId = first.data.id;
    const second = await call(
      daughter,
      "family/meal-requests",
      "POST",
      request({
        recipeId: "roti",
        requestedDishName: "Roti",
        preferredTime: "13:00",
      }),
    );
    expect(second.status).toBe(201);
    secondId = second.data.id;
    expect(firstId).not.toBe(secondId);
    expect(first.data.preferredTime).toBe("13:30");
    expect(first.data.mealDate).toBe(date);
    expect(second.data.recipeId).toBe("roti");
  });
  it("requires the matching selected profile for edits and cancellations", async () => {
    expect(
      (
        await call(
          daughter,
          `family/meal-requests/${firstId}`,
          "PATCH",
          request(),
        )
      ).status,
    ).toBe(404);
    expect(
      (await call(daughter, `family/meal-requests/${firstId}`, "DELETE"))
        .status,
    ).toBe(404);
    expect(
      (
        await call(outsider, `admin/meal-requests/${firstId}/status`, "PATCH", {
          status: "REJECTED",
          reason: "No",
        })
      ).status,
    ).toBe(404);
  });
  it("lets members edit their own unfinalized request", async () => {
    const result = await call(
      father,
      `family/meal-requests/${firstId}`,
      "PATCH",
      request({ servings: 2, preferredTime: "13:30" }),
    );
    expect(result.status).toBe(200);
    expect(result.data.revision).toBe(2);
    expect(
      (await call(father, `family/meals?date=${date}`)).data.requests,
    ).toHaveLength(1);
  });
  it("requires explicit shortage acknowledgement before family approval", async () => {
    expect(
      (
        await call(admin, `admin/meal-requests/${firstId}/status`, "PATCH", {
          status: "APPROVED",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call(admin, `admin/meal-requests/${firstId}/status`, "PATCH", {
          status: "APPROVED",
          acknowledgeShortages: true,
        })
      ).status,
    ).toBe(200);
  });
  it("preserves different dishes and hides proposals from the cook", async () => {
    const r = await call(admin, "admin/meal-schedules", "POST", {
      mealDate: date,
      mealType: "lunch",
      maxMinutes: 180,
    });
    expect(r.status).toBe(201);
    scheduleId = r.data.id;
    expect(r.data.dishes).toHaveLength(2);
    expect(r.data.snapshot.issues).toEqual([]);
    expect((await call(cook, `cook/meals/${scheduleId}`)).status).toBe(404);
  });
  it("approves a feasible schedule without deducting stock and exposes actionable cook details", async () => {
    const before = await service.getInventory();
    const approved = await call(
      admin,
      `admin/meal-schedules/${scheduleId}/approve`,
      "POST",
      { confirmed: true, acknowledgeShortages: true },
    );
    expect(approved.status).toBe(200);
    const c = await call(cook, `cook/meals/${scheduleId}`);
    expect(c.status).toBe(200);
    const dish = c.data.schedules[0].dishes[0];
    expect(dish.recipeSnapshot.instructions.length).toBeGreaterThan(0);
    expect(
      dish.recipeSnapshot.participants[0].preparationRules.length,
    ).toBeGreaterThan(0);
    expect(JSON.stringify(c.data)).not.toContain("relationship");
    expect(JSON.stringify(c.data)).not.toContain("passwordHash");
    expect(
      (
        await call(cook, `cook/preparation/${dish.id}`, "PATCH", {
          status: "COMPLETED",
        })
      ).status,
    ).toBe(200);
    expect(await service.getInventory()).toEqual(before);
    expect(
      (
        await call(
          outsider,
          `admin/meal-schedules/${scheduleId}/approve`,
          "POST",
          { confirmed: true },
        )
      ).status,
    ).toBe(404);
    const personal = await call(father, `family/meals?date=${date}`);
    expect(personal.data.assignments).toHaveLength(1);
    expect(personal.data.assignments[0].recipe.participants).toBeUndefined();
    expect(personal.data.assignments[0].preferredTime).toBe("13:30");
  });
  it("records cook shortage/correction reports without mutating recipes", async () => {
    expect(
      (
        await call(cook, "cook/reports", "POST", {
          scheduleId,
          type: "UNAVAILABLE_INGREDIENT",
          message: "Cumin is unavailable",
        })
      ).status,
    ).toBe(201);
    const s = await call(admin, `admin/meal-schedules?date=${date}`);
    expect(
      s.data.schedules.find((s: { id: string }) => s.id === scheduleId).reports,
    ).toHaveLength(1);
  });
  it("aggregates a shared recipe and excludes skipped meals", async () => {
    const day = "2026-10-21";
    await call(
      father,
      "family/meal-requests",
      "POST",
      request({ mealDate: day, servings: 1.5 }),
    );
    await call(
      daughter,
      "family/meal-requests",
      "POST",
      request({ mealDate: day, servings: 2 }),
    );
    const proposal = await call(admin, "admin/meal-schedules", "POST", {
      mealDate: day,
      mealType: "lunch",
      maxMinutes: 60,
    });
    expect(proposal.data.dishes).toHaveLength(1);
    expect(proposal.data.dishes[0].servings).toBe(3.5);
    const r = await call(
      father,
      "family/meal-requests",
      "POST",
      request({
        mealDate: "2026-10-22",
        attendance: "SKIP",
        requestedDishName: "",
        recipeId: null,
      }),
    );
    expect(r.status).toBe(201);
    const skipped = await call(admin, "admin/meal-schedules", "POST", {
      mealDate: "2026-10-22",
      mealType: "lunch",
      maxMinutes: 60,
    });
    expect(skipped.data.dishes).toHaveLength(0);
  });
  it("flags excessive workload and prevents stale or dietary-invalid approval", async () => {
    const tooShort = await call(admin, "admin/meal-schedules", "POST", {
      mealDate: "2026-10-21",
      mealType: "lunch",
      maxMinutes: 1,
    });
    expect(tooShort.data.snapshot.issues.join(" ")).toContain("workload");
    expect(
      (
        await call(
          admin,
          `admin/meal-schedules/${tooShort.data.id}/approve`,
          "POST",
          { confirmed: true, acknowledgeShortages: true },
        )
      ).status,
    ).toBe(422);
    const fresh = await call(admin, "admin/meal-schedules", "POST", {
      mealDate: "2026-10-21",
      mealType: "lunch",
      maxMinutes: 100,
    });
    const r = (await call(daughter, "family/meals?date=2026-10-21")).data
      .requests[0];
    await call(
      daughter,
      `family/meal-requests/${r.id}`,
      "PATCH",
      request({
        mealDate: "2026-10-21",
        recipeId: "chicken-curry",
        requestedDishName: "Chicken Curry",
      }),
    );
    expect(
      (
        await call(
          admin,
          `admin/meal-schedules/${fresh.data.id}/approve`,
          "POST",
          { confirmed: true, acknowledgeShortages: true },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(admin, `admin/meal-requests/${r.id}/status`, "PATCH", {
          status: "APPROVED",
          acknowledgeShortages: true,
        })
      ).status,
    ).toBe(422);
  });
});

describe("Cook operations keep family choices unchanged", () => {
  const day = "2026-11-02";
  let requestId: string,
    scheduleId: string,
    dishId: string,
    suggestionId: string;
  it("adds multiple dishes for one profile and keeps dates and portions separate", async () => {
    const a = await call(
      father,
      "family/meal-requests",
      "POST",
      request({ mealDate: day }),
    );
    const b = await call(
      father,
      "family/meal-requests",
      "POST",
      request({
        mealDate: day,
        recipeId: "roti",
        requestedDishName: "Roti",
        servings: 0.5,
      }),
    );
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    requestId = a.data.id;
    const own = await call(father, "family/meals?date=" + day);
    expect(own.data.requests).toHaveLength(2);
    expect(
      (await call(daughter, "family/meals?date=" + day)).data.requests,
    ).toHaveLength(0);
    expect(
      (
        await call(
          father,
          "family/meal-requests",
          "POST",
          request({ mealDate: day, attendance: "SKIP" }),
        )
      ).status,
    ).toBe(409);
    const proposal = await call(admin, "admin/meal-schedules", "POST", {
      mealDate: day,
      mealType: "lunch",
      maxMinutes: 180,
    });
    expect(proposal.data.dishes).toHaveLength(2);
    scheduleId = proposal.data.id;
    dishId = proposal.data.dishes[0].id;
    expect(
      (
        await call(
          admin,
          "admin/meal-schedules/" + scheduleId + "/approve",
          "POST",
          { confirmed: true, acknowledgeShortages: true },
        )
      ).status,
    ).toBe(200);
  });
  it("rejects meal choice fields in every cook mutation and exposes no cook editing endpoints", async () => {
    const before = await db.mealRequest.findMany({ orderBy: { id: "asc" } });
    const operations = [
      ["cook/preparation/" + dishId, "PATCH", { status: "COOKING" }],
      [
        "cook/reports",
        "POST",
        {
          scheduleId,
          type: "UNAVAILABLE_INGREDIENT",
          message: "Paneer unavailable",
        },
      ],
      ["cook/notes", "POST", { scheduleId, message: "Keep the rice warm" }],
      [
        "cook/substitutions",
        "POST",
        {
          requestId,
          ingredientFrom: "cumin",
          ingredientTo: "coriander",
          message: "Cumin is missing",
        },
      ],
      ["cook/preferences", "PATCH", { preferredLanguage: "English" }],
    ] as const;
    for (const [path, method, payload] of operations)
      for (const field of [
        "recipeId",
        "requestedDishName",
        "mealDate",
        "preferredTime",
        "servings",
        "memberId",
        "dietaryPreference",
      ]) {
        expect(
          (
            await call(cook, path, method, {
              ...payload,
              [field]: field === "servings" ? 9 : "changed",
            })
          ).status,
        ).toBe(422);
      }
    for (const method of ["POST", "PATCH", "DELETE"])
      expect(
        (await call(cook, "cook/meal-requests/" + requestId, method, request()))
          .status,
      ).toBe(404);
    expect(await db.mealRequest.findMany({ orderBy: { id: "asc" } })).toEqual(
      before,
    );
  });
  it("records all progress states, shortage and instruction reports, notes and suggestions separately", async () => {
    const before = await db.mealRequest.findMany({ orderBy: { id: "asc" } });
    const stock = await service.getInventory();
    for (const status of ["PREPARING", "COOKING", "READY", "COMPLETED"]) {
      const r = await call(cook, "cook/preparation/" + dishId, "PATCH", {
        status,
      });
      expect(r.status).toBe(200);
      expect(r.data.preparationStatus).toBe(status);
    }
    for (const type of ["UNAVAILABLE_INGREDIENT", "RECIPE_CORRECTION"])
      expect(
        (
          await call(cook, "cook/reports", "POST", {
            scheduleId,
            type,
            message:
              "Please review cumin availability and the spice instruction",
          })
        ).status,
      ).toBe(201);
    expect(
      (
        await call(cook, "cook/notes", "POST", {
          scheduleId,
          message: "Rice kept covered for serving",
        })
      ).status,
    ).toBe(201);
    const suggestion = await call(cook, "cook/substitutions", "POST", {
      requestId,
      ingredientFrom: "rice",
      ingredientTo: "atta",
      message: "Consider roti while rice is unavailable",
    });
    expect(suggestion.status).toBe(201);
    suggestionId = suggestion.data.id;
    expect(await db.mealRequest.findMany({ orderBy: { id: "asc" } })).toEqual(
      before,
    );
    expect(await service.getInventory()).toEqual(stock);
    const updates = await call(father, "family/cook-updates?date=" + day);
    expect(updates.data.reports).toHaveLength(3);
    expect(updates.data.suggestions).toHaveLength(1);
    expect(
      (await call(cook, "cook/meals/" + scheduleId)).data.schedules[0]
        .needsRecheck,
    ).toBe(true);
    expect(
      await db.activityLog.count({ where: { type: { startsWith: "COOK_" } } }),
    ).toBeGreaterThanOrEqual(8);
  });
  it("requires explicit family confirmation and a dietary-verified replacement", async () => {
    const before = await db.mealRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    const path = "family/suggestions/" + suggestionId + "/review";
    expect(
      (await call(father, path, "POST", { action: "ACCEPT", recipeId: "roti" }))
        .status,
    ).toBe(422);
    expect(
      (
        await call(daughter, path, "POST", {
          action: "ACCEPT",
          confirmed: true,
          recipeId: "roti",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(father, path, "POST", {
          action: "ACCEPT",
          confirmed: true,
          recipeId: "chicken-curry",
        })
      ).status,
    ).toBe(422);
    expect(
      await db.mealRequest.findUnique({ where: { id: requestId } }),
    ).toEqual(before);
    expect(
      (
        await call(father, path, "POST", {
          action: "ACCEPT",
          confirmed: true,
          recipeId: "roti",
        })
      ).status,
    ).toBe(200);
    const after = await db.mealRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    expect(after.recipeId).toBe("roti");
    expect(after.status).toBe("SUBMITTED");
    expect(after.servings).toBe(before.servings);
    expect(after.preferredTime).toBe(before.preferredTime);
    expect((await call(cook, "cook/meals/" + scheduleId)).status).toBe(404);
    expect(
      (
        await call(father, path, "POST", {
          action: "ACCEPT",
          confirmed: true,
          recipeId: "roti",
        })
      ).status,
    ).toBe(409);
  });
  it("lets family edit or cancel an approved choice and removes obsolete cooking instructions", async () => {
    const proposal = await call(admin, "admin/meal-schedules", "POST", {
      mealDate: day,
      mealType: "lunch",
      maxMinutes: 180,
    });
    expect(
      (
        await call(
          admin,
          "admin/meal-schedules/" + proposal.data.id + "/approve",
          "POST",
          { confirmed: true, acknowledgeShortages: true },
        )
      ).status,
    ).toBe(200);
    const original = await db.mealRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    const r = await call(
      father,
      "family/meal-requests/" + requestId,
      "PATCH",
      request({ mealDate: day, preferredTime: "14:15", servings: 1.25 }),
    );
    expect(r.status).toBe(200);
    expect(r.data.preferredTime).toBe("14:15");
    expect(r.data.revision).toBeGreaterThan(original.revision);
    expect((await call(cook, "cook/meals/" + proposal.data.id)).status).toBe(
      404,
    );
    const next = await call(admin, "admin/meal-schedules", "POST", {
      mealDate: day,
      mealType: "lunch",
      maxMinutes: 180,
    });
    await call(
      admin,
      "admin/meal-schedules/" + next.data.id + "/approve",
      "POST",
      { confirmed: true, acknowledgeShortages: true },
    );
    expect(
      (await call(father, "family/meal-requests/" + requestId, "DELETE"))
        .status,
    ).toBe(200);
    expect((await call(cook, "cook/meals/" + next.data.id)).status).toBe(404);
  });
});
describe("Real dataset import and resolution", () => {
  it("imports actual source rows, preserves raw amounts and deduplicates repeat imports", async () => {
    const rows = JSON.parse(
      readFileSync("tests/fixtures/mendeley-real.json", "utf8"),
    );
    const first = await importDataset(rows);
    expect(first.imported).toBe(2);
    expect(first.skipped).toBe(0);
    const repeat = await importDataset(rows);
    expect(repeat.imported).toBe(0);
    expect(repeat.duplicates).toBe(2);
    expect(await db.recipe.count({ where: { source: "LOCAL" } })).toBe(15);
    const results = await searchRecipes("Masala Karela");
    expect(results.recipes[0].source).toBe("MENDELEY");
    expect(
      results.recipes[0].ingredients.some(
        (i) => i.quantity === null && i.rawText?.includes("taste"),
      ),
    ).toBe(true);
  });
  it("parses explicit fractions but never invents range, count or taste amounts", () => {
    expect(parseIngredient("1 1/2 cups Rice").quantity).toBe(1.5);
    expect(parseIngredient("Salt - to taste").quantity).toBeNull();
    expect(parseIngredient("2-3 teaspoons Cumin").quantity).toBeNull();
    expect(parseIngredient("2 Onion").quantity).toBeNull();
  });
  it("prioritizes a household approved copy, then dataset over matching seed", async () => {
    const r = (await resolveRecipe("Masala Karela")).recipe!;
    expect(r.source).toBe("MENDELEY");
    const custom = await as(admin, () =>
      service.saveRecipe({
        originalRecipeId: r.id,
        name: r.name,
        description: "Household reviewed fixture",
        defaultServings: 2,
        ingredients: [{ ingredientId: "rice", quantity: 100, unit: "g" }],
        instructions: ["Cook the rice until tender."],
      }),
    );
    expect(
      (await as(admin, () => resolveRecipe("Masala Karela"))).recipe?.id,
    ).toBe(custom.id);
    expect(
      (await as(outsider, () => resolveRecipe("Masala Karela"))).recipe?.id,
    ).toBe(r.id);
    expect((await call(outsider, `recipes/${custom.id}`)).status).toBe(404);
  });
});
describe("Editable, profile-scoped AI drafts", () => {
  const candidate = {
    name: "Novel rice dish",
    description: "A controlled test fixture, not a live AI result.",
    defaultServings: 2,
    prepMinutes: 5,
    cookMinutes: 15,
    mealCategory: "lunch",
    ingredients: [
      {
        ingredientId: "rice",
        name: "Rice",
        quantity: 100,
        unit: "g",
        uncertain: false,
        note: "",
      },
    ],
    instructions: ["Cook rice in water until tender."],
    advancePreparation: "",
    substitutions: [],
    dietaryMetadata: [],
    source: "AI_GENERATED",
  };
  const input = {
    dishName: "Novel fixture rice bowl",
    memberIds: [] as string[],
    date,
    mealType: "lunch",
    servings: 2,
    maxMinutes: 60,
    cuisine: "Indian",
    preferredLanguage: "English",
  };
  it("uses local retrieval without invoking AI and gives clear missing-key errors", async () => {
    const result = await as(father, () =>
      generateRecipe(
        {
          ...input,
          dishName: "Jeera Rice",
          memberIds: [father.memberId!],
        },
        async () => {
          throw new Error("Must not be called");
        },
      ),
    );
    expect(result.existingRecipe?.id).toBe("jeera-rice");
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const r = await call(father, "recipes/generate", "POST", {
        ...input,
        memberIds: [father.memberId!],
      });
      expect(r.status).toBe(503);
      expect(r.error.message).toContain("not configured");
    } finally {
      if (key) process.env.OPENAI_API_KEY = key;
    }
  });
  it("persists a profile-scoped draft, rechecks edits, blocks dietary failures and requires confirmation", async () => {
    const result = await as(daughter, () =>
      generateRecipe(
        { ...input, memberIds: [daughter.memberId!] },
        async () => candidate,
      ),
    );
    const draft = result.draft!;
    expect(
      await db.householdRecipeDraft.count({ where: { token: draft.token } }),
    ).toBe(1);
    expect(
      (
        await call(father, "recipes/generated/update", "POST", {
          token: draft.token,
          recipe: candidate,
        })
      ).status,
    ).toBe(404);
    const unsafe = {
      ...candidate,
      ingredients: [
        {
          ...candidate.ingredients[0],
          name: "Chicken",
          ingredientId: "chicken",
        },
      ],
    };
    const rejected = await as(daughter, () =>
      updateGeneratedDraft({ token: draft.token, recipe: unsafe }),
    );
    expect(rejected.verification.status).toBe("REJECTED");
    await expect(
      as(daughter, () =>
        saveGeneratedRecipe({
          token: draft.token,
          confirmed: true,
          acknowledgeUncertainty: true,
        }),
      ),
    ).rejects.toThrow("satisfies");
    const edited = await as(daughter, () =>
      updateGeneratedDraft({
        token: draft.token,
        recipe: { ...candidate, name: "Reviewed rice bowl" },
      }),
    );
    expect(edited.verification.status).toBe("VERIFIED");
    expect(
      (
        await call(daughter, "recipes/generated/save", "POST", {
          token: draft.token,
        })
      ).status,
    ).toBe(422);
    const saved = await as(daughter, () =>
      saveGeneratedRecipe({ token: draft.token, confirmed: true }),
    );
    expect(saved.name).toBe("Reviewed rice bowl");
    expect(saved.generation).not.toBeNull();
    expect(
      (await as(outsider, () => searchRecipes("Reviewed rice"))).recipes,
    ).toHaveLength(0);
  });
  it("keeps acknowledged uncertain composition unverified after saving", async () => {
    const result = await as(father, () =>
      generateRecipe(
        {
          ...input,
          dishName: "Uncertain fixture rice",
          memberIds: [father.memberId!],
        },
        async () => ({
          ...candidate,
          name: "Uncertain fixture rice",
          ingredients: [{ ...candidate.ingredients[0], uncertain: true }],
        }),
      ),
    );
    const saved = await as(father, () =>
      saveGeneratedRecipe({
        token: result.draft!.token,
        confirmed: true,
        acknowledgeUncertainty: true,
      }),
    );
    expect(saved.ingredients[0].quantityStatus).toBe("NEEDS_CONFIRMATION");
    const v = await call(father, "recipes/verify", "POST", {
      recipeId: saved.id,
      memberIds: [father.memberId],
      date,
      mealType: "lunch",
    });
    expect(v.data.status).toBe("NEEDS_CONFIRMATION");
  });
});
