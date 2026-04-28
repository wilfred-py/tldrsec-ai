/**
 * X Sentiment enrichment provider.
 *
 * Calls xAI Responses API directly with the `x_search` tool to gather public
 * sentiment for a ticker, then runs the response through the F3 validator
 * (`x-sentiment-validator.ts`) before returning a `{label, context}` payload
 * suitable for prompt injection alongside the other enrichment providers.
 *
 * This provider deliberately does NOT implement the `EnrichmentProvider`
 * interface from `web-search-context.ts` — that interface routes through
 * OpenRouter, but `x_search` is xAI-proprietary and only reachable via
 * `https://api.x.ai/v1/responses` (see tasks/x-sentiment-spike-findings.md).
 *
 * The full validated `XSentiment` object is returned alongside the squeezed
 * `{label, context}` so the caller can persist it on `summaryJSON` for the
 * dashboard surface (Phase 1B). The squeeze keeps the prompt impact bounded
 * (one short label + ≤500-char context) while the full structure stays
 * available downstream.
 *
 * Risk gates applied here, in order:
 *   - Eligibility check (form importance + ticker allowlist)  → F2/F5/D4
 *   - Daily spend cap                                         → cost defense
 *   - Per-call timeout                                        → tail-latency
 *   - F3 output sanitization via validateXSentiment           → prompt injection
 */

import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { callXaiResponses, XaiDirectError } from './xai-direct-client';
import {
  tryDebitEnrichment,
  recordRetryableFailure,
  recordEnrichmentFailureNoRefund,
} from './enrichment-spend';
import type { EnvelopeKind } from '@prisma/client';
import { checkXSentimentEligibility, type EligibilityReason } from './x-sentiment-eligibility';
import {
  validateXSentiment,
  type XSentiment,
  type ValidationStats,
} from './parsers/x-sentiment-validator';

const componentLogger = logger.child('x-sentiment-provider');

const PROVIDER_NAME = 'x_sentiment';
const SECTION_HEADER = 'X SENTIMENT (public discussion)';
// 7-day window calls take 60-90s for moderate-volume tickers (AAPL, NVDA), but
// high-volume tickers (TSLA — Elon-tweets + FSD + retail chatter) push past 120s
// as x_search wades through a far larger candidate post pool. 180s covers p95
// across the mega-cap allowlist without leaving the upstream summarize pipeline
// hanging indefinitely on a stalled xAI call.
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_WINDOW_HOURS = 168; // 7 days — captures pre-filing speculation + post-filing reaction
const MAX_LABEL_LENGTH = 200;
const MAX_CONTEXT_LENGTH = 500;
const APPROX_COST_PER_CALL_USD = 0.05;

export interface XSentimentInput {
  ticker: string;
  formType: string;
  companyName: string;
  /**
   * Accession number of the source filing. Logged with every counter / log line
   * inside the provider so on-call can correlate skip reasons, validator
   * rejections, and cost spikes back to the originating filing.
   */
  accessionNumber?: string;
  windowHours?: number;
  timeoutMs?: number;
}

export type XSentimentSkipReason =
  | EligibilityReason
  | 'budget_exhausted'
  | 'circuit_open'
  | 'xai_error'
  | 'invalid_payload';

export interface XSentimentEnrichment {
  label: string;
  context: string;
  formattedSection: string;
  sentiment: XSentiment;
  stats: ValidationStats;
  costUsd: number;
  latencyMs: number;
}

export interface XSentimentResult {
  enrichment: XSentimentEnrichment | null;
  skipReason?: XSentimentSkipReason;
  errorMessage?: string;
}

/**
 * EDGAR-supplied company names are untrusted input. Strip control chars,
 * collapse whitespace/newlines (defeats `\n\nSYSTEM:` style breaks), drop
 * backticks/triple-quotes, and cap length so a malicious filing can't
 * reframe the prompt around the interpolation point.
 */
