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
