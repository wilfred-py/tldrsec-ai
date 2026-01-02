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

// ===== COST INTERFACES =====
// Note: Budget tracking has been removed. OpenRouter handles credit limits.
// See: docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md

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

// Security constants - optimized for 50% SEC rate limit utilization
// SEC limit: 10 req/s, using 5 concurrent + 1s delay = ~2.5 req/s effective
export const MAX_CONCURRENT_RSS_CHECKS = 5;
export const MAX_CONCURRENT_USER_PROCESSING = 3;
// IMPORTANT: Must be less than Vercel maxDuration (300s) to allow error handling before function kills
// Updated 2025-11-28: Increased to match OpenRouter timeout (270s) for AI summarization
// Vercel maxDuration is now 300s, giving 30s buffer for cleanup after job timeout
// AI summarization via OpenRouter can take up to 270s for complex filings
export const FILING_PROCESSING_TIMEOUT = 270000; // 4.5 minutes - matches OpenRouter timeout

/**
 * Dynamic batch sizing based on job type execution characteristics.
 * These values are tuned to stay within Vercel's 300s function timeout
 * with 30s safety buffer.
 *
 * Calculation methodology (updated 2025-11-28):
 * - Discovery: 2-5s per job → 10 jobs = 20-50s (well within timeout)
 * - Fetch: 4-10s per job (optimized) → 5 jobs = 20-50s (well within timeout)
 * - Summarize: 30-270s per job (AI) → 1 job = 30-270s (needs full timeout budget)
 *
 * IMPORTANT: Summarize jobs reduced to 1 because OpenRouter AI calls can take
 * up to 270s for complex filings (87KB+ content). Processing multiple jobs
 * would exceed the 300s function timeout.
 */
export const JOB_BATCH_SIZES: Record<string, number> = {
  ASYNC_DISCOVER_FILINGS: 10,    // Fast jobs: 2-5s each
  ASYNC_FETCH_FILING: 5,          // Fast jobs now: 4-10s each (optimized)
  ASYNC_SUMMARIZE_CACHED: 1,      // Slow jobs: 30-270s each (AI processing)
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
  COST_VALIDATION_FAILED: 'COST_VALIDATION_FAILED',
  TIER_MISMATCH: 'TIER_MISMATCH',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',  // OpenRouter credit limit exceeded
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