function sanitizePromptField(value: string, maxLength = 120): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[`"]{3,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function buildPrompt(ticker: string, companyName: string, windowHours: number): string {
  const safeCompany = sanitizePromptField(companyName);
  const safeTicker = sanitizePromptField(ticker, 16);
  return `You are an equity-research assistant analyzing public discussion on X (Twitter) about ${safeCompany} (${safeTicker}).

Use the x_search tool to gather posts from the last ${windowHours} hours that meet ALL of these criteria:
  - Mention $${safeTicker} or "${safeCompany}" explicitly
  - Have meaningful engagement (likes, reposts, replies)
  - Come from accounts with non-trivial follower counts or verified status

When posts contain images or videos (chart screenshots, product demos, earnings-call clips), incorporate what they depict into the synthesis — but cite the post URL, not the media itself.

Then synthesize a sentiment assessment. Distinguish between:
  - Verifiable facts (numeric, dated, sourced) → factClaims
  - Opinion / interpretation / speculation       → opinionClaims
  - Overall vibe of the discussion               → discussionSynthesis

DO NOT include trading recommendations, price targets, or imperative verbs ("buy", "sell", "load up", "short this"). Describe sentiment, do not prescribe action.

Respond with ONLY valid JSON in this exact shape:
{
  "direction": "bullish" | "bearish" | "mixed" | "neutral" | "no_signal",
  "shift": "shifting_bullish" | "shifting_bearish" | "stable" | "no_signal",
  "confidence": "high" | "medium" | "low",
  "factClaims": ["short factual claim with timestamp/source where possible"],
  "opinionClaims": ["short opinion / interpretation"],
  "discussionSynthesis": "1-2 sentence neutral summary of the overall conversation",
  "citationUrls": ["https://x.com/..."],
  "windowHours": ${windowHours}
}

If the discussion is too sparse or contradictory to call, return direction="no_signal", confidence="low", and leave the claim arrays empty.`;
}

function tryParseModelJson(text: string): unknown {
  if (!text) return null;
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenceMatch ? fenceMatch[1] : trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildLabel(s: XSentiment): string {
  const dir = s.direction;
  const shift = s.shift !== 'no_signal' && s.shift !== 'stable' ? `, ${s.shift.replace('_', ' ')}` : '';
  const conf = `(${s.confidence} confidence)`;
  return `${dir}${shift} ${conf}`.slice(0, MAX_LABEL_LENGTH);
}

function buildContext(s: XSentiment): string {
  const parts: string[] = [];
  if (s.discussionSynthesis) {
    parts.push(s.discussionSynthesis);
  }
  if (s.factClaims.length > 0) {
    parts.push(`Facts: ${s.factClaims.slice(0, 2).join(' | ')}`);
  }
  if (s.opinionClaims.length > 0) {
    parts.push(`Opinion: ${s.opinionClaims.slice(0, 2).join(' | ')}`);
  }
  return parts.join(' — ').slice(0, MAX_CONTEXT_LENGTH);
}

/**
 * Run the X-sentiment enrichment for a single filing. Returns a structured
 * result indicating either an enrichment payload or a skip reason — never
 * throws. Caller is expected to log and degrade gracefully.
 */
export async function getXSentiment(input: XSentimentInput): Promise<XSentimentResult> {
  const accessionNumber = input.accessionNumber;
  const eligibility = checkXSentimentEligibility({
    ticker: input.ticker,
    formType: input.formType,
  });
  if (!eligibility.eligible) {
    monitoring.incrementCounter(`ai.${PROVIDER_NAME}_skipped_${eligibility.reason}`, 1);
    return { enrichment: null, skipReason: eligibility.reason };
  }

  // Stable requestId — accession+ticker is unique per filing, so retries
  // (handler retry, isolate replay, manual re-summarize) hit the idempotent
  // ledger entry instead of double-debiting. `noacc` fallback only matters
  // for ad-hoc calls outside the cron path.
  const requestId = `${accessionNumber ?? 'noacc'}-${eligibility.ticker}-x_sentiment`;
  const debit = await tryDebitEnrichment(
    'x_sentiment' as EnvelopeKind,
    APPROX_COST_PER_CALL_USD,
    requestId,
  );
  if (!debit.ok) {
    const skipReason: XSentimentSkipReason = debit.reason === 'cap_reached' ? 'budget_exhausted' : 'circuit_open';
    componentLogger.info('x_sentiment debit rejected', {
      ticker: eligibility.ticker,
      accessionNumber,
      reason: debit.reason,
    });
    return { enrichment: null, skipReason };
  }

  const ticker = eligibility.ticker;
  const windowHours = Math.max(1, Math.min(168, input.windowHours ?? DEFAULT_WINDOW_HOURS));
  const prompt = buildPrompt(ticker, input.companyName, windowHours);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  monitoring.incrementCounter(`ai.${PROVIDER_NAME}_attempted`, 1);
  componentLogger.info('Calling xAI x_search for sentiment', { ticker, accessionNumber, windowHours });

  let response: Awaited<ReturnType<typeof callXaiResponses>>;
  try {
    response = await callXaiResponses({
      input: prompt,
      // Image + video understanding lets x_search incorporate visual posts
      // (chart screenshots, product demos, earnings-call clips) into the
      // sentiment synthesis. Increases token usage — actual cost is reconciled
      // against the budget envelope via response.usage.costUsd.
      tools: [
        {
          type: 'x_search',
          enable_image_understanding: true,
          enable_video_understanding: true,
        },
      ],
      timeoutMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isRetryable = err instanceof XaiDirectError ? err.retryable : true;
    monitoring.incrementCounter(`ai.${PROVIDER_NAME}_xai_error`, 1);
    componentLogger.warn('xAI x_search call failed', {
      ticker,
      accessionNumber,
      error: message,
      retryable: isRetryable,
    });
    if (isRetryable) {
      const refund = await recordRetryableFailure('x_sentiment' as EnvelopeKind, requestId);
      if (refund.refundedUsd > 0) {
        monitoring.incrementCounter(`ai.${PROVIDER_NAME}_refunded`, 1);
      }
    } else {
      // Non-retryable (auth/programmer error): drain budget so the breaker eventually opens.
      await recordEnrichmentFailureNoRefund('x_sentiment' as EnvelopeKind);
    }
    return { enrichment: null, skipReason: 'xai_error', errorMessage: message };
  }

  const parsed = tryParseModelJson(response.text);
  if (!parsed) {
    monitoring.incrementCounter(`ai.${PROVIDER_NAME}_invalid_payload`, 1);
    componentLogger.warn('x_sentiment response was not parseable JSON', {
      ticker,
      accessionNumber,
      sample: response.text.slice(0, 200),
    });
    // Slow-loss: cost was spent but output is unusable. No refund — let the
    // breaker open if this keeps happening.
    await recordEnrichmentFailureNoRefund('x_sentiment' as EnvelopeKind);
    return { enrichment: null, skipReason: 'invalid_payload' };
  }

  // Pass model-emitted citations into validator if the parsed payload omits them
  // (defensive — we trust the validator's URL-trust logic but want it to have the
  // correct citation set to compare against).
  if (parsed && typeof parsed === 'object' && !Array.isArray((parsed as Record<string, unknown>).citationUrls)) {
    (parsed as Record<string, unknown>).citationUrls = response.citationUrls;
  }

  const validation = validateXSentiment(parsed);
  if (!validation.sentiment) {
    monitoring.incrementCounter(`ai.${PROVIDER_NAME}_validator_rejected`, 1);
    componentLogger.warn('x_sentiment payload rejected by validator', {
      ticker,
      accessionNumber,
      reason: validation.rejectionReason,
    });
    // Slow-loss path the breaker exists to catch — payload cost real money but
    // failed validation. No refund.
    await recordEnrichmentFailureNoRefund('x_sentiment' as EnvelopeKind);
    return { enrichment: null, skipReason: 'invalid_payload', errorMessage: validation.rejectionReason };
  }

  // The validator clamps a model-emitted windowHours to [1,168] but otherwise
  // trusts what the model echoed. The provider is the source of truth for the
  // window the prompt actually requested — overwrite so persisted state matches
  // what was queried, not what the model guessed.
  const sentiment = { ...validation.sentiment, windowHours };
  const label = buildLabel(sentiment);
  const context = buildContext(sentiment);
  const formattedSection = `--- ${SECTION_HEADER} ---\n${label}: ${context}`;

  // Direction + confidence tags drive the G5 "signal direction distribution"
  // and confidence-floor dashboards. Without tags, every emission collapses
  // into one bucket and we can't detect drift in the bullish/no_signal mix
  // that's the whole point of the gate.
  monitoring.incrementCounter(`ai.${PROVIDER_NAME}_added`, 1, {
    direction: sentiment.direction,
    confidence: sentiment.confidence,
  });
  // Per-strip counters power the G5 "schema-validator strip rate" dashboard.
  // We only emit on success (not validator rejection) so the rate denominator
  // is "responses that survived to enrichment", which is the slice operators
  // care about — strips on rejected payloads are noise.
  if (validation.stats.imperativeStrips > 0) {
    monitoring.incrementCounter(
      `ai.${PROVIDER_NAME}_imperative_stripped`,
      validation.stats.imperativeStrips,
    );
  }
  if (validation.stats.priceTargetStrips > 0) {
    monitoring.incrementCounter(
      `ai.${PROVIDER_NAME}_price_target_stripped`,
      validation.stats.priceTargetStrips,
    );
  }
  if (validation.stats.urlsStripped > 0) {
    monitoring.incrementCounter(
      `ai.${PROVIDER_NAME}_url_stripped`,
      validation.stats.urlsStripped,
    );
  }
  if (validation.stats.confidenceDemoted) {
    monitoring.incrementCounter(`ai.${PROVIDER_NAME}_confidence_demoted`, 1);
  }
  // Citation count is the "validity proxy" we have without a network call.
  // Real URL-resolution checks live in the post-merge hardening backlog;
  // for pre-merge G5 the count + the URL-stripped counter are enough to
  // detect a drop in citation density.
  monitoring.recordValue(
    `ai.${PROVIDER_NAME}_citation_count`,
    sentiment.citationUrls.length,
  );
  monitoring.recordValue(`ai.${PROVIDER_NAME}_cost_usd`, response.usage.costUsd);
  monitoring.recordValue(`ai.${PROVIDER_NAME}_latency_ms`, response.latencyMs);
  componentLogger.info('x_sentiment enrichment ready', {
    ticker,
    accessionNumber,
    direction: sentiment.direction,
    confidence: sentiment.confidence,
    costUsd: response.usage.costUsd,
    latencyMs: response.latencyMs,
  });

  return {
    enrichment: {
      label,
      context,
      formattedSection,
      sentiment,
      stats: validation.stats,
      costUsd: response.usage.costUsd,
      latencyMs: response.latencyMs,
    },
  };
}

export const _internal = {
  PROVIDER_NAME,
  SECTION_HEADER,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WINDOW_HOURS,
  MAX_LABEL_LENGTH,
  MAX_CONTEXT_LENGTH,
  APPROX_COST_PER_CALL_USD,
  buildPrompt,
  sanitizePromptField,
  tryParseModelJson,
  buildLabel,
  buildContext,
};
