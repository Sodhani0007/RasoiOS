-- Additive migration. Keep every legacy account, session, draft and meal record.
ALTER TABLE "Household" ADD COLUMN "cookLanguage" TEXT NOT NULL DEFAULT 'English';
DROP INDEX "MealRequest_householdId_memberId_mealDate_mealType_key";
CREATE INDEX "MealRequest_householdId_memberId_mealDate_mealType_idx" ON "MealRequest"("householdId", "memberId", "mealDate", "mealType");
CREATE TABLE "HouseholdRecipeDraft" (
  "token" TEXT NOT NULL PRIMARY KEY,
  "householdId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  CONSTRAINT "HouseholdRecipeDraft_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "HouseholdRecipeDraft" ("token", "householdId", "ownerId", "payload", "expiresAt")
SELECT d."token", u."householdId", COALESCE('profile:' || u."memberId", 'household'),
  json_set(d."payload", '$.ownerId', COALESCE('profile:' || u."memberId", 'household'), '$.householdId', u."householdId"), d."expiresAt"
FROM "RecipeGenerationDraft" d JOIN "UserAccount" u ON d."userId" = u."id";
CREATE TABLE "CookSuggestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "householdId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestRevision" INTEGER NOT NULL,
  "ingredientFrom" TEXT NOT NULL,
  "ingredientTo" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "familyNote" TEXT NOT NULL DEFAULT '',
  "acceptedRecipeId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" DATETIME,
  CONSTRAINT "CookSuggestion_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CookSuggestion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MealRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
