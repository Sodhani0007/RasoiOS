import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

it("preserves populated pre-upgrade tables and copies legacy drafts without account dependencies", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const name of [
      "20261016061033_init",
      "20261016065010_phase2_planning",
      "20261016100000_phase25_household_portals",
    ])
      db.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
    db.exec(`
      INSERT INTO Household(id,name,updatedAt) VALUES ('h','Existing home',CURRENT_TIMESTAMP);
      INSERT INTO HouseholdMember(id,householdId,name,dietaryPreference,allergies,dislikes,updatedAt) VALUES ('m','h','Existing member','Jain','["peanuts"]','[]',CURRENT_TIMESTAMP);
      INSERT INTO DietaryRule(id,memberId,target,value) VALUES ('rule','m','INGREDIENT','onion');
      INSERT INTO Ingredient(id,name,category) VALUES ('rice','Rice','grain');
      INSERT INTO InventoryItem(id,householdId,ingredientId,quantity,unit,updatedAt) VALUES ('stock','h','rice',1500,'g',CURRENT_TIMESTAMP);
      INSERT INTO Recipe(id,name,description,mealCategory,defaultServings,prepMinutes,cookMinutes,advancePreparation,dietaryMetadata,substitutions,updatedAt) VALUES ('recipe','Existing rice','Preserve recipe','lunch',2,5,20,'','[]','[]',CURRENT_TIMESTAMP);
      INSERT INTO RecipeIngredient(id,recipeId,ingredientId,quantity,unit) VALUES ('ri','recipe','rice',200,'g');
      INSERT INTO RecipeInstruction(id,recipeId,position,text) VALUES ('step','recipe',1,'Cook the rice.');
      INSERT INTO MealRequest(id,householdId,memberId,mealDate,mealType,preferredTime,requestedDishName,recipeId,servings,updatedAt) VALUES ('request','h','m','2026-11-02','lunch','13:30','Existing rice','recipe',1.5,CURRENT_TIMESTAMP);
      INSERT INTO MealRequestStatusHistory(id,requestId,status,reason,actorId) VALUES ('history','request','SUBMITTED','Existing history','old-user');
      INSERT INTO UserAccount(id,householdId,memberId,username,displayName,passwordHash,role) VALUES ('old-user','h','m','legacy','Legacy account','inert-test-value','FAMILY_MEMBER');
      INSERT INTO UserSession(id,userId,expiresAt) VALUES ('old-session','old-user','2026-12-01');
      INSERT INTO RecipeGenerationDraft(token,userId,payload,expiresAt) VALUES ('draft','old-user','{"ownerId":"old-user","householdId":"h","recipe":{"name":"Existing draft"}}','2026-12-01');
    `);
    const tables = [
      "HouseholdMember",
      "DietaryRule",
      "Ingredient",
      "InventoryItem",
      "Recipe",
      "RecipeIngredient",
      "RecipeInstruction",
      "MealRequest",
      "MealRequestStatusHistory",
      "UserAccount",
      "UserSession",
      "RecipeGenerationDraft",
    ];
    const before = tables.map((t) => db.prepare(`SELECT * FROM "${t}"`).all());
    db.exec(
      readFileSync(
        "prisma/migrations/20261016190000_login_free_views/migration.sql",
        "utf8",
      ),
    );
    tables.forEach((t, i) =>
      expect(db.prepare(`SELECT * FROM "${t}"`).all()).toEqual(before[i]),
    );
    expect(
      db.prepare("SELECT name FROM Household WHERE id='h'").get()?.name,
    ).toBe("Existing home");
    const draft = db.prepare("SELECT * FROM HouseholdRecipeDraft").get()!;
    expect(draft.ownerId).toBe("profile:m");
    expect(JSON.parse(String(draft.payload)).recipe.name).toBe(
      "Existing draft",
    );
    db.exec(
      `INSERT INTO MealRequest(id,householdId,memberId,mealDate,mealType,preferredTime,requestedDishName,servings,updatedAt) VALUES ('second','h','m','2026-11-02','lunch','13:30','Second dish',1,CURRENT_TIMESTAMP)`,
    );
    expect(db.prepare("SELECT count(*) AS n FROM MealRequest").get()?.n).toBe(
      2,
    );
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});
