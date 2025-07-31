/**
 * Input validation schemas for subscription management
 * Addresses security vulnerability: unvalidated user input
 */

import { z } from 'zod';

// Subscription update validation schema
export const subscriptionUpdateSchema = z.object({
  planType: z.enum(['BASIC', 'PROFESSIONAL', 'PREMIUM']),
  isActive: z.boolean().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  stripePriceId: z.string().optional()
});

// Filing usage validation schema
export const filingUsageSchema = z.object({
  filingType: z.string().min(1).max(50).regex(/^[A-Z0-9-]+$/, 'Invalid filing type format'),
  ticker: z.string().min(1).max(10).regex(/^[A-Z0-9.]+$/, 'Invalid ticker format'),
  accessionNumber: z.string().optional(),
  optimizationLevel: z.enum(['minimal', 'conservative', 'balanced', 'aggressive']),
  originalTokens: z.number().int().min(0).optional(),
  optimizedTokens: z.number().int().min(0).optional(),
  reductionPercentage: z.number().min(0).max(100).optional(),
  cost: z.number().min(0).optional(),
  processingTimeMs: z.number().int().min(0).optional()
});

// Usage period validation schema
export const usagePeriodSchema = z.object({
  periodStart: z.date(),
  periodEnd: z.date(),
  planType: z.enum(['BASIC', 'PROFESSIONAL', 'PREMIUM']),
  filingLimit: z.number().int().min(1).max(10000),
  filingsUsed: z.number().int().min(0).optional(),
  resetAt: z.date()
});

// Token optimization validation schema
export const tokenOptimizationSchema = z.object({
  level: z.enum(['minimal', 'conservative', 'balanced', 'aggressive']),
  preserveFinancialData: z.boolean().default(true),
  preserveRiskFactors: z.boolean().default(true),
  preserveMDA: z.boolean().default(true),
  maxTokens: z.number().int().min(1000).max(500000).optional()
});

// Validation helper functions
export function validateSubscriptionUpdate(data: unknown) {
  return subscriptionUpdateSchema.safeParse(data);
}

export function validateFilingUsage(data: unknown) {
  return filingUsageSchema.safeParse(data);
}

export function validateUsagePeriod(data: unknown) {
  return usagePeriodSchema.safeParse(data);
}

export function validateTokenOptimization(data: unknown) {
  return tokenOptimizationSchema.safeParse(data);
}

// Type exports
export type SubscriptionUpdateInput = z.infer<typeof subscriptionUpdateSchema>;
export type FilingUsageInput = z.infer<typeof filingUsageSchema>;
export type UsagePeriodInput = z.infer<typeof usagePeriodSchema>;
export type TokenOptimizationInput = z.infer<typeof tokenOptimizationSchema>;