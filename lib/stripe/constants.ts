/**
 * Stripe-related constants.
 *
 * Centralizes sentinel values used across the Stripe + entitlement plumbing
 * so they remain greppable, named, and consistent across callsites.
 */

/**
 * Sentinel `currentPeriodEnd` value written on `UserSubscription` rows for
 * Lifetime Seat holders, who have no recurring subscription to roll forward.
 *
 * Chosen over a nullable column because every existing entitlement reader in
 * the app queries `currentPeriodEnd > now()` and changing that invariant for
 * one cohort would require touching many readers. The boring approach wins.
 *
 * See `docs/adr/0004-lifetime-seat-entitlement-and-one-time-payment.md`
 * section 4 for the full rationale.
 */
export const LIFETIME_NEVER_EXPIRES = new Date('9999-12-31T00:00:00.000Z');

/**
 * Returns true when the given UserSubscription end-date is the lifetime
 * sentinel. Use this in any code that needs to distinguish a lifetime seat
 * from a recurring subscription without inspecting `stripePriceId`.
 */
export function isLifetimeSentinel(currentPeriodEnd: Date): boolean {
  return currentPeriodEnd.getTime() === LIFETIME_NEVER_EXPIRES.getTime();
}
