/**
 * Enrichment rollout gates: PostHog feature flags only.
 *
 * The daily-spend cap moved to `lib/ai/enrichment-spend.ts` (Postgres-backed
 * ledger, multi-isolate-safe, per-envelope independent caps). This module is
 * now flag-evaluation only.
 */

import { logger } from '../logging';

const componentLogger = logger.child('enrichment-flags');

/** Top-level feature flag — gates the entire enrichment path. */
const TOP_LEVEL_FLAG = 'why_it_matters_enrichment';

/** Per-provider flags — accessionNumber as distinctId for stable bucketing. */
const PROVIDER_FLAGS: Record<string, string> = {
  counterparty: 'why_it_matters_counterparty',
  governance: 'why_it_matters_governance',
  debt_issuance: 'why_it_matters_debt',
  earnings: 'why_it_matters_earnings',
  capital_return: 'why_it_matters_capital_return',
  x_sentiment: 'x_sentiment_enrichment',
};

async function evaluateFlag(flagKey: string, distinctId: string): Promise<boolean> {
  // Dev/QA bypass: ENRICHMENT_FORCE_ENABLE=1 short-circuits every flag to true so
  // test scripts can exercise enrichment without provisioning PostHog flags.
  // NEVER set this in production — it disables the kill-switch.
  if (process.env.ENRICHMENT_FORCE_ENABLE === '1') {
    return true;
  }
  try {
    // Dynamic import prevents posthog-node (Node-only deps like `readline`)
    // from being pulled into any client bundle that transitively imports
    // this module via the summarize pipeline.
    const { getServerPostHog } = await import('../analytics/posthog-server');
    const posthog = getServerPostHog();
    if (!posthog) {
      return false;
    }
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

/** Earnings-mini-deep-dive flag — gates the materialitySignal field on 10-K/10-Q
 * summary prompts. When false, the prompt schema omits materialitySignal entirely
 * and the rubric section is stripped from extraction guidance. Cohort-gated per
 * autoplan plan: Day 1 internal users only, Day 4 = 10% of allowlisted-ticker
 * users, Day 14 = 100%. Kill-switch metric: unsubscribe rate > 1.5x 7-day
 * baseline triggers auto-rollback. */
const EARNINGS_MINI_DEEP_DIVE_FLAG = 'enable_earnings_mini_deep_dive';

/**
 * Gate for the materialitySignal field on 10-K/10-Q summaries.
 * Uses accessionNumber as distinctId for stable per-filing bucketing.
 * Returns false on any PostHog error (fail-safe off).
 */
export async function isEarningsMiniDeepDiveEnabled(accessionNumber: string): Promise<boolean> {
  return evaluateFlag(EARNINGS_MINI_DEEP_DIVE_FLAG, accessionNumber);
}

/** Exposed for tests. */
export const _internal = {
  TOP_LEVEL_FLAG,
  PROVIDER_FLAGS,
  EARNINGS_MINI_DEEP_DIVE_FLAG,
};
