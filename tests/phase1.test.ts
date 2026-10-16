import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
const testFile = resolve(`prisma/test-${process.pid}.db`);
process.env.DATABASE_URL = `file:${testFile.replaceAll("\\", "/")}`;
const { db } = await import("../src/lib/db");
const s = await import("../src/lib/db/service");
const { convertQuantity, expiryState } = await import(
  "../src/lib/inventory/units"
);
const { GET, POST, PATCH, DELETE } = await import(
  "../src/app/api/[...path]/route"
);
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
}, 60000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(testFile, { force: true });
  rmSync(`${testFile}-journal`, { force: true });
});
const profile = {
  name: "Test Member",
  relationship: "Cousin",
  dietaryPreference: "Vegetarian",
  allergies: ["sesame"],
  dislikes: ["okra"],
  preferredLanguage: "English",
  active: true,
  participating: true,
  fasting: false,
  excludedIngredients: [],
  excludedCategories: [],
  fastingRule: {
    permittedIngredients: [],
    prohibitedIngredients: [],
    permittedCategories: [],
    prohibitedCategories: [],
    notes: "",
  },
};
describe("Household lifecycle and isolation", () => {
  it("seeds four fictional members, 15 local recipes and persistent data", async () => {
    expect((await s.getMembers()).length).toBe(4);
    expect((await s.getRecipes()).length).toBe(15);
    await db.$disconnect();
    expect((await s.getHousehold()).name).toBe("The Mehta Kitchen");
  });
  it("creates, edits dietary rules, deactivates/reactivates and deletes without touching shared data", async () => {
    const inventoryCount = await db.inventoryItem.count();
    const recipeCount = await db.recipe.count();
    const m = await s.saveMember(profile);
    expect(m.name).toBe(profile.name);
    expect(m.allergies).toEqual(["sesame"]);
    const updated = await s.saveMember(
      {
        dietaryPreference: "Jain",
        excludedIngredients: ["onion", "garlic"],
        excludedCategories: ["root vegetables"],
        fasting: true,
        fastingRule: {
          permittedIngredients: ["sabudana"],
          prohibitedIngredients: ["onion"],
          permittedCategories: [],
          prohibitedCategories: ["grains"],
          notes: "Individual rules",
        },
      },
      m.id,
    );
    expect(updated.dietaryRules.map((r) => r.value)).toContain(
      "root-vegetables",
    );
    expect(updated.fastingRule?.notes).toBe("Individual rules");
    expect(updated.allergies).toEqual(["sesame"]);
    expect((await s.saveMember({ active: false }, m.id)).participating).toBe(
      false,
    );
    expect((await s.saveMember({ active: true }, m.id)).participating).toBe(
      false,
    );
    expect(
      (await s.saveMember({ participating: true }, m.id)).participating,
    ).toBe(true);
    await s.deleteMember(m.id);
    expect(await db.inventoryItem.count()).toBe(inventoryCount);
    expect(await db.recipe.count()).toBe(recipeCount);
    expect(await db.dietaryRule.count({ where: { memberId: m.id } })).toBe(0);
  });
  it("does not accept arbitrary household IDs or invalid dietary profiles", async () => {
    await expect(
      s.saveMember({ ...profile, householdId: "other" }),
    ).rejects.toThrow();
    await expect(
      s.saveMember({ ...profile, dietaryPreference: "anything" }),
    ).rejects.toThrow();
  });
});
describe("Inventory facts and conversion", () => {
  it("compares use-by calendar dates without rounding partial days forward", () => {
    const now = new Date(2026, 9, 16, 12);
    expect(expiryState("2026-10-19T14:30:00.000Z", now)).toBe("Use soon");
    expect(expiryState("2026-10-15", now)).toBe("Expired");
    expect(expiryState("2026-10-20", now)).toBeNull();
  });
  it("adds, converts, edits and deletes while preserving events", async () => {
    const i = await s.saveInventory({
      ingredientName: "Test flour",
      category: "Grains",
      quantity: 1,
      unit: "kg",
      availability: "AVAILABLE",
    });
    const converted = await s.saveInventory({ unit: "g" }, i.id);
    expect(converted.quantity).toBe(1000);
    const u = await s.saveInventory({ quantity: 500 }, i.id);
    expect(u.quantity).toBe(500);
    await expect(s.saveInventory({ unit: "ml" }, i.id)).rejects.toThrow(
      "Incompatible units",
    );
    await s.deleteInventory(i.id);
    expect(
      await db.inventoryEvent.count({ where: { inventoryItemId: null } }),
    ).toBeGreaterThan(0);
  });
  it("rejects negative amounts and preserves unknown separately from unavailable", async () => {
    await expect(
      s.saveInventory({
        ingredientName: "Bad",
        category: "Other",
        quantity: -1,
        unit: "g",
        availability: "AVAILABLE",
      }),
    ).rejects.toThrow();
    const i = await s.saveInventory({
      ingredientName: "Test spice",
      category: "Spices",
      quantity: null,
      unit: "g",
      availability: "UNKNOWN",
    });
    expect(i.quantity).toBeNull();
    expect(i.availability).toBe("UNKNOWN");
    const u = await s.saveInventory({ availability: "UNAVAILABLE" }, i.id);
    expect(u.quantity).toBeNull();
    expect(u.availability).toBe("UNAVAILABLE");
    await s.deleteInventory(i.id);
  });
  it("converts only compatible dimensions and keeps unknown quantities null", () => {
    expect(convertQuantity(1, "L", "ml")).toBe(1000);
    expect(convertQuantity(1, "cups", "tbsp")).toBe(16);
    expect(convertQuantity(null, "g", "kg")).toBeNull();
    expect(() => convertQuantity(1, "pieces", "g")).toThrow();
  });
  it("validates dates, uniqueness and canonical ingredient identities", async () => {
    await expect(
      s.saveInventory({
        ingredientName: "Rice",
        category: "Grains",
        quantity: 1,
        unit: "kg",
        availability: "AVAILABLE",
      }),
    ).rejects.toThrow();
    await expect(
      s.saveInventory({
        ingredientName: "Test",
        category: "Other",
        quantity: 1,
        unit: "g",
        availability: "AVAILABLE",
        expiryDate: "2026-02-31",
      }),
    ).rejects.toThrow();
  });
});
describe("Recipe memory", () => {
  it("creates and updates a household override without changing the local recipe", async () => {
    const original = await s.getRecipe("paneer-bhurji");
    const payload = {
      originalRecipeId: original.id,
      name: "Our paneer bhurji",
      description: "300 g paneer and no onion",
      defaultServings: 4,
      ingredients: original.ingredients
        .filter((i) => i.ingredientId !== "onion")
        .map((i) => ({
          ingredientId: i.ingredientId,
          quantity: i.ingredientId === "paneer" ? 300 : i.quantity,
          unit: i.unit,
        })),
      instructions: [
        "Cook vegetables without onion.",
        "Add 300 g crumbled paneer and cook gently.",
      ],
    };
    const custom = await s.saveRecipe(payload);
    expect(custom.source).toBe("HOUSEHOLD_CUSTOM");
    expect(custom.custom?.originalRecipeId).toBe(original.id);
    expect(custom.ingredients.some((i) => i.ingredientId === "onion")).toBe(
      false,
    );
    expect(
      (await s.getRecipe(custom.id)).ingredients.find(
        (i) => i.ingredientId === "paneer",
      )?.quantity,
    ).toBe(300);
    await s.saveRecipe({ ...payload, name: "Our preferred bhurji" }, custom.id);
    expect((await s.getRecipe(custom.id)).name).toBe("Our preferred bhurji");
    expect(await s.getRecipe(original.id)).toEqual(original);
    await expect(s.saveRecipe(payload, original.id)).rejects.toThrow(
      "Household recipe not found",
    );
  });
});
describe("REST route responses and atomic activity", () => {
  const request = (path: string, method: string, body?: unknown) =>
    new Request(`http://localhost/api/${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
  it("accepts browser origins matching HTTP Host when Next uses an internal URL", async () => {
    const result = await POST(
      new Request("http://localhost:3000/api/members", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      ctx("members"),
    );
    expect(result.status).toBe(422);
  });
  it("routes inventory and custom-recipe mutations and rejects duplicate copies", async () => {
    const added = await POST(
      request("inventory", "POST", {
        ingredientName: "API cumin",
        category: "Spices",
        quantity: 100,
        unit: "g",
        availability: "AVAILABLE",
      }),
      ctx("inventory"),
    );
    expect(added.status).toBe(201);
    const item = (await added.json()).data;
    expect(
      (
        await PATCH(
          request(`inventory/${item.id}`, "PATCH", {
            quantity: null,
            availability: "UNKNOWN",
          }),
          ctx("inventory", item.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await DELETE(
          request(`inventory/${item.id}`, "DELETE"),
          ctx("inventory", item.id),
        )
      ).status,
    ).toBe(200);
    const original = await s.getRecipe("jeera-rice");
    const payload = {
      originalRecipeId: original.id,
      name: "Our rice",
      description: original.description,
      defaultServings: 4,
      ingredients: original.ingredients.map((i) => ({
        ingredientId: i.ingredientId,
        quantity: i.quantity,
        unit: i.unit,
      })),
      instructions: original.instructions.map((i) => i.text),
    };
    const result = await POST(
      request("recipes/custom", "POST", payload),
      ctx("recipes", "custom"),
    );
    expect(result.status).toBe(201);
    const custom = (await result.json()).data;
    expect(
      (
        await PATCH(
          request(`recipes/custom/${custom.id}`, "PATCH", {
            ...payload,
            name: "Our rice updated",
          }),
          ctx("recipes", "custom", custom.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await POST(
          request("recipes/custom", "POST", payload),
          ctx("recipes", "custom"),
        )
      ).status,
    ).toBe(409);
    expect(await s.getRecipe(original.id)).toEqual(original);
  });
  it("handles HTTP CRUD and malformed requests with consistent envelopes", async () => {
    const created = await POST(
      request("members", "POST", profile),
      ctx("members"),
    );
    expect(created.status).toBe(201);
    const json = await created.json();
    expect(json.error).toBeNull();
    const id = json.data.id;
    expect(
      (await GET(request(`members/${id}`, "GET"), ctx("members", id))).status,
    ).toBe(200);
    expect(
      (
        await PATCH(
          request(`members/${id}`, "PATCH", { name: "Updated via API" }),
          ctx("members", id),
        )
      ).status,
    ).toBe(200);
    expect(
      (await DELETE(request(`members/${id}`, "DELETE"), ctx("members", id)))
        .status,
    ).toBe(200);
    expect(
      (await GET(request("members/missing", "GET"), ctx("members", "missing")))
        .status,
    ).toBe(404);
    expect(
      (
        await POST(
          new Request("http://localhost/api/members", {
            method: "POST",
            body: "{",
          }),
          ctx("members"),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(request("members", "POST", {}), ctx("members"))).status,
    ).toBe(422);
    expect(
      (
        await POST(
          new Request("http://localhost/api/members", {
            method: "POST",
            headers: { origin: "https://untrusted.example" },
            body: JSON.stringify(profile),
          }),
          ctx("members"),
        )
      ).status,
    ).toBe(403);
  });
  it("persists ordered activity and does not increment state for failed writes", async () => {
    const before = (await s.getHousehold()).version;
    await expect(s.saveMember({ name: "" })).rejects.toThrow();
    expect((await s.getHousehold()).version).toBe(before);
    const activity = await s.getActivity();
    const versions = activity.map((a) => a.stateVersion);
    expect(new Set(versions).size).toBe(versions.length);
    expect(activity.some((a) => a.type === "MEMBER_DEACTIVATED")).toBe(true);
    expect(activity.some((a) => a.type === "INVENTORY_QUANTITY_CHANGED")).toBe(
      true,
    );
    expect(activity.some((a) => a.type === "CUSTOM_RECIPE_CREATED")).toBe(true);
  });
});
