/**
 * Shared Web Search Enrichment Module
 *
 * Generic interface for enriching SEC filing summaries with web-sourced context.
 * Each provider detects whether it applies, builds a search prompt, and parses
 * the response. The orchestrator runs applicable providers in parallel under
 * per-provider and global timeout budgets.
 *
 * Providers (all built via createItemBasedProvider):
 * - counterparty: M&A counterparty identification (Item 1.01/2.01)
 * - governance: Director/officer context (Item 5.02/5.07)
 * - debtIssuance: Debt offering context (424B2/424B3/FWP)
 * - earnings: Earnings-release context (8-K Item 2.02)
 * - capitalReturn: Buyback/dividend context (8-K Item 8.01)
 */

import { logger } from '../logging';
import { monitoring } from '../monitoring';
import {
  tryDebitEnrichment,
  recordRetryableFailure,
  recordEnrichmentFailureNoRefund,
} from './enrichment-spend';
import type { EnvelopeKind } from '@prisma/client';

const componentLogger = logger.child('web-search-context');

/** Total timeout budget for all enrichment providers combined */
const DEFAULT_TOTAL_TIMEOUT_MS = 45_000;

/** Per-provider hard cap on in-flight LLM call (W3.2 two-tier timeout) */
const PER_PROVIDER_MAX_MS = 20_000;

/** Max tokens for each search response */
const SEARCH_MAX_TOKENS = 500;

/** Max chars for label and context fields */
const MAX_LABEL_LENGTH = 200;
const MAX_CONTEXT_LENGTH = 500;

/** Total combined enrichment text cap (W3.7) — code-enforced drop-not-truncate */
const MAX_TOTAL_ENRICHMENT_CHARS = 2000;

/** In-memory enrichment cache TTL (W3.6) — prevents retry-driven double-spend */
const ENRICHMENT_CACHE_TTL_MS = 10 * 60 * 1000;

/** Per-provider OpenRouter web-search call cost — drives the why_it_matters debit. */
const APPROX_COST_PER_ENRICHMENT_CALL_USD = 0.003;

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface EnrichmentResult {
  label: string;
  context: string;
}

export interface EnrichmentProvider {
  /** Unique name for logging and metrics */
  name: string;
  /** Header label for the enrichment section injected into the prompt */
  sectionHeader: string;
  /** Returns true if this provider should run for the given filing */
  detect(content: string, formType: string): boolean;
  /** Build system + user prompts for the web search LLM call */
  buildPrompt(excerpt: string, companyName: string, ticker: string): { system: string; user: string };
  /** Parse the LLM response JSON into a structured result */
  parseResponse(raw: string): EnrichmentResult | null;
  /** Max chars of filing content to send as excerpt */
  maxExcerptLength: number;
}

// ─── Item-Based Provider Factory ─────────────────────────────────────────────

export interface ItemBasedProviderConfig {
  name: string;
  sectionHeader: string;
  formTypes: string[];
  itemPattern: RegExp;
  keywords: string[];
  maxExcerptLength: number;
  systemPrompt: string;
  buildUserPrompt: (excerpt: string, companyName: string, ticker: string) => string;
}

/**
 * Factory for SEC-item-gated enrichment providers.
 * All providers share the same `{label, context}` LLM response contract —
 * provider-specific semantics live inside the user prompt text.
 */
export function createItemBasedProvider(config: ItemBasedProviderConfig): EnrichmentProvider {
  const normalizedFormTypes = config.formTypes.map(t => t.toUpperCase());
  return {
    name: config.name,
    sectionHeader: config.sectionHeader,
    maxExcerptLength: config.maxExcerptLength,

    detect(content: string, formType: string): boolean {
      if (!formType) return false;
      if (!normalizedFormTypes.includes(formType.toUpperCase())) return false;
      if (!config.itemPattern.test(content)) return false;
      const lowerContent = content.toLowerCase();
      return config.keywords.some(keyword => lowerContent.includes(keyword));
    },

    buildPrompt(excerpt: string, companyName: string, ticker: string) {
      return {
        system: config.systemPrompt,
        user: config.buildUserPrompt(excerpt, companyName, ticker),
      };
    },

    parseResponse(raw: string): EnrichmentResult | null {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.label || !parsed.context) return null;
      return {
        label: String(parsed.label).slice(0, MAX_LABEL_LENGTH),
        context: String(parsed.context).slice(0, MAX_CONTEXT_LENGTH),
      };
    },
  };
}

// ─── Counterparty Provider (M&A) ─────────────────────────────────────────────

