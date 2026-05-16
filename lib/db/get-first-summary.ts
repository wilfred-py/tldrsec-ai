import { cache } from 'react';
import { getPrismaClient } from '@/lib/db/prisma';
import type { FirstSummaryHeroSummary } from '@/components/dashboard/post-onboarding-hero-card';

// React cache()-wrapped: only used once per render today (by DashboardUserSection)
// but the cache wrapper future-proofs in case the hero card is split or reused.
//
// Returns null on failure (logged) so the hero card can fall back to its
// inbox-CTA variant without throwing the whole Suspense boundary.
export const getFirstSummary = cache(async (summaryId: string | null): Promise<FirstSummaryHeroSummary | null> => {
  if (!summaryId) return null;

  const prisma = getPrismaClient();
  try {
    const chosen = await prisma.summary.findUnique({
      where: { id: summaryId },
      select: {
        id: true,
        filingType: true,
        filingDate: true,
        summaryText: true,
        importance: true,
        ticker: { select: { symbol: true, companyName: true } },
      },
    });
    if (!chosen) return null;

    const { extractHeadline } = await import('@/lib/onboarding/extract-headline');
    return {
      id: chosen.id,
      ticker: chosen.ticker.symbol,
      companyName: chosen.ticker.companyName,
      filingType: chosen.filingType,
      filingDate: chosen.filingDate.toISOString(),
      headline: extractHeadline(chosen.summaryText),
      importance: chosen.importance,
    };
  } catch (err) {
    console.error('Failed to load first-summary pick:', err);
    return null;
  }
});
