/**
 * Enrichment rollout gates: PostHog feature flags + daily spend cap.
 *
 * Shared defensively-failing helpers that gate whether web-search enrichment
 * should run. All failure modes return `false` (enrichment skipped) so template
 * fallback copy always renders.
 */

import { getServerPostHog } from '../analytics/posthog-server';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

const componentLogger = logger.child('enrichment-flags');

/** Daily spend cap for enrichment, env-overridable (W3.9). */
const DAILY_ENRICHMENT_CAP_USD = Number(process.env.ENRICHMENT_DAILY_CAP_USD ?? 5);

/** Approximate per-call enrichment spend estimate in USD (Grok 4.1 Fast + web search). */
const APPROX_COST_PER_ENRICHMENT_CALL_USD = 0.003;

/** Top-level feature flag — gates the entire enrichment path. */
const TOP_LEVEL_FLAG = 'why_it_matters_enrichment';

/** Per-provider flags — accessionNumber as distinctId for stable bucketing. */
const PROVIDER_FLAGS: Record<string, string> = {
  counterparty: 'why_it_matters_counterparty',
  governance: 'why_it_matters_governance',
  debt_issuance: 'why_it_matters_debt',
  earnings: 'why_it_matters_earnings',
  capital_return: 'why_it_matters_capital_return',
};

async function evaluateFlag(flagKey: string, distinctId: string): Promise<boolean> {
  const posthog = getServerPostHog();
  if (!posthog) {
    // No PostHog configured — keep feature off by default.
    return false;
  }
  try {
    const value = await posthog.getFeatureFlag(flagKey, distinctId);
    return value === true || value === 'true';
  } catch (error) {
    componentLogger.warn(`PostHog flag evaluation failed for ${flagKey}, defaulting to off`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Gate for the entire enrichment path. Short-circuits before any provider work.
 * Returns false on any PostHog error (fail-safe off).
 */
export async function isWhyItMattersEnabled(accessionNumber: string): Promise<boolean> {
  return evaluateFlag(TOP_LEVEL_FLAG, accessionNumber);
}

/**
 * Gate for a specific provider. Callers should ALSO check `isWhyItMattersEnabled`
 * at the top level so the whole path can be killed via one flag.
 */
export async function isProviderEnabled(providerName: string, accessionNumber: string): Promise<boolean> {
  const flagKey = PROVIDER_FLAGS[providerName];
  if (!flagKey) {
    componentLogger.warn(`Unknown provider name for flag lookup: ${providerName}`);
    return false;
  }
  return evaluateFlag(flagKey, accessionNumber);
}

// ─── Daily Spend Cap (W3.9) ──────────────────────────────────────────────────
//
// Process-local daily spend counter. Resets on process restart and at midnight
// local time. Pre-revenue guardrail against traffic spikes or classification
// bugs that would fan out enrichment calls.

interface DailySpendState {
  date: string; // ISO YYYY-MM-DD
  usd: number;
}

let dailySpend: DailySpendState = { date: todayIsoDate(), usd: 0 };

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

function rotateIfNewDay(): void {
  const today = todayIsoDate();
  if (dailySpend.date !== today) {
    dailySpend = { date: today, usd: 0 };
  }
}

/**
 * Cheap top-level gate: returns true if the accumulator hasn't already crossed
 * the cap. Does NOT reserve budget — callers must still use
 * `tryDebitEnrichmentBudget` to atomically check-and-debit per call.
 */
export function isWithinDailyEnrichmentBudget(): boolean {
  rotateIfNewDay();
  const within = dailySpend.usd < DAILY_ENRICHMENT_CAP_USD;
  if (!within) {
    componentLogger.warn('Daily enrichment spend cap reached', {
      spent: dailySpend.usd,
      cap: DAILY_ENRICHMENT_CAP_USD,
    });
    monitoring.incrementCounter('ai.enrichment_capped_by_spend', 1);
  }
  return within;
}

/**
 * Atomic check-and-debit. Returns `true` iff the projected spend after this
 * call stays within the cap; in that case the accumulator is incremented
 * before returning. Node's event loop is single-threaded, so the
 * read-then-write inside this function is effectively atomic with respect to
 * concurrent callers — fixing the race the pair of
 * `isWithinDailyEnrichmentBudget()` + `recordEnrichmentCallSpend()` had.
 *
 * Returning `false` also counts a cap-hit for observability.
 */
export function tryDebitEnrichmentBudget(
  costUsd: number = APPROX_COST_PER_ENRICHMENT_CALL_USD,
): boolean {
  rotateIfNewDay();
  if (dailySpend.usd + costUsd > DAILY_ENRICHMENT_CAP_USD) {
    monitoring.incrementCounter('ai.enrichment_capped_by_spend', 1);
    return false;
  }
  dailySpend.usd += costUsd;
  return true;
}

/** Exposed for tests — reset in-process spend accumulator. */
export function _resetDailyEnrichmentSpend(): void {
  dailySpend = { date: todayIsoDate(), usd: 0 };
}

/** Exposed for tests. */
export const _internal = {
  DAILY_ENRICHMENT_CAP_USD,
  APPROX_COST_PER_ENRICHMENT_CALL_USD,
  TOP_LEVEL_FLAG,
  PROVIDER_FLAGS,
  get dailySpend() {
    return dailySpend;
  },
};
