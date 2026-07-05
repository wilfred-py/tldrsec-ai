import { z } from 'zod';
import { getPrismaClient } from '@/lib/db/prisma';
import { sendFilingSummaryEmail } from '@/lib/email/summary-service';
import { sendEmail } from '@/lib/email';
import { getEmailTemplate } from '@/lib/email/templates';
import { EmailType } from '@/lib/email/types';
import { SUCCESS_STATUSES } from '@/lib/db/summary-status';

// ---------------------------------------------------------------------------
// Analysis-depth scoring (private implementation)
// ---------------------------------------------------------------------------

const ANALYSIS_BONUSES = {
  xSentiment: 25,
  financialHighlights: 20,
  dealTermsOrTranches: 20,
  transactions: 15,
  smartSubject: 10,
  longSummaryText: 10,
} as const;

const SUMMARY_TEXT_LONG_THRESHOLD = 600;

const SummaryJsonSchema = z
  .object({
    xSentiment: z
      .object({
        direction: z
          .enum(['bullish', 'bearish', 'mixed', 'neutral', 'no_signal'])
          .optional(),
      })
      .passthrough()
      .optional()
      .nullable(),
    financialHighlights: z.array(z.unknown()).optional().nullable(),
    dealTerms: z.unknown().optional().nullable(),
    tranches: z.array(z.unknown()).optional().nullable(),
    transactions: z.array(z.unknown()).optional().nullable(),
  })
  .passthrough();

function analysisDepthScore(input: {
  summaryJSON: unknown;
  summaryText: string | null | undefined;
  smartSubject: string | null | undefined;
}): number {
  let score = 0;

  if (typeof input.smartSubject === 'string' && input.smartSubject.length > 0) {
    score += ANALYSIS_BONUSES.smartSubject;
  }

  if (
    typeof input.summaryText === 'string' &&
    input.summaryText.length > SUMMARY_TEXT_LONG_THRESHOLD
  ) {
    score += ANALYSIS_BONUSES.longSummaryText;
  }

  const parsed = SummaryJsonSchema.safeParse(input.summaryJSON);
  if (!parsed.success) return Math.min(score, 100);
  const j = parsed.data;

  if (j.xSentiment?.direction) score += ANALYSIS_BONUSES.xSentiment;
  if (Array.isArray(j.financialHighlights) && j.financialHighlights.length > 0)
    score += ANALYSIS_BONUSES.financialHighlights;

  const hasDealTerms = j.dealTerms != null && typeof j.dealTerms === 'object';
  const hasTranches = Array.isArray(j.tranches) && j.tranches.length > 0;
  if (hasDealTerms || hasTranches) score += ANALYSIS_BONUSES.dealTermsOrTranches;

  if (Array.isArray(j.transactions) && j.transactions.length > 0)
    score += ANALYSIS_BONUSES.transactions;

  return Math.min(score, 100);
}

// ---------------------------------------------------------------------------
// Composite scoring for cached-summary ranking (private implementation)
// ---------------------------------------------------------------------------

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
  Form4: 15,
  'FORM 4': 15,
  FORM4: 15,
  'Form 3': 10,
  'Form 5': 10,
  '144': 10,
  'FORM 144': 10,
};
const DEFAULT_MATERIALITY = 20;

const IMPORTANCE_WEIGHTS: Record<string, number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 15,
};

const SCORE_WEIGHTS = {
  importance: 0.25,
  materiality: 0.40,
  analysisDepth: 0.20,
  recency: 0.15,
} as const;

const STAGE_1_CANDIDATE_LIMIT = 50;

function importanceWeight(
  importance: string | null | undefined,
  fallback = 0
): number {
  if (!importance) return fallback;
  return IMPORTANCE_WEIGHTS[importance.toLowerCase()] ?? fallback;
}

