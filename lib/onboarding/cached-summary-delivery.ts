import { z } from 'zod';
import { getPrismaClient } from '@/lib/db/prisma';
import { sendFilingSummaryEmail } from '@/lib/email/summary-service';

// ---------------------------------------------------------------------------
// Summary.processingStatus success values (private implementation).
//
// Historical writers emit different cases ("COMPLETED", "SUCCESS", "CACHE_HIT",
// plus lowercase/title-case variants). Until the column is migrated to a Prisma
// enum (deferred — see plan TODOS), this is the "summary is usable" predicate
// for the candidate query below.
// ---------------------------------------------------------------------------

const SUCCESS_STATUSES = [
  'COMPLETED',
  'SUCCESS',
  'CACHE_HIT',
  'completed',
  'Success',
] as const;

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

/**
 * Materiality weights for onboarding scoring. Form-type → "intrinsic
 * importance to a retail investor." See plan: 10-K/10-Q dominate, 8-K
 * material, Form 4 routine.
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

/** Composite-score weights. Sum = 1.0. Tunable but document the rationale here. */
const SCORE_WEIGHTS = {
  importance: 0.25, // AI-extracted; null on legacy data so weight kept modest
  materiality: 0.40, // form-type intrinsic importance — dominant on legacy data
  analysisDepth: 0.20, // structural-fidelity: enrichment markers (xSentiment etc.)
  recency: 0.15, // linear decay over 365 days
} as const;

/** Stage-1 candidate cap. Trades coverage vs memory + sort cost. */
const STAGE_1_CANDIDATE_LIMIT = 50;

/**
 * Look up the importance weight for a Summary row. Case-insensitive.
 * Returns the fallback for null or unrecognized values.
 */
function importanceWeight(
  importance: string | null | undefined,
  fallback = 0
): number {
  if (!importance) return fallback;
  return IMPORTANCE_WEIGHTS[importance.toLowerCase()] ?? fallback;
}

/**
 * Pure function: composite score for a Summary candidate.
 *
 *   score = importance(0.25) + materiality(0.40) + analysisDepth(0.20)
 *         + recency(0.15)
 *
 * Weights chosen so legacy summaries (importance=null, smartSubject=null,
 * sparse summaryJSON) degrade gracefully to materiality + recency. New
 * enriched summaries dominate via analysisDepth + importance.
 */