const MA_ITEM_PATTERN = /Item\s+[12]\.01/i;
const MA_KEYWORDS = ['acqui', 'merger', 'business combination', 'merge ', 'purchase agreement'];

export const counterpartyProvider = createItemBasedProvider({
  name: 'counterparty',
  sectionHeader: 'COUNTERPARTY CONTEXT (web search)',
  formTypes: ['8-K', '8-K/A'],
  itemPattern: MA_ITEM_PATTERN,
  keywords: MA_KEYWORDS,
  maxExcerptLength: 2000,
  systemPrompt: 'You are a financial research assistant. Extract counterparty information from SEC filings and provide investor-relevant context. Respond with valid JSON only.',
  buildUserPrompt: (excerpt, companyName, ticker) => `This 8-K filing excerpt describes an acquisition or merger by ${companyName} (${ticker}).

1) Extract the exact legal name of the company being acquired or merged with.
2) Search the web for that company.
3) In 2-3 sentences, describe who they are, what they do, their approximate size or market position, and why this deal matters to ${ticker} investors.

Respond with ONLY valid JSON in this exact format:
{"label": "Exact Company Name LLC", "context": "2-3 sentence description"}

<filing_excerpt>
${excerpt}
</filing_excerpt>`,
});

/** Kept as a named export for callers (e.g. summarize.ts) that gate on M&A detection. */
export const isMAFiling = (content: string, formType: string): boolean =>
  counterpartyProvider.detect(content, formType);

// ─── Governance Provider (Director/Officer) ──────────────────────────────────

const GOVERNANCE_ITEM_PATTERN = /Item\s+5\.0[27]/i;
const GOVERNANCE_KEYWORDS = [
  'director', 'board', 'resign', 'appoint', 're-election',
  'non-reelection', 'depart', 'officer', 'principal officer',
  'not stand for', 'will not stand',
];

export const governanceProvider = createItemBasedProvider({
  name: 'governance',
  sectionHeader: 'GOVERNANCE CONTEXT (web search)',
  formTypes: ['8-K', '8-K/A'],
  itemPattern: GOVERNANCE_ITEM_PATTERN,
  keywords: GOVERNANCE_KEYWORDS,
  maxExcerptLength: 2000,
  systemPrompt: 'You are a corporate governance research assistant. Extract director and officer information from SEC filings and provide investor-relevant context about the people involved and why the governance change matters. Respond with valid JSON only.',
  buildUserPrompt: (excerpt, companyName, ticker) => `This 8-K filing excerpt describes a director or officer change at ${companyName} (${ticker}).

1) Extract the names of the directors or officers mentioned (departing, appointed, or standing for re-election).
2) Search the web for the most prominent person named.
3) In 2-3 sentences, describe their background, current roles, and why this governance change matters to ${ticker} shareholders.

Respond with ONLY valid JSON in this exact format:
{"label": "Full Name", "context": "2-3 sentence description of who they are and why this matters"}

<filing_excerpt>
${excerpt}
</filing_excerpt>`,
});

export const isGovernanceFiling = (content: string, formType: string): boolean =>
  governanceProvider.detect(content, formType);

// ─── Debt Issuance Provider (424B2/424B3/FWP) ────────────────────────────────

const DEBT_ITEM_PATTERN = /(senior\s+notes|subordinated|secured\s+notes|debenture|coupon|indenture|pricing\s+supplement|notes\s+due)/i;
const DEBT_KEYWORDS = [
  'notes due', 'senior notes', 'subordinated', 'debenture', 'pricing supplement',
  'coupon', 'indenture', 'use of proceeds',
];

export const debtIssuanceProvider = createItemBasedProvider({
  name: 'debt_issuance',
  sectionHeader: 'DEBT ISSUANCE CONTEXT (web search)',
  formTypes: ['424B2', '424B3', 'FWP'],
  itemPattern: DEBT_ITEM_PATTERN,
  keywords: DEBT_KEYWORDS,
  maxExcerptLength: 2500,
  systemPrompt: 'You are a credit markets research assistant. Analyze a debt-issuance filing and place its terms in current-market context. Respond with valid JSON only.',
  buildUserPrompt: (excerpt, companyName, ticker) => `This filing excerpt describes a debt issuance by ${companyName} (${ticker}).

Using web search where helpful, in 2-3 sentences cover:
1) Current comparable-maturity IG/HY benchmark spreads — are these terms favorable vs peers?
2) The issuer's stated use of proceeds (refinancing vs net new debt vs M&A vs general corporate).
3) Whether the notes are secured/senior/subordinated and any collateral structure.

Label should be a one-line summary of the tranche (e.g., "$500M 10-yr senior notes @ 5.25%").

Respond with ONLY valid JSON in this exact format:
{"label": "One-line tranche summary", "context": "2-3 sentence market-grounded analysis"}

<filing_excerpt>
${excerpt}
</filing_excerpt>`,
});

