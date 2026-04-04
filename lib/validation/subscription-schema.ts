import { z } from 'zod';

/**
 * Subscription data schema for validation
 * Prevents XSS and injection attacks by validating API response structure
 */
export const SubscriptionDataSchema = z.object({
  planType: z.enum(['FREE', 'PRO', 'MAX']),
  isActive: z.boolean(),
  isTrialing: z.boolean(),
  daysRemaining: z.number(),
  trialEndsAt: z.string().nullable(),
  isGrandfathered: z.boolean(),
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  limits: z.object({
    monthlyFilings: z.number(),
    usedFilings: z.number().min(0),
    remainingFilings: z.number(),
  }),
});

export type SubscriptionData = z.infer<typeof SubscriptionDataSchema>;

/**
 * SSE update schema - only whitelist necessary fields
 * Prevents sensitive data exposure
 */
export const SSEUpdateSchema = z.object({
  authProviderId: z.string(),
  subscription: z.object({
    planType: z.enum(['FREE', 'PRO', 'MAX']),
    isActive: z.boolean(),
    isTrialing: z.boolean(),
    daysRemaining: z.number().min(0),
    trialEndsAt: z.string().nullable(),
    isGrandfathered: z.boolean(),
  }),
  timestamp: z.string(),
});

export type SSEUpdate = z.infer<typeof SSEUpdateSchema>;
