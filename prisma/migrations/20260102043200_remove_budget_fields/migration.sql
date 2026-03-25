-- Remove budget-related columns from User table
-- These fields are no longer needed as we rely on OpenRouter's credit tracking

ALTER TABLE "app"."User" DROP COLUMN IF EXISTS "processingBudget";
ALTER TABLE "app"."User" DROP COLUMN IF EXISTS "budgetUsed";
ALTER TABLE "app"."User" DROP COLUMN IF EXISTS "budgetResetAt";
ALTER TABLE "app"."User" DROP COLUMN IF EXISTS "dailyProcessingBudget";
ALTER TABLE "app"."User" DROP COLUMN IF EXISTS "dailyBudgetResetAt";