export function calculateCompositeScore(input: {
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

/** Tiebreaker order: importance DESC NULLS LAST, filingDate DESC, id ASC. */
function tiebreak(
  a: { importance: string | null; filingDate: Date; id: string },
  b: { importance: string | null; filingDate: Date; id: string }
): number {
  // Use -1 as fallback so null importance sorts BELOW all known values.
  const aImp = importanceWeight(a.importance, -1);
  const bImp = importanceWeight(b.importance, -1);
  if (aImp !== bImp) return bImp - aImp;
  const aTime = new Date(a.filingDate).getTime();
  const bTime = new Date(b.filingDate).getTime();
  if (aTime !== bTime) return bTime - aTime;
  return a.id.localeCompare(b.id);
}

export interface RankedSummary {
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

/**
 * Pick the single best cached summary across all of a user's tickers.
 *
 * Two-stage select for memory efficiency:
 *   Stage 1 — thin candidate pull (no summaryJSON, no summaryText): score
 *             50 candidates by formula.
 *   Stage 2 — fat re-fetch by id of the winner only: full row for email
 *             render.
 *
 * Returns null if the user has no tickers, or no cached summaries are
 * available across their tickers (the long-tail unique-ticker case).
 */
export async function pickBestSummaryForUser(
  userId: string
): Promise<RankedSummary | null> {
  const prisma = getPrismaClient();

  const tickers = await prisma.ticker.findMany({
    where: { userId },
    select: { symbol: true },
  });
  if (tickers.length === 0) return null;
  const symbols = tickers.map((t) => t.symbol);

  // Stage 1: thin candidate pull — fields needed for ranking + the
  // analysisDepth long-text bonus. summaryText is selected (it's already
  // filtered non-empty by the WHERE clause) so the longSummaryText signal
  // fires during ranking; the full row (filingUrl, ticker relation, etc.)
  // is fetched in Stage 2 for the winner only.
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
    score: calculateCompositeScore({
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

  // Stage 2: fetch the winner's full row for email + hero card render.
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

/**
 * Deliver the single best cached summary as one email through the production
 * wrapper. Idempotent on `User.onboardingFirstEmailSentAt` — re-running for
 * the same user is a no-op.
 *
 * Returns delivery metadata for the caller to log/instrument.
 */
export interface DeliveryResult {
  delivered: boolean;
  reason?:
    | 'already_sent'
    | 'no_tickers'
    | 'no_cached_summaries'
    | 'email_failed'
    | 'internal_error';
  summaryId?: string;
  score?: number;
  error?: string;
}

export async function deliverFirstOnboardingEmail(
  userId: string,
  userEmail: string
): Promise<DeliveryResult> {
  const prisma = getPrismaClient();

  // Idempotency guard — set once, never re-send.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingFirstEmailSentAt: true },
  });
  if (user?.onboardingFirstEmailSentAt) {
    return { delivered: false, reason: 'already_sent' };
  }

  const winner = await pickBestSummaryForUser(userId);
  if (!winner) {
    // Caller is responsible for sending the fallback notice; this function
    // only handles the cached-summary happy path. Reason is reported back.
    const tickerCount = await prisma.ticker.count({ where: { userId } });
    return {
      delivered: false,
      reason: tickerCount === 0 ? 'no_tickers' : 'no_cached_summaries',
    };
  }

  try {
    const result = await sendFilingSummaryEmail(userEmail, {
      companyName: winner.ticker.companyName,
      ticker: winner.ticker.symbol,
      filingType: winner.filingType,
      filingDate: winner.filingDate,
      summary: winner.summaryText,
      filingUrl: winner.url || winner.filingUrl,
      summaryData: winner.summaryJSON as Record<string, unknown> | undefined,
      userId,
      summaryId: winner.id,
      importance: winner.importance ?? undefined,
      smartSubject: winner.smartSubject ?? undefined,
    });

    if (!result.success) {
      return {
        delivered: false,
        reason: 'email_failed',
        summaryId: winner.id,
        error: result.error,
      };
    }

    // Persist idempotency markers + chosen-pick on User row.
    await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingFirstEmailSentAt: new Date(),
        onboardingFirstSummaryId: winner.id,
      },
    });

    // Best-effort delivery tracking row.
    try {
      await prisma.summaryEmailDelivery.create({
        data: {
          summaryId: winner.id,
          userId,
          emailAddress: userEmail,
          deliveryStatus: 'sent',
          metadata: { source: 'onboarding-best-pick' },
        },
      });
    } catch {
      // Unique constraint violation is OK — already delivered.
    }

    return { delivered: true, summaryId: winner.id, score: winner.score };
  } catch (err) {
    return {
      delivered: false,
      reason: 'internal_error',
      summaryId: winner.id,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @deprecated Use `deliverFirstOnboardingEmail` instead.
 *
 * Kept as a thin shim ONLY for the legacy `/api/onboarding?action=deliver-summaries`
 * route in `app/api/onboarding/route.ts`. Once that route is removed (follow-up
 * cleanup once the 3 client trigger sites are deleted), this function and the
 * route both go away.
 */
export async function deliverCachedSummaries(
  userId: string,
  userEmail: string,
  _userName: string
): Promise<{ delivered: number; reason?: string; error?: string }> {
  const result = await deliverFirstOnboardingEmail(userId, userEmail);
  return {
    delivered: result.delivered ? 1 : 0,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}
