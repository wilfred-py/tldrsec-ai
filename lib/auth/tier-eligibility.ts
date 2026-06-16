/**
 * Tier + trial eligibility — single source of truth.
 *
 * Consolidates "is this user eligible?" logic that previously lived in three
 * places with disagreeing semantics:
 *   - lib/cron/tier-priority.ts:28        (5-min grace)
 *   - lib/auth/trial-service.ts:50/152    (no grace, day-ceiling)
 *   - lib/cron/handlers/weekly-digest-handler.ts:90 (no grace, exact)
 *
 * Resolution: 5-min clock-skew grace everywhere. The grace tolerates skew
 * between Stripe webhooks, our DB clock, and worker nodes.
 *
 * Also the canonical home for `isSubscriptionActive`, the predicate
 * (`UserSubscription.isActive` AND not yet past `currentPeriodEnd`) that
 * previously appeared inlined at three call sites with subtle drift between
 * `<` and `>=` and three independent `new Date()` allocations.
 *
 * All exports are SYNC and PURE (args-only). Do not introduce I/O here —
 * a purity guard test enforces this (see __tests__/auth/tier-eligibility-purity).
 */

export const MAX_ELIGIBILITY_GRACE_MS = 5 * 60 * 1000;

export interface TrialFields {
  isTrialing?: boolean | null;
  trialEndsAt?: Date | null;
}

export interface TierFields extends TrialFields {
  tier?: string | null;
}

/**
 * Minimal subscription shape required by `isSubscriptionActive`. Callers can
 * pass a full `UserSubscription` row (Prisma) or a hand-built struct; only
 * the two fields named here are read.
 */
export interface SubscriptionActiveFields {
  isActive: boolean;
  currentPeriodEnd: Date;
}

/**
 * True when the user is in an unexpired trial (with 5-min grace).
 *
 * Primitive — does not consider tier. A paid PRO/MAX user with no trial
 * returns false here. Use `isMaxEligible` or `hasActiveAccess` for the
 * tier-aware compositions.
 */
export function isActiveTrial({ isTrialing, trialEndsAt }: TrialFields): boolean {
  if (!isTrialing || !trialEndsAt) return false;
  return trialEndsAt.getTime() > Date.now() - MAX_ELIGIBILITY_GRACE_MS;
}

/**
 * True when the user is entitled to MAX-tier features (e.g., X-search enrichment).
 *
 * MAX paid users always qualify. PRO does NOT — Max is the gating tier.
 * Active trial users qualify regardless of `tier` value.
 */
export function isMaxEligible({ tier, isTrialing, trialEndsAt }: TierFields): boolean {
  if (tier === 'MAX') return true;
  return isActiveTrial({ isTrialing, trialEndsAt });
}

/**
 * True when the user has any paid or trial access (PRO/MAX paid OR active trial).
 *
 * Use for: weekly digest filter, banner suppression, general "is logged-in
 * with access" checks. For Max-only feature gates, use `isMaxEligible`.
 */
export function hasActiveAccess({ tier, isTrialing, trialEndsAt }: TierFields): boolean {
  if (tier === 'PRO' || tier === 'MAX') return true;
  return isActiveTrial({ isTrialing, trialEndsAt });
}

/**
 * Cutoff Date for Prisma queries that filter active trial users.
 *
 * Use as: `trialEndsAt: { gt: getActiveTrialCutoffDate() }`
 *
 * Returns now() minus the 5-min grace, so a trial that expired 4 minutes ago
 * still passes the filter — matches `isActiveTrial` semantics.
 */
export function getActiveTrialCutoffDate(): Date {
  return new Date(Date.now() - MAX_ELIGIBILITY_GRACE_MS);
}

/**
 * True when the `UserSubscription` row is currently active: `isActive=true`
 * AND `currentPeriodEnd` is in the future.
 *
 * Distinct from `hasActiveAccess` / `isMaxEligible` above, which read the
 * denormalized `User.subscriptionTier` + trial fields. This predicate reads
 * the raw subscription-row state directly — use it when answering "does
 * this user's recurring subscription cover them right now?" (e.g. for
 * billing-page status, ticker-stat aggregation, and the
 * `/api/user` response). Lifetime Seats (ADR-0004) write a sentinel
 * `currentPeriodEnd` of `9999-12-31`, which trivially satisfies the
 * future-end check.
 *
 * Comparison is strictly `currentPeriodEnd > now()` so a subscription
 * expiring at exactly the call instant is reported inactive — chosen over
 * `>=` for consistency with the `/api/user` and subscription-service
 * call sites that previously used `<`; the 1ms edge case is negligible
 * and the strict comparison composes cleanly with cron-tick boundaries.
 */
export function isSubscriptionActive(sub: SubscriptionActiveFields | null | undefined): boolean {
  if (!sub) return false;
  return sub.isActive && sub.currentPeriodEnd.getTime() > Date.now();
}

// ---------------------------------------------------------------------------
// Ticker-tracking limit per [Subscription] tier
// ---------------------------------------------------------------------------

/**
 * Maximum number of tracked tickers per tier. `-1` means unlimited — both
 * FREE and MAX are unlimited; PRO is capped at 25.
 *
 * The canonical map for "given a tier, how many tickers can the user track?"
 * Three call sites consult this:
 *   - app/api/user/tickers/route.ts        (POST add-ticker enforcement)
 *   - app/(auth)/onboarding/types.ts       (onboarding soft-cap derivation)
 *   - components/dashboard/sections/dashboard-tickers-tab.tsx
 *                                          (TickersPanel header copy)
 *
 * Replaces lib/subscription/three-tier-limits.ts, which split the limit
 * table from the tier-eligibility authority even though the limit IS a
 * tier-driven predicate. Collapsing the seam means a maintainer changing
 * tier behaviour reads ONE place — limits, active-trial, max-eligibility,
 * subscription-active all live alongside.
 */
export const TICKER_LIMIT_BY_TIER = {
  FREE: -1,
  PRO: 25,
  MAX: -1,
} as const;

export type TickerLimitTier = keyof typeof TICKER_LIMIT_BY_TIER;

/**
 * True when the user has hit (or exceeded) the ticker-tracking limit for
 * their tier and the next add should be rejected. `-1` (unlimited) never
 * limits.
 */
export function isTickerLimitReached(currentCount: number, tier: TickerLimitTier): boolean {
  const limit = TICKER_LIMIT_BY_TIER[tier];
  if (limit === -1) return false;
  return currentCount >= limit;
}

export interface TickerLimitInfo {
  limit: number;
  tier: TickerLimitTier;
  unlimited: boolean;
}

/**
 * Build the rejection payload's tier+limit triple for the
 * `/api/user/tickers` 403 response.
 */
export function getTickerLimitInfo(tier: TickerLimitTier): TickerLimitInfo {
  const limit = TICKER_LIMIT_BY_TIER[tier];
  return {
    limit,
    tier,
    unlimited: limit === -1,
  };
}
