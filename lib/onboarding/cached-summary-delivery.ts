import { getPrismaClient } from '@/lib/db/prisma';
import { getEmailTemplate } from '@/lib/email/templates';
import { EmailType, EmailMessage, FilingTemplateData } from '@/lib/email/types';
import { sendEmail } from '@/lib/email/index';

/**
 * All processingStatus values that indicate a successful summary.
 * The codebase writes different values depending on code path.
 */
const SUCCESS_STATUSES = [
  'COMPLETED',
  'SUCCESS',
  'CACHE_HIT',
  'completed',
  'Success',
];

/**
 * Materiality weights for onboarding scoring.
 * Designed so new users hit the "a-ha" moment: their first emails should
 * demonstrate the deepest, most material analysis — not routine transactions.
 *
 * 10-K/10-Q = comprehensive financial analysis  → highest
 * 8-K       = material events                   → high
 * DEF 14A   = governance                        → medium-high
 * Form 4    = routine insider transactions       → low (easily drowned out)
 */
const MATERIALITY_WEIGHTS: Record<string, number> = {
  '10-K': 100,
  '10-Q': 95,
  '8-K': 75,
  'FORM 8-K': 75,
  'DEF 14A': 60,
  'S-1': 55,
  'S-3': 50,
  '13D': 50,
  'SC 13D': 50,
  'Form 4': 15,
  'Form4': 15,
  'FORM 4': 15,
  'FORM4': 15,
  'Form 3': 10,
  'Form 5': 10,
  '144': 10,
  'FORM 144': 10,
};
const DEFAULT_MATERIALITY = 20;

/**
 * Pure function: calculate composite score for a summary.
 * Exported for testability.
 *
 * Onboarding scoring heavily prioritises materiality (0.65) over recency (0.2)
 * and quality (0.15). This ensures a 10-K from 3 months ago always beats a
 * routine Form 4 from yesterday.
 *
 * score = (materiality * 0.65) + (quality * 0.15) + (recency * 0.20)
 */
export function calculateCompositeScore(summary: {
  filingType: string;
  qualityScore: number | null;
  filingDate: Date;
}): number {
  const materiality = MATERIALITY_WEIGHTS[summary.filingType] ?? DEFAULT_MATERIALITY;

  // Quality score (0-100, default 50 if null)
  const quality = summary.qualityScore ?? 50;

  // Recency score: 100 * max(0, 1 - (daysSinceFiling / 365))
  const daysSinceFiling = Math.max(
    0,
    (Date.now() - new Date(summary.filingDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const recency = 100 * Math.max(0, 1 - daysSinceFiling / 365);

  return materiality * 0.65 + quality * 0.15 + recency * 0.20;
}

interface DeliverySummaryResult {
  delivered: number;
  reason?: string;
  error?: string;
}

/**
 * Find, rank, and email the top 2 cached summaries per ticker for a user.
 * Each summary is sent as an individual email using the minimalist React templates.
 */
export async function deliverCachedSummaries(
  userId: string,
  userEmail: string,
  _userName: string
): Promise<DeliverySummaryResult> {
  const prisma = getPrismaClient();

  // Get user's tickers
  const tickers = await prisma.ticker.findMany({
    where: { userId },
    select: { symbol: true, companyName: true },
  });

  if (tickers.length === 0) {
    return { delivered: 0, reason: 'no_tickers' };
  }

  // For each ticker symbol, find best cached summaries across ALL users
  const topSummaries: Array<{
    id: string;
    filingType: string;
    filingDate: Date;
    filingUrl: string;
    summaryText: string;
    summaryJSON: unknown;
    qualityScore: number | null;
    url: string | null;
    ticker: { symbol: string; companyName: string };
    score: number;
  }> = [];

  for (const ticker of tickers) {
    const summaries = await prisma.summary.findMany({
      where: {
        ticker: { symbol: ticker.symbol },
        summaryText: { not: '' },
        processingStatus: { in: SUCCESS_STATUSES },
      },
      include: { ticker: { select: { symbol: true, companyName: true } } },
      orderBy: { filingDate: 'desc' },
      take: 20,
    });

    // Score and rank
    const scored = summaries.map((s) => ({
      ...s,
      score: calculateCompositeScore({
        filingType: s.filingType,
        qualityScore: s.qualityScore,
        filingDate: s.filingDate,
      }),
    }));

    scored.sort((a, b) => b.score - a.score);

    // Top 2 per ticker
    topSummaries.push(...scored.slice(0, 2));
  }

  if (topSummaries.length === 0) {
    return { delivered: 0, reason: 'no_cached_summaries' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';
  let delivered = 0;

  // Send individual per-filing emails using minimalist templates (current design system)
  for (const summary of topSummaries) {
    const filing: FilingTemplateData = {
      companyName: summary.ticker.companyName,
      symbol: summary.ticker.symbol,
      filingType: summary.filingType,
      filingDate: summary.filingDate.toISOString(),
      filingUrl: summary.url || summary.filingUrl,
      summaryUrl: `${appUrl}/summary/${summary.id}`,
      summaryText: summary.summaryText,
      summaryData: summary.summaryJSON as FilingTemplateData['summaryData'],
    };

    try {
      const { html, text } = await getEmailTemplate(EmailType.IMMEDIATE, { filing });

      const message: EmailMessage = {
        to: userEmail,
        subject: `${summary.ticker.symbol}: ${summary.filingType} Summary — tldrSEC`,
        html,
        text,
        tags: ['type:onboarding-digest', 'content:cached-summaries'],
      };

      const result = await sendEmail(message);
      if (result.success) {
        delivered++;

        // Track delivery via SummaryEmailDelivery
        try {
          await prisma.summaryEmailDelivery.create({
            data: {
              summaryId: summary.id,
              userId,
              emailAddress: userEmail,
              deliveryStatus: 'sent',
              metadata: { source: 'onboarding-cached-delivery' },
            },
          });
        } catch {
          // Ignore unique constraint violations (already delivered)
        }
      } else {
        console.error('[CachedDelivery] Email send failed for', summary.ticker.symbol, summary.filingType);
      }
    } catch (err) {
      console.error('[CachedDelivery] Error sending email for', summary.ticker.symbol, ':', err);
    }
  }

  if (delivered === 0) {
    return { delivered: 0, reason: 'email_failed' };
  }

  return { delivered };
}
