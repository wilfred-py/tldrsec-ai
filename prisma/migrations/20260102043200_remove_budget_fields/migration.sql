-- Remove budget-related columns from User table
-- These fields are no longer needed as we rely on OpenRouter's credit tracking

ALTER TABLE "User" DROP COLUMN IF EXISTS "processingBudget";
ALTER TABLE "User" DROP COLUMN IF EXISTS "budgetUsed";
ALTER TABLE "User" DROP COLUMN IF EXISTS "budgetResetAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "dailyProcessingBudget";
ALTER TABLE "User" DROP COLUMN IF EXISTS "dailyBudgetResetAt";