// ─── Earnings Provider (8-K Item 2.02) ───────────────────────────────────────

const EARNINGS_ITEM_PATTERN = /Item\s+2\.02/i;
const EARNINGS_KEYWORDS = [
  'results of operations', 'financial results', 'earnings', 'revenue',
  'eps', 'guidance', 'quarter', 'fiscal',
];

export const earningsProvider = createItemBasedProvider({
  name: 'earnings',
  sectionHeader: 'EARNINGS CONTEXT (web search)',
  formTypes: ['8-K', '8-K/A'],
  itemPattern: EARNINGS_ITEM_PATTERN,
  keywords: EARNINGS_KEYWORDS,
  maxExcerptLength: 2500,
  systemPrompt: 'You are an equity research assistant. Compare reported earnings against consensus expectations and guidance. Respond with valid JSON only.',
  buildUserPrompt: (excerpt, companyName, ticker) => `This 8-K Item 2.02 filing excerpt contains an earnings release from ${companyName} (${ticker}).

Using web search where helpful, in 2-3 sentences cover:
1) Consensus expectations for the reported quarter (revenue and EPS).
2) Whether the result was a beat, miss, or in-line relative to consensus.
3) Recent prior-day close and any guidance trajectory vs prior quarters.

Label should be a one-line beat/miss classification (e.g., "Q3 revenue beat, EPS in-line").

Respond with ONLY valid JSON in this exact format:
{"label": "Beat/miss classification", "context": "2-3 sentence market-grounded analysis"}

<filing_excerpt>
${excerpt}
</filing_excerpt>`,
});

// ─── Capital Return Provider (8-K Item 8.01) ─────────────────────────────────

const CAPITAL_RETURN_ITEM_PATTERN = /Item\s+8\.01/i;
const CAPITAL_RETURN_KEYWORDS = [
  'repurchase', 'buyback', 'share repurchase', 'dividend', 'return of capital',
  'authorization', 'tender offer',
];

export const capitalReturnProvider = createItemBasedProvider({
  name: 'capital_return',
  sectionHeader: 'CAPITAL RETURN CONTEXT (web search)',
  formTypes: ['8-K', '8-K/A'],
  itemPattern: CAPITAL_RETURN_ITEM_PATTERN,
  keywords: CAPITAL_RETURN_KEYWORDS,
  maxExcerptLength: 2000,
  systemPrompt: 'You are a capital allocation research assistant. Place a buyback or dividend authorization in context of market cap, peers, and prior programs. Respond with valid JSON only.',
  buildUserPrompt: (excerpt, companyName, ticker) => `This 8-K Item 8.01 filing excerpt describes a capital-return action by ${companyName} (${ticker}).

Using web search where helpful, in 2-3 sentences cover:
1) Authorization size as a % of current market cap.
2) Peer / prior-authorization context — is this a fresh auth, extension, or acceleration?
3) Cash position or leverage context that makes the action meaningful.

Label should be a one-line summary (e.g., "$2B buyback, ~7% of market cap, 4x prior").

Respond with ONLY valid JSON in this exact format:
{"label": "One-line summary", "context": "2-3 sentence market-grounded analysis"}

<filing_excerpt>
${excerpt}
</filing_excerpt>`,
});

// ─── Enrichment Cache (W3.6) ──────────────────────────────────────────────────

interface CacheEntry {
  results: string[];
  expiresAt: number;
}

const enrichmentCache = new Map<string, CacheEntry>();

/** Exposed for tests — clears the in-memory cache. */
export function _clearEnrichmentCache(): void {
  enrichmentCache.clear();
}