function compositeScore(input: {
  filingType: string;
  filingDate: Date;
  importance: string | null;
  smartSubject: string | null;
  summaryText: string | null;
  summaryJSON: unknown;
}): number {
  const importance = importanceWeight(input.importance, 0);

  const materiality =
    MATERIALITY_WEIGHTS[input.filingType] ?? DEFAULT_MATERIALITY;

  const analysisDepth = analysisDepthScore({
    summaryJSON: input.summaryJSON,
    summaryText: input.summaryText,
    smartSubject: input.smartSubject,
  });

  const daysSinceFiling = Math.max(
    0,
    (Date.now() - new Date(input.filingDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const recency = 100 * Math.max(0, 1 - daysSinceFiling / 365);

  return (
    importance * SCORE_WEIGHTS.importance +
    materiality * SCORE_WEIGHTS.materiality +
    analysisDepth * SCORE_WEIGHTS.analysisDepth +
    recency * SCORE_WEIGHTS.recency
  );
}

function tiebreak(
  a: { importance: string | null; filingDate: Date; id: string },
  b: { importance: string | null; filingDate: Date; id: string }
): number {
  const aImp = importanceWeight(a.importance, -1);
  const bImp = importanceWeight(b.importance, -1);
  if (aImp !== bImp) return bImp - aImp;
  const aTime = new Date(a.filingDate).getTime();
  const bTime = new Date(b.filingDate).getTime();
  if (aTime !== bTime) return bTime - aTime;
  return a.id.localeCompare(b.id);
}

interface CandidateSummary {
  id: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  url: string | null;
  summaryText: string;
  summaryJSON: unknown;
  importance: string | null;
  smartSubject: string | null;
  ticker: { symbol: string; companyName: string };
  score: number;
}

async function pickBestCachedSummary(
  userId: string
): Promise<CandidateSummary | null> {
  const prisma = getPrismaClient();

  const tickers = await prisma.ticker.findMany({
    where: { userId },
    select: { symbol: true },
  });
  if (tickers.length === 0) return null;
  const symbols = tickers.map((t) => t.symbol);

  const candidates = await prisma.summary.findMany({
    where: {
      ticker: { symbol: { in: symbols } },
      summaryText: { not: '' },
      processingStatus: { in: [...SUCCESS_STATUSES] },
    },
    select: {
      id: true,
      filingType: true,
      filingDate: true,
      importance: true,
      smartSubject: true,
      summaryText: true,
      summaryJSON: true,
    },
    orderBy: { filingDate: 'desc' },
    take: STAGE_1_CANDIDATE_LIMIT,
  });

  if (candidates.length === 0) return null;

  const scored = candidates.map((c) => ({
    ...c,
    score: compositeScore({
      filingType: c.filingType,
      filingDate: c.filingDate,
      importance: c.importance,
      smartSubject: c.smartSubject,
      summaryText: c.summaryText,
      summaryJSON: c.summaryJSON,
    }),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return tiebreak(a, b);
  });

  const winnerId = scored[0].id;
  const winnerScore = scored[0].score;

  const winner = await prisma.summary.findUnique({
    where: { id: winnerId },
    select: {
      id: true,
      filingType: true,
      filingDate: true,
      filingUrl: true,
      url: true,
      summaryText: true,
      summaryJSON: true,
      importance: true,
      smartSubject: true,
      ticker: { select: { symbol: true, companyName: true } },
    },
  });
  if (!winner) return null;

  return {
    id: winner.id,
    filingType: winner.filingType,
    filingDate: winner.filingDate,
    filingUrl: winner.filingUrl,
    url: winner.url,
    summaryText: winner.summaryText,
    summaryJSON: winner.summaryJSON,
    importance: winner.importance,
    smartSubject: winner.smartSubject,
    ticker: winner.ticker,
    score: winnerScore,
  };
}

// ---------------------------------------------------------------------------
// Fallback notice send (private implementation)
// ---------------------------------------------------------------------------

interface FallbackSendOutcome {
  sent: boolean;
  error?: string;
}

async function sendFallbackNotice(args: {
  email: string;
  recipientName: string;
  trackedTickers: string[];
}): Promise<FallbackSendOutcome> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';
  const dashboardUrl = `${appUrl}/dashboard`;
  const unsubscribeUrl = `${appUrl}/dashboard/settings`;

  const { html, text } = await getEmailTemplate(
    EmailType.ONBOARDING_FALLBACK_NOTICE,
    {
      recipientName: args.recipientName,
      trackedTickers: args.trackedTickers,
      dashboardUrl,
      unsubscribeUrl,
    } as Record<string, unknown>
  );

  const subject =
    args.trackedTickers.length > 0
      ? `We're watching ${args.trackedTickers.slice(0, 3).join(', ')}${args.trackedTickers.length > 3 ? ` +${args.trackedTickers.length - 3}` : ''}`
      : "We're watching your tickers";

  const result = await sendEmail({
    to: args.email,
    subject,
    html,
    text,
    tags: ['type:onboarding-fallback-notice'],
  });

  if (!result.success) {
    return { sent: false, error: result.error?.message };
  }
  return { sent: true };
}

// ---------------------------------------------------------------------------
// Public interface — the "First Onboarding Email" module
// ---------------------------------------------------------------------------

export interface FirstOnboardingEmailArgs {
  userId: string;
  userEmail: string;
  recipientName: string;
  trackedTickers: string[];
}

export interface FirstOnboardingEmailResult {
  delivered: boolean;
  path?: 'cached' | 'fallback';
  reason?:
    | 'already_sent'
    | 'email_failed'
    | 'internal_error';
  summaryId?: string;
  score?: number;
  error?: string;
}

/**
 * Deliver the "First Onboarding Email" to a new user: pick the strongest
 * cached [Summary] across the user's tickers and send it as one email
 * through the production wrapper. When no cached summary is available for
 * any of the tickers (the long-tail unique-ticker case, or the user has no
 * tickers at all), fall through to the "we're watching your tickers"
 * fallback notice so the "you'll receive an email shortly" promise isn't
 * broken silently.
 *
 * Idempotent on `User.onboardingFirstEmailSentAt`: re-running for the same
 * user is a no-op. The cached path additionally sets
 * `User.onboardingFirstSummaryId`; the fallback path does not (no summary
 * was sent).
 *
 * Returns delivery metadata for the caller to log/instrument. Both delivery
 * paths report through the same result shape via the `path` field.
 */
export async function sendFirstOnboardingEmail(
  args: FirstOnboardingEmailArgs
): Promise<FirstOnboardingEmailResult> {
  const prisma = getPrismaClient();

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { onboardingFirstEmailSentAt: true },
  });
  if (user?.onboardingFirstEmailSentAt) {
    return { delivered: false, reason: 'already_sent' };
  }

  const winner = await pickBestCachedSummary(args.userId);

  if (winner) {
    try {
      const result = await sendFilingSummaryEmail(args.userEmail, {
        companyName: winner.ticker.companyName,
        ticker: winner.ticker.symbol,
        filingType: winner.filingType,
        filingDate: winner.filingDate,
        summary: winner.summaryText,
        filingUrl: winner.url || winner.filingUrl,
        summaryData: winner.summaryJSON as Record<string, unknown> | undefined,
        userId: args.userId,
        summaryId: winner.id,
        importance: winner.importance ?? undefined,
        smartSubject: winner.smartSubject ?? undefined,
      });

      if (!result.success) {
        return {
          delivered: false,
          path: 'cached',
          reason: 'email_failed',
          summaryId: winner.id,
          error: result.error,
        };
      }

      await prisma.user.update({
        where: { id: args.userId },
        data: {
          onboardingFirstEmailSentAt: new Date(),
          onboardingFirstSummaryId: winner.id,
        },
      });

      try {
        await prisma.summaryEmailDelivery.create({
          data: {
            summaryId: winner.id,
            userId: args.userId,
            emailAddress: args.userEmail,
            deliveryStatus: 'sent',
            metadata: { source: 'onboarding-best-pick' },
          },
        });
      } catch {
        // Unique constraint violation is OK — already delivered.
      }

      return {
        delivered: true,
        path: 'cached',
        summaryId: winner.id,
        score: winner.score,
      };
    } catch (err) {
      return {
        delivered: false,
        path: 'cached',
        reason: 'internal_error',
        summaryId: winner.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  try {
    const outcome = await sendFallbackNotice({
      email: args.userEmail,
      recipientName: args.recipientName,
      trackedTickers: args.trackedTickers,
    });

    if (!outcome.sent) {
      return {
        delivered: false,
        path: 'fallback',
        reason: 'email_failed',
        error: outcome.error,
      };
    }

    await prisma.user.update({
      where: { id: args.userId },
      data: { onboardingFirstEmailSentAt: new Date() },
    });

    return { delivered: true, path: 'fallback' };
  } catch (err) {
    return {
      delivered: false,
      path: 'fallback',
      reason: 'internal_error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
