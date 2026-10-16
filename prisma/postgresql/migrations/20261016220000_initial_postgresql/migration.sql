-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Calcutta',
    "cookLanguage" TEXT NOT NULL DEFAULT 'English',

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "dietaryPreference" TEXT NOT NULL,
    "allergies" JSONB NOT NULL,
    "dislikes" JSONB NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'Hindi',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "participating" BOOLEAN NOT NULL DEFAULT true,
    "fasting" BOOLEAN NOT NULL DEFAULT false,
    "allowEggs" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietaryRule" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'EXCLUDE',

    CONSTRAINT "DietaryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FastingRule" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "permittedIngredients" JSONB NOT NULL,
    "prohibitedIngredients" JSONB NOT NULL,
    "permittedCategories" JSONB NOT NULL,
    "prohibitedCategories" JSONB NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "startsOn" TEXT,
    "endsOn" TEXT,
    "mealType" TEXT,

    CONSTRAINT "FastingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "availability" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "purchaseDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mealCategory" TEXT NOT NULL,
    "defaultServings" INTEGER NOT NULL,
    "prepMinutes" INTEGER NOT NULL,
    "cookMinutes" INTEGER NOT NULL,
    "advancePreparation" TEXT NOT NULL,
    "dietaryMetadata" JSONB NOT NULL,
    "substitutions" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "preferredLanguage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "rawText" TEXT,
    "quantityStatus" TEXT NOT NULL DEFAULT 'KNOWN',

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeInstruction" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "RecipeInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdRecipeOverride" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "originalRecipeId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "preferred" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdRecipeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "recipeId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "stateVersion" INTEGER NOT NULL,
    "mealType" TEXT NOT NULL DEFAULT 'dinner',
    "servings" INTEGER NOT NULL DEFAULT 1,
    "maxMinutes" INTEGER NOT NULL DEFAULT 60,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanDish" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "recipeId" TEXT,
    "servings" INTEGER NOT NULL,
    "memberIds" JSONB NOT NULL,
    "recipeSnapshot" JSONB NOT NULL,

    CONSTRAINT "MealPlanDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeGenerationRecord" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestedDish" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warnings" JSONB NOT NULL,

    CONSTRAINT "RecipeGenerationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealParticipant" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberNameSnapshot" TEXT NOT NULL,

    CONSTRAINT "MealParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryEvent" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "type" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "stateVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "stateVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'English',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealRequest" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "mealDate" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "preferredTime" TEXT NOT NULL,
    "attendance" TEXT NOT NULL DEFAULT 'HOME',
    "requestedDishName" TEXT NOT NULL,
    "recipeId" TEXT,
    "servings" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealRequestStatusHistory" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealRequestStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealSchedule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "mealDate" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "maxMinutes" INTEGER NOT NULL,
    "stateVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealScheduleDish" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "recipeId" TEXT,
    "servings" DOUBLE PRECISION NOT NULL,
    "participants" JSONB NOT NULL,
    "recipeSnapshot" JSONB NOT NULL,
    "preparationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MealScheduleDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookReport" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeImportRecord" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "originalUrl" TEXT,
    "cuisine" TEXT NOT NULL,
    "diet" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeAlias" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "RecipeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeGenerationDraft" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeGenerationDraft_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "HouseholdRecipeDraft" (
    "token" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdRecipeDraft_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "CookSuggestion" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestRevision" INTEGER NOT NULL,
    "ingredientFrom" TEXT NOT NULL,
    "ingredientTo" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "familyNote" TEXT NOT NULL DEFAULT '',
    "acceptedRecipeId" TEXT,
    "unavailableIngredientId" TEXT,
    "proposedRecipeIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CookSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientShortage" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "mealDate" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "affectedRequests" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientShortage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FastingRule_memberId_key" ON "FastingRule"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_householdId_ingredientId_key" ON "InventoryItem"("householdId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "RecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeInstruction_recipeId_position_key" ON "RecipeInstruction"("recipeId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdRecipeOverride_recipeId_key" ON "HouseholdRecipeOverride"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdRecipeOverride_householdId_originalRecipeId_key" ON "HouseholdRecipeOverride"("householdId", "originalRecipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeGenerationRecord_recipeId_key" ON "RecipeGenerationRecord"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeGenerationRecord_householdId_requestKey_key" ON "RecipeGenerationRecord"("householdId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "MealParticipant_mealPlanId_memberId_key" ON "MealParticipant"("mealPlanId", "memberId");

-- CreateIndex
CREATE INDEX "ActivityLog_householdId_createdAt_idx" ON "ActivityLog"("householdId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_memberId_key" ON "UserAccount"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_username_key" ON "UserAccount"("username");

-- CreateIndex
CREATE INDEX "MealRequest_householdId_memberId_mealDate_mealType_idx" ON "MealRequest"("householdId", "memberId", "mealDate", "mealType");

-- CreateIndex
CREATE INDEX "MealSchedule_householdId_mealDate_status_idx" ON "MealSchedule"("householdId", "mealDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeImportRecord_recipeId_key" ON "RecipeImportRecord"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeImportRecord_dataset_sourceKey_key" ON "RecipeImportRecord"("dataset", "sourceKey");

-- CreateIndex
CREATE INDEX "RecipeAlias_name_idx" ON "RecipeAlias"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeAlias_recipeId_name_key" ON "RecipeAlias"("recipeId", "name");

-- CreateIndex
CREATE INDEX "IngredientShortage_householdId_mealDate_idx" ON "IngredientShortage"("householdId", "mealDate");

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietaryRule" ADD CONSTRAINT "DietaryRule_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastingRule" ADD CONSTRAINT "FastingRule_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeInstruction" ADD CONSTRAINT "RecipeInstruction_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRecipeOverride" ADD CONSTRAINT "HouseholdRecipeOverride_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRecipeOverride" ADD CONSTRAINT "HouseholdRecipeOverride_originalRecipeId_fkey" FOREIGN KEY ("originalRecipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRecipeOverride" ADD CONSTRAINT "HouseholdRecipeOverride_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanDish" ADD CONSTRAINT "MealPlanDish_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanDish" ADD CONSTRAINT "MealPlanDish_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeGenerationRecord" ADD CONSTRAINT "RecipeGenerationRecord_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeGenerationRecord" ADD CONSTRAINT "RecipeGenerationRecord_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealParticipant" ADD CONSTRAINT "MealParticipant_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealParticipant" ADD CONSTRAINT "MealParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRequest" ADD CONSTRAINT "MealRequest_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRequest" ADD CONSTRAINT "MealRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRequest" ADD CONSTRAINT "MealRequest_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRequestStatusHistory" ADD CONSTRAINT "MealRequestStatusHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MealRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealSchedule" ADD CONSTRAINT "MealSchedule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealScheduleDish" ADD CONSTRAINT "MealScheduleDish_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MealSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealScheduleDish" ADD CONSTRAINT "MealScheduleDish_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookReport" ADD CONSTRAINT "CookReport_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookReport" ADD CONSTRAINT "CookReport_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MealSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeImportRecord" ADD CONSTRAINT "RecipeImportRecord_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeAlias" ADD CONSTRAINT "RecipeAlias_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeGenerationDraft" ADD CONSTRAINT "RecipeGenerationDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRecipeDraft" ADD CONSTRAINT "HouseholdRecipeDraft_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookSuggestion" ADD CONSTRAINT "CookSuggestion_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookSuggestion" ADD CONSTRAINT "CookSuggestion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MealRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientShortage" ADD CONSTRAINT "IngredientShortage_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

