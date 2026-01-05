-- Rollback script for 20260102043200_remove_budget_fields
-- Restores budget-related columns to User table

-- Add back budget-related columns with appropriate defaults
ALTER TABLE app."User" ADD COLUMN IF NOT EXISTS "processingBudget" DECIMAL(10,2) DEFAULT 10.00;
ALTER TABLE app."User" ADD COLUMN IF NOT EXISTS "budgetUsed" DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE app."User" ADD COLUMN IF NOT EXISTS "budgetResetAt" TIMESTAMP(3);
ALTER TABLE app."User" ADD COLUMN IF NOT EXISTS "dailyProcessingBudget" DECIMAL(10,2) DEFAULT 5.00;
ALTER TABLE app."User" ADD COLUMN IF NOT EXISTS "dailyBudgetResetAt" TIMESTAMP(3);

-- Update budget reset times for existing users
UPDATE app."User" 
SET 
  "budgetResetAt" = NOW() + INTERVAL '30 days',
  "dailyBudgetResetAt" = DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
WHERE 
  "budgetResetAt" IS NULL OR "dailyBudgetResetAt" IS NULL;