function getCached(key: string): string[] | null {
  const entry = enrichmentCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    enrichmentCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCached(key: string, results: string[]): void {
  enrichmentCache.set(key, {
    results,
    expiresAt: Date.now() + ENRICHMENT_CACHE_TTL_MS,
  });
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run all applicable enrichment providers in parallel under per-provider +
 * global timeout budgets. Returns formatted context strings ready to inject
 * into the summarization prompt. Total output is capped at
 * MAX_TOTAL_ENRICHMENT_CHARS via drop-not-truncate.
 */
export async function runEnrichment(
  providers: EnrichmentProvider[],
  content: string,
  formType: string,
  companyName: string,
  ticker: string,
  options: {
    totalTimeoutMs?: number;
    perProviderTimeoutMs?: number;
    _fetchImpl?: typeof fetch;
    cacheKey?: string;
    /**
     * Filing accession — required to mint a stable per-(provider, filing) requestId
     * so retries hit the idempotent ledger entry instead of double-debiting. Falls
     * back to `cacheKey` then `'noacc'` for legacy callers.
     */
    accessionNumber?: string;
  } = {},
): Promise<string[]> {
  const totalTimeout = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const perProviderTimeout = options.perProviderTimeoutMs ?? PER_PROVIDER_MAX_MS;
  const fetchImpl = options._fetchImpl ?? fetch;

  // Cache lookup (W3.6) — prevents retry-driven double-spend
  if (options.cacheKey) {
    const cached = getCached(options.cacheKey);
    if (cached) {
      monitoring.incrementCounter('ai.enrichment_cache_hit', 1);
      return cached;
    }
  }

  const apiKey = process.env.TLDRSEC_AI_SUMMARIZER || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    componentLogger.warn('No OpenRouter API key available for enrichment');
    return [];
  }

  const model = process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4.1-fast';

  const applicable = providers.filter(p => p.detect(content, formType));
  if (applicable.length === 0) {
    return [];
  }

  const startTime = Date.now();
  const globalAbort = new AbortController();
  const globalTimeoutId = setTimeout(() => globalAbort.abort(), totalTimeout);
  const requestIdSeed = options.accessionNumber ?? options.cacheKey ?? 'noacc';

  try {
    const settled = await Promise.allSettled(
      applicable.map(provider => runSingleProvider(provider, {
        content,
        companyName,
        ticker,
        apiKey,
        model,
        perProviderTimeout,
        startTime,
        totalTimeout,
        fetchImpl,
        globalSignal: globalAbort.signal,
        requestIdSeed,
      })),
    );

    // Apply 2000-char drop-not-truncate cap in provider execution order (W3.7)
    const results: string[] = [];
    let totalChars = 0;
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      const provider = applicable[i];
      if (outcome.status !== 'fulfilled' || outcome.value === null) {
        continue;
      }
      const next = outcome.value;
      const joinedLen = results.length > 0 ? totalChars + 1 + next.length : next.length;
      if (joinedLen > MAX_TOTAL_ENRICHMENT_CHARS) {
        componentLogger.info(`Enrichment cap reached, dropping ${provider.name}`, {
          totalChars,
          nextLen: next.length,
        });
        monitoring.incrementCounter('ai.enrichment_capped', 1);
        continue;
      }
      results.push(next);
      totalChars = joinedLen;
    }

    if (options.cacheKey) {
      setCached(options.cacheKey, results);
    }
    return results;
  } finally {
    clearTimeout(globalTimeoutId);
  }
}

interface ProviderRunArgs {
  content: string;
  companyName: string;
  ticker: string;
  apiKey: string;
  model: string;
  perProviderTimeout: number;
  startTime: number;
  totalTimeout: number;
  fetchImpl: typeof fetch;
  globalSignal: AbortSignal;
  requestIdSeed: string;
}

