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
  operationType: 'cached_summary' | 'ai_generation' | 'failed_operation';
  isCached: boolean;
  // Enhanced tracking fields for proper context detection
  cacheHit?: boolean;       // Explicit cache hit detection
  aiGenerated?: boolean;    // Explicit AI usage tracking
  errorOccurred?: boolean;  // Explicit error tracking
  processingStartTime?: number;
  processingEndTime?: number;
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
  hmacValidated?: boolean;
  timestamp?: number;
  skew?: number;
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

// Daily cost budgets (in USD) - Updated for realistic AI processing capacity
// Increased from restrictive limits to enable actual service delivery
// PRO: $10/day (allows 100-1000 operations), HOBBY: $2/day (allows 20-200 operations)
export const DAILY_COST_LIMITS = {
  PRO: Number(process.env.PRO_COST_LIMIT) || 10.00,    // $10/day per user - realistic for 20 tickers with AI processing
  HOBBY: Number(process.env.HOBBY_COST_LIMIT) || 2.00  // $2/day per user - realistic for 3 tickers with AI processing
} as const;

// Security constants
export const MAX_CONCURRENT_RSS_CHECKS = 3;
export const MAX_CONCURRENT_USER_PROCESSING = 3;
// IMPORTANT: Must be less than Vercel maxDuration (180s) to allow error handling before function kills
// 165s timeout + 15s buffer for cleanup = 180s maxDuration
// Analysis: With 15s SEC timeout per request, worst case is:
// - Index fetch: 15s
// - Extension probing (4 attempts): 60s
// - Fallback probing (3 attempts): 45s
// - AI summarization: 60s
// Total worst case: ~180s, but typically only 2-3 requests needed (~45-60s)
export const FILING_PROCESSING_TIMEOUT = 165000; // 2.75 minutes - realistic budget for SEC fetch + AI

/**
 * Dynamic batch sizing based on job type execution characteristics.
 * These values are tuned to stay within Vercel's 180s function timeout
 * with 15s safety buffer.
 *
 * Calculation methodology:
 * - Discovery: 2-5s per job → 10 jobs = 20-50s (well within timeout)
 * - Fetch: 60-120s per job → 2 jobs = 120-240s (at limit, but sequential)
 * - Summarize: 17-90s per job → 3 jobs = 51-270s (at limit for worst case)
 */
export const JOB_BATCH_SIZES: Record<string, number> = {
  ASYNC_DISCOVER_FILINGS: 10,    // Fast jobs: 2-5s each
  ASYNC_FETCH_FILING: 2,          // Medium jobs: 60-120s each
  ASYNC_SUMMARIZE_CACHED: 3,      // Slow jobs: 17-90s each
  // Legacy jobs use default
  DEFAULT: 1,
};

/**
 * Get batch size for a specific job type.
 * Returns the configured batch size or default if not specified.
 */
export function getBatchSizeForJobType(jobType: string): number {
  return JOB_BATCH_SIZES[jobType] ?? JOB_BATCH_SIZES.DEFAULT;
}

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