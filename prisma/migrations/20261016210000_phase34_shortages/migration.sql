ALTER TABLE "CookSuggestion" ADD COLUMN "unavailableIngredientId" TEXT;
ALTER TABLE "CookSuggestion" ADD COLUMN "proposedRecipeIds" JSONB NOT NULL DEFAULT '[]';
CREATE TABLE "IngredientShortage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "householdId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "mealDate" TEXT NOT NULL,
  "mealType" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "affectedRequests" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IngredientShortage_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "IngredientShortage_householdId_mealDate_idx" ON "IngredientShortage"("householdId", "mealDate");