async function runSingleProvider(
  provider: EnrichmentProvider,
  args: ProviderRunArgs,
): Promise<string | null> {
  const elapsed = Date.now() - args.startTime;
  const remainingGlobal = args.totalTimeout - elapsed;
  if (remainingGlobal <= 1000) {
    componentLogger.info(`Enrichment global budget exhausted, skipping ${provider.name}`, {
      elapsed,
    });
    return null;
  }

  const effectiveTimeout = Math.min(args.perProviderTimeout, remainingGlobal);

  // Atomic check-and-debit against the Postgres-backed why_it_matters envelope.
  // RequestId is stable per-(filing, provider) so retries hit the idempotent
  // ledger entry. A filing that fans out to N providers counts N times against
  // the cap, and concurrent isolates can't race past it.
  const requestId = `${args.requestIdSeed}-${provider.name}`;
  const debit = await tryDebitEnrichment(
    'why_it_matters' as EnvelopeKind,
    APPROX_COST_PER_ENRICHMENT_CALL_USD,
    requestId,
  );
  if (!debit.ok) {
    componentLogger.info(`Enrichment debit rejected, skipping ${provider.name}`, {
      reason: debit.reason,
    });
    return null;
  }

  componentLogger.info(`${provider.name} filing detected, searching for context`, { ticker: args.ticker });
  monitoring.incrementCounter(`ai.${provider.name}_context_attempted`, 1);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
  const onGlobalAbort = () => controller.abort();
  args.globalSignal.addEventListener('abort', onGlobalAbort, { once: true });

  try {
    const excerpt = args.content.slice(0, provider.maxExcerptLength);
    const prompts = provider.buildPrompt(excerpt, args.companyName, args.ticker);

    const response = await args.fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${args.apiKey}`,
        'HTTP-Referer': 'https://tldrsec.app',
        'X-Title': 'TLDRSEC.AI',
      },
      body: JSON.stringify({
        model: args.model,
        messages: [
          { role: 'system', content: prompts.system },
          { role: 'user', content: prompts.user },
        ],
        tools: [{ type: 'openrouter:web_search' }],
        max_tokens: SEARCH_MAX_TOKENS,
        temperature: 0.2,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      componentLogger.warn(`${provider.name} search API error`, {
        status: response.status,
        statusText: response.statusText,
      });
      monitoring.incrementCounter(`ai.${provider.name}_context_error`, 1);
      // 5xx and 429 → upstream transient; refund + breaker increment so retries
      // don't double-charge. 4xx (auth, validation) → programmer error; drain
      // budget as a forcing function.
      if (response.status >= 500 || response.status === 429) {
        const refund = await recordRetryableFailure('why_it_matters' as EnvelopeKind, requestId);
        if (refund.refundedUsd > 0) {
          monitoring.incrementCounter(`ai.${provider.name}_refunded`, 1);
        }
      } else {
        await recordEnrichmentFailureNoRefund('why_it_matters' as EnvelopeKind);
      }
      return null;
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const responseContent = data?.choices?.[0]?.message?.content;

    if (!responseContent || typeof responseContent !== 'string') {
      componentLogger.warn(`${provider.name} search returned empty content`);
      // Slow-loss: cost was spent on an empty response. No refund.
      await recordEnrichmentFailureNoRefund('why_it_matters' as EnvelopeKind);
      return null;
    }

    const fenceMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = (fenceMatch ? fenceMatch[1] : responseContent).trim();

    let result: EnrichmentResult | null = null;
    try {
      result = provider.parseResponse(jsonStr);
    } catch (parseErr) {
      componentLogger.warn(`${provider.name} search returned malformed JSON`, {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      monitoring.incrementCounter(`ai.${provider.name}_context_error`, 1);
      // Slow-loss: model-side malformation. No refund.
      await recordEnrichmentFailureNoRefund('why_it_matters' as EnvelopeKind);
      return null;
    }

    if (!result) {
      componentLogger.info(`No ${provider.name} context available`, { ticker: args.ticker });
      // Parser returned null (missing required fields). Cost spent, output
      // unusable → slow-loss, no refund.
      await recordEnrichmentFailureNoRefund('why_it_matters' as EnvelopeKind);
      return null;
    }

    const formatted = `${result.label}: ${result.context}`;
    componentLogger.info(`${provider.name} context found`, { ticker: args.ticker, label: result.label });
    monitoring.incrementCounter(`ai.${provider.name}_context_added`, 1);
    return `--- ${provider.sectionHeader} ---\n${formatted}`;
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      componentLogger.warn(`${provider.name} search timed out`);
      monitoring.incrementCounter(`ai.${provider.name}_context_timeout`, 1);
    } else {
      componentLogger.warn(`${provider.name} search failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      monitoring.incrementCounter(`ai.${provider.name}_context_error`, 1);
    }
    // Network/abort errors are retryable — upstream may succeed on next attempt.
    // Refund the debit and increment the breaker.
    const refund = await recordRetryableFailure('why_it_matters' as EnvelopeKind, requestId);
    if (refund.refundedUsd > 0) {
      monitoring.incrementCounter(`ai.${provider.name}_refunded`, 1);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
    args.globalSignal.removeEventListener('abort', onGlobalAbort);
  }
}

// ─── Default Providers ────────────────────────────────────────────────────────

/** All built-in enrichment providers in execution order */
export const DEFAULT_PROVIDERS: EnrichmentProvider[] = [
  counterpartyProvider,
  governanceProvider,
  debtIssuanceProvider,
  earningsProvider,
  capitalReturnProvider,
];

/**
 * Convenience function: run all default enrichment providers.
 * Returns formatted context strings or empty array.
 */
export async function getEnrichmentContext(
  content: string,
  formType: string,
  companyName: string,
  ticker: string,
  options?: {
    totalTimeoutMs?: number;
    perProviderTimeoutMs?: number;
    _fetchImpl?: typeof fetch;
    cacheKey?: string;
    accessionNumber?: string;
  },
): Promise<string[]> {
  return runEnrichment(DEFAULT_PROVIDERS, content, formType, companyName, ticker, options);
}
