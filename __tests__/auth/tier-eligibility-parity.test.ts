/**
 * Parity matrix: verify the new tier-eligibility helper matches pre-refactor
 * behavior across the {tier × isTrialing × trialEndsAt} decision space.
 *
 * Three pre-refactor sites are consolidated:
 *   - lib/cron/tier-priority.ts:28 — MAX OR (active trial w/ 5-min grace) → priority 9
 *   - lib/auth/trial-service.ts:50/152 — PRO/MAX OR active trial (no grace) → isActive
 *   - lib/cron/handlers/weekly-digest-handler.ts:90 — Prisma `gt: now` (no grace)
 *
 * The helper unifies all three on a 5-min clock-skew grace. Sites B and C
 * gain the grace on refactor (documented behavior change, not a bug).
 */

import {
  isMaxEligible,
  hasActiveAccess,
} from '@/lib/auth/tier-eligibility';

const tiers = ['FREE', 'PRO', 'MAX'] as const;
const trialingValues = [true, false, null] as const;

type DateLabel = 'null' | 'graceZone' | 'past' | 'future';
const trialDateBuilders: Record<DateLabel, () => Date | null> = {
  null: () => null,
  graceZone: () => new Date(Date.now() - 2 * 60 * 1000), // 2 min ago — within 5-min grace
  past: () => new Date(Date.now() - 24 * 60 * 60 * 1000),
  future: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
};

describe('tier-eligibility parity matrix', () => {
  describe('isMaxEligible — replaces lib/cron/tier-priority.ts:28 (MAX OR active trial)', () => {
    function legacyMaxEligible(
      tier: string,
      isTrialing: boolean | null,
      trialEndsAt: Date | null
    ): boolean {
      if (
        isTrialing &&
        trialEndsAt &&
        trialEndsAt > new Date(Date.now() - 5 * 60 * 1000)
      ) {
        return true;
      }
      return tier === 'MAX';
    }

    for (const tier of tiers) {
      for (const isTrialing of trialingValues) {
        for (const dateLabel of Object.keys(trialDateBuilders) as DateLabel[]) {
          const fixture = `tier=${tier} isTrialing=${isTrialing} trialEndsAt=${dateLabel}`;
          it(`matches legacy: ${fixture}`, () => {
            const trialEndsAt = trialDateBuilders[dateLabel]();
            const legacy = legacyMaxEligible(tier, isTrialing, trialEndsAt);
            const next = isMaxEligible({ tier, isTrialing, trialEndsAt });
            expect(next).toBe(legacy);
          });
        }
      }
    }
  });

  describe('hasActiveAccess — replaces trial-service.ts and weekly-digest-handler.ts (PRO/MAX OR active trial)', () => {
    /**
     * Legacy semantics: PRO/MAX always active; FREE+isTrialing requires
     * trialEndsAt > now (NO grace period).
     *
     * The new helper adds a 5-min grace, so the grace-zone case differs.
     * That case is asserted separately below.
     */
    function legacyHasAccess(
      tier: string,
      isTrialing: boolean | null,
      trialEndsAt: Date | null
    ): boolean {
      if (tier === 'PRO' || tier === 'MAX') return true;
      if (isTrialing && trialEndsAt && trialEndsAt > new Date()) return true;
      return false;
    }

    for (const tier of tiers) {
      for (const isTrialing of trialingValues) {
        for (const dateLabel of Object.keys(trialDateBuilders) as DateLabel[]) {
          // Skip grace-zone for FREE+isTrialing — documented behavior change.
          if (
            dateLabel === 'graceZone' &&
            tier === 'FREE' &&
            isTrialing === true
          ) {
            continue;
          }

          const fixture = `tier=${tier} isTrialing=${isTrialing} trialEndsAt=${dateLabel}`;
          it(`matches legacy: ${fixture}`, () => {
            const trialEndsAt = trialDateBuilders[dateLabel]();
            const legacy = legacyHasAccess(tier, isTrialing, trialEndsAt);
            const next = hasActiveAccess({ tier, isTrialing, trialEndsAt });
            expect(next).toBe(legacy);
          });
        }
      }
    }

    it('grace-zone harmonization: FREE+isTrialing within 5-min of expiry now returns true (was false)', () => {
      const justExpired = new Date(Date.now() - 2 * 60 * 1000);
      expect(
        hasActiveAccess({
          tier: 'FREE',
          isTrialing: true,
          trialEndsAt: justExpired,
        })
      ).toBe(true);
    });
  });
});
