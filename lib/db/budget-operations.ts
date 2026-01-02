/**
 * Budget Operations Module - DEPRECATED
 *
 * This module has been deprecated. OpenRouter now handles credit limits directly.
 * See: docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md
 *
 * All functions are no-ops for backwards compatibility during transition.
 */

import { logger } from '../logging';

const budgetLogger = logger.child('budget-operations');

// Log deprecation warning once
let deprecationWarningLogged = false;
function logDeprecationWarning(functionName: string) {
  if (!deprecationWarningLogged) {
    budgetLogger.warn('Budget operations are deprecated. OpenRouter handles credit limits.', {
      calledFunction: functionName,
      migration: 'docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md'
    });
    deprecationWarningLogged = true;
  }
}

export interface BudgetUpdateContext {
  tier?: string;
  originalCost?: number;
  enableAuditLogging?: boolean;
  atomicBudgetRead?: boolean;
}

export interface BudgetUpdateResult {
  previousBudget: number;
  newBudget: number;
  success: boolean;
}

/**
 * @deprecated Budget tracking removed. OpenRouter handles credit limits.
 * This function is a no-op for backwards compatibility.
 */
export async function updateUserBudgetWithLock(
  _userId: string,
  _costToAdd: number,
  _expectedCurrentBudget: number | null,
  _dailyLimit: number,
  _context: BudgetUpdateContext = {}
): Promise<BudgetUpdateResult> {
  logDeprecationWarning('updateUserBudgetWithLock');

  // Return success with no-op values
  return {
    previousBudget: 0,
    newBudget: 0,
    success: true
  };
}

/**
 * @deprecated Budget tracking removed. OpenRouter handles credit limits.
 * This function is a no-op for backwards compatibility.
 */
export async function updateMultipleUserBudgets(
  updates: Array<{
    userId: string;
    costToAdd: number;
    expectedCurrentBudget: number | null;
    dailyLimit: number;
    context?: BudgetUpdateContext;
  }>,
  _options: {
    maxConcurrency?: number;
    continueOnError?: boolean;
  } = {}
): Promise<Array<{
  userId: string;
  result?: BudgetUpdateResult;
  error?: Error;
  success: boolean;
}>> {
  logDeprecationWarning('updateMultipleUserBudgets');

  // Return success for all updates
  return updates.map(update => ({
    userId: update.userId,
    result: { previousBudget: 0, newBudget: 0, success: true },
    success: true
  }));
}
