// Simplified 3-tier system with MAX unlimited
export const THREE_TIER_LIMITS = {
  FREE: 3,
  PRO: 25,
  MAX: -1  // -1 = unlimited (no validation needed)
} as const;

export function checkTierLimit(currentCount: number, tier: 'FREE' | 'PRO' | 'MAX'): boolean {
  const limit = THREE_TIER_LIMITS[tier];
  // MAX tier (-1) is unlimited, so never limit
  if (limit === -1) return false;
  
  return currentCount >= limit;
}

export function getTierLimitInfo(tier: 'FREE' | 'PRO' | 'MAX') {
  return {
    limit: THREE_TIER_LIMITS[tier],
    tier,
    unlimited: THREE_TIER_LIMITS[tier] === -1
  };
}