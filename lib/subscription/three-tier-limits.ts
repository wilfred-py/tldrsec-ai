/**
 * Per-tier ticker allowance for the [Subscription] surface. `-1` sentinels
 * unlimited (FREE and MAX today; PRO caps at 25). Consumed by the tickers
 * API route (`app/api/user/tickers/route.ts`) for the ceiling check and by
 * the dashboard tickers tab (`components/dashboard/sections/dashboard-tickers-tab.tsx`)
 * plus the onboarding types file (`app/(auth)/onboarding/types.ts`) for
 * display.
 *
 * Previously the module also exported `checkTierLimit(currentCount, tier)`
 * and `getTierLimitInfo(tier)` — two shallow wrappers whose only production
 * caller was the tickers API route, invoked in the same expression. The
 * `checkTierLimit` body was `limit === -1 ? false : currentCount >= limit`
 * (2 lines behind a 2-arg interface), and `getTierLimitInfo` returned a
 * 3-field shape whose `limit` was already `THREE_TIER_LIMITS[tier]` on the
 * caller side. The seam had one adapter and two callers in one expression
 * — per LANGUAGE.md that is not a seam.
 */
export const THREE_TIER_LIMITS = {
  FREE: -1, // unlimited (same as MAX)
  PRO: 25,
  MAX: -1  // -1 = unlimited (no validation needed)
} as const;
