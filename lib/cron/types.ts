/**
 * Type definitions for tier-aware cron job processing
 * Extracted from app/api/cron/tier-aware/route.ts for better organization
 */

// import { Prisma } from '@prisma/client';

// ===== CORE INTERFACES =====

export interface User {
  id: string;
  tickers: Array<{ symbol: string; [key: string]: unknown }>;
  email?: string;
  subscriptionTier?: string;
  lastCronProcessed?: Date | null;
  processingBudget?: number;
  budgetUsed?: number;
  [key: string]: unknown;
}

export interface EligibleUser {
  tier: string;
  userId: string;
  [key: string]: unknown;
}

export interface DatabaseUser {
  id: string;
  email: string | null;
  subscriptionTier: string;
  lastCronProcessed: Date | null;
  processingBudget: number | null;
  budgetUsed: number | null;
  tickers: Array<{
    id: string;
    symbol: string;
    companyName: string | null;
  }>;
}

export interface ProcessUserResult {
  success: boolean;
  userId: string;
  filingsProcessed?: number;
  cost?: number;
  budgetUpdate?: {
    previousBudget: number;
    newBudget: number;
    costAdded: number;
  };
  error?: string;
  errorType?: string;
}

export interface TierStatus {
  processed: number;
  filings: number;
  cost: number;
  errors: number;
  errorBreakdown?: {
    concurrencyConflicts: number;
    budgetExceeded: number;
    costValidationFailed: number;
    tierMismatch: number;
    unknownErrors: number;
  };
}

export interface CronResults {
  usersProcessed: number;
  filingsProcessed: number;
  totalCost: number;
  tierBreakdown: Record<string, number>;
  errors: number;
  errorBreakdown: {
    concurrencyConflicts: number;
    budgetExceeded: number;
    costValidationFailed: number;
    tierMismatch: number;
    unknownErrors: number;
  };
  cacheMetrics: {
    hits: number;
    misses: number;
    hitRatio: number;
    apiCallsSaved: number;
  };
}

export interface FilingForProcessing {
  id: string;
  accessionNumber: string;
  formType: string;
  filingDate: Date;
  filingUrl?: string;
  tickerData: {
    symbol: string;
    cik: string;
    companyName: string;
  };
}

export interface UserFilingResult {
  ticker: string;
  filings: unknown[];
  users: Array<{ userId: string; userEmail: string; tier: string }>;
  cacheHit: boolean;
  apiCallTime: number;
  error?: string;
}

export interface ProcessingContext {
  tier: string;
  userId: string;
  operation: string;
  operationType: string;
  isCached: boolean;
}

// ===== BUDGET & COST INTERFACES =====

export interface BudgetUpdateOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  isolationLevel: 'ReadCommitted' | 'Serializable';
  tier: string;
  originalCost: number;
  enableAuditLogging: boolean;
}

export interface BudgetUpdateResult {
  previousBudget: number;
  newBudget: number;
  success: boolean;
}

// ===== AUTHENTICATION INTERFACES =====

export interface AuthValidationResult {
  isValid: boolean;
  error?: string;
  clientIP?: string;
}

export interface AuthHeaders {
  authorization?: string;
  'x-cron-auth'?: string;
  'x-forwarded-for'?: string;
  'x-real-ip'?: string;
  'x-security-validated'?: string;
}

// ===== CONSTANTS =====

// Processing batch sizes per tier (from environment or defaults)
// Updated for xAI/OpenRouter pricing model
export const TIER_BATCH_SIZES = {
  PRO: Number(process.env.PRO_BATCH_SIZE) || 20,      // 20 tickers, higher processing capacity
  HOBBY: Number(process.env.HOBBY_BATCH_SIZE) || 3    // 3 tickers, basic processing
} as const;

// Daily cost budgets (in USD) - Updated for new subscription tiers and xAI pricing
// Based on $109/month HOBBY ($0.06/day) and $149/month PRO ($0.40/day) with 95% cost reduction from xAI
export const DAILY_COST_LIMITS = {
  PRO: Number(process.env.PRO_COST_LIMIT) || 0.40,     // $149/month = ~$0.40/day for 20 tickers
  HOBBY: Number(process.env.HOBBY_COST_LIMIT) || 0.06  // $109/month = ~$0.06/day for 3 tickers
} as const;

// Security constants
export const MAX_CONCURRENT_RSS_CHECKS = 3;
export const MAX_CONCURRENT_USER_PROCESSING = 3;
export const FILING_PROCESSING_TIMEOUT = 180000; // 3 minutes - increased for AI summarization + content fetching

// Platform detection types
export type CronPlatform = 'RAILWAY_CRON' | 'VERCEL_CRON' | 'MANUAL_TRIGGER';

// Error type categories
export const ERROR_TYPES = {
  CONCURRENCY_CONFLICT: 'CONCURRENCY_CONFLICT',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  COST_VALIDATION_FAILED: 'COST_VALIDATION_FAILED',
  TIER_MISMATCH: 'TIER_MISMATCH',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type ErrorType = typeof ERROR_TYPES[keyof typeof ERROR_TYPES];

// ===== UTILITY TYPES =====

export type SubscriptionTier = 'HOBBY' | 'PRO';

export interface MarketContext {
  isMarketHours: boolean;
  isMarketDay: boolean;
  isHoliday: boolean;
  currentTime: Date;
}

export interface EligibilityOptions {
  maxUsersPerCycle: number;
  respectBudgetLimits: boolean;
  budgetThreshold: number;
}

export interface TransactionOptions {
  timeout: number;
  description: string;
}

export interface TransactionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  transactionId: string;
}

// ===== TYPE GUARDS =====

export function isValidSubscriptionTier(tier: string): tier is SubscriptionTier {
  return ['HOBBY', 'PRO'].includes(tier.toUpperCase());
}

export function isProcessUserResult(obj: unknown): obj is ProcessUserResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'success' in obj &&
    'userId' in obj &&
    typeof (obj as ProcessUserResult).success === 'boolean' &&
    typeof (obj as ProcessUserResult).userId === 'string'
  );
}