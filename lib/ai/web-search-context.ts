/**
 * Shared Web Search Enrichment Module
 *
 * Generic interface for enriching SEC filing summaries with web-sourced context.
 * Each provider detects whether it applies, builds a search prompt, and parses
 * the response. The orchestrator runs applicable providers sequentially under
 * a shared timeout budget.
 *
 * Providers:
 * - counterparty: M&A counterparty identification (Item 1.01/2.01)
 * - governance: Director/officer context (Item 5.02/5.07)
 */

import { logger } from '../logging';
import { monitoring } from '../monitoring';

const componentLogger = logger.child('web-search-context');

/** Total timeout budget for all enrichment providers combined */
const DEFAULT_TOTAL_TIMEOUT_MS = 45_000;

/** Max tokens for each search response */
const SEARCH_MAX_TOKENS = 500;

/** Max chars for label and context fields */
const MAX_LABEL_LENGTH = 200;
const MAX_CONTEXT_LENGTH = 500;

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

// ─── Counterparty Provider (M&A) ─────────────────────────────────────────────

const MA_ITEM_PATTERN = /Item\s+[12]\.01/i;
const MA_KEYWORDS = ['acqui', 'merger', 'business combination', 'merge ', 'purchase agreement'];

export function isMAFiling(content: string, formType: string): boolean {
  if (!formType) return false;
  const normalizedType = formType.toUpperCase();
  if (normalizedType !== '8-K' && normalizedType !== '8-K/A') return false;
  if (!MA_ITEM_PATTERN.test(content)) return false;
  const lowerContent = content.toLowerCase();
  return MA_KEYWORDS.some(keyword => lowerContent.includes(keyword));
}

export const counterpartyProvider: EnrichmentProvider = {
  name: 'counterparty',
  sectionHeader: 'COUNTERPARTY CONTEXT (from web search)',
  maxExcerptLength: 2000,

  detect: isMAFiling,

  buildPrompt(excerpt: string, companyName: string, ticker: string) {
    return {
      system: 'You are a financial research assistant. Extract counterparty information from SEC filings and provide investor-relevant context. Respond with valid JSON only.',
      user: `This 8-K filing excerpt describes an acquisition or merger by ${companyName} (${ticker}).

1) Extract the exact legal name of the company being acquired or merged with.
2) Search the web for that company.
3) In 2-3 sentences, describe who they are, what they do, their approximate size or market position, and why this deal matters to ${ticker} investors.

Respond with ONLY valid JSON in this exact format:
{"counterpartyName": "Exact Company Name LLC", "context": "2-3 sentence description"}

<filing_excerpt>
${excerpt}
</filing_excerpt>`,
    };
  },

  parseResponse(raw: string): EnrichmentResult | null {
    const parsed = JSON.parse(raw);
    if (!parsed.counterpartyName || !parsed.context) return null;
    return {
      label: String(parsed.counterpartyName).slice(0, MAX_LABEL_LENGTH),
      context: String(parsed.context).slice(0, MAX_CONTEXT_LENGTH),
    };
  },
};

// ─── Governance Provider (Director/Officer) ──────────────────────────────────

const GOVERNANCE_ITEM_PATTERN = /Item\s+5\.0[27]/i;
const GOVERNANCE_KEYWORDS = [
  'director', 'board', 'resign', 'appoint', 're-election',
  'non-reelection', 'depart', 'officer', 'principal officer',
  'not stand for', 'will not stand',
];

export function isGovernanceFiling(content: string, formType: string): boolean {
  if (!formType) return false;
  const normalizedType = formType.toUpperCase();
  if (normalizedType !== '8-K' && normalizedType !== '8-K/A') return false;
  if (!GOVERNANCE_ITEM_PATTERN.test(content)) return false;
  const lowerContent = content.toLowerCase();
  return GOVERNANCE_KEYWORDS.some(keyword => lowerContent.includes(keyword));
}

export const governanceProvider: EnrichmentProvider = {
  name: 'governance',
  sectionHeader: 'GOVERNANCE CONTEXT (from web search)',
  maxExcerptLength: 2000,

  detect: isGovernanceFiling,

  buildPrompt(excerpt: string, companyName: string, ticker: string) {
    return {
      system: 'You are a corporate governance research assistant. Extract director and officer information from SEC filings and provide investor-relevant context about the people involved and why the governance change matters. Respond with valid JSON only.',
      user: `This 8-K filing excerpt describes a director or officer change at ${companyName} (${ticker}).

1) Extract the names of the directors or officers mentioned (departing, appointed, or standing for re-election).
2) Search the web for the most prominent person named.
3) In 2-3 sentences, describe their background, current roles, and why this governance change matters to ${ticker} shareholders.

Respond with ONLY valid JSON in this exact format:
{"directorName": "Full Name", "context": "2-3 sentence description of who they are and why this matters"}

<filing_excerpt>
${excerpt}
</filing_excerpt>`,
    };
  },

  parseResponse(raw: string): EnrichmentResult | null {
    const parsed = JSON.parse(raw);
    if (!parsed.directorName || !parsed.context) return null;
    return {
      label: String(parsed.directorName).slice(0, MAX_LABEL_LENGTH),
      context: String(parsed.context).slice(0, MAX_CONTEXT_LENGTH),
    };
  },
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run all applicable enrichment providers sequentially under a shared timeout budget.
 * Returns formatted context strings ready to inject into the summarization prompt.
 */
export async function runEnrichment(
  providers: EnrichmentProvider[],
  content: string,
  formType: string,
  companyName: string,
  ticker: string,
  options: { totalTimeoutMs?: number; _fetchImpl?: typeof fetch } = {},
): Promise<string[]> {
  const totalTimeout = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const fetchImpl = options._fetchImpl ?? fetch;
  const startTime = Date.now();
  const results: string[] = [];

  const apiKey = process.env.TLDRSEC_AI_SUMMARIZER || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    componentLogger.warn('No OpenRouter API key available for enrichment');
    return results;
  }

  const model = process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4.1-fast';

  for (const provider of providers) {
    // Check remaining time budget
    const elapsed = Date.now() - startTime;
    const remaining = totalTimeout - elapsed;
    if (remaining <= 2000) {
      componentLogger.info(`Enrichment timeout budget exhausted, skipping ${provider.name}`, {
        elapsed,
        totalTimeout,
      });
      break;
    }

    if (!provider.detect(content, formType)) {
      continue;
    }

    componentLogger.info(`${provider.name} filing detected, searching for context`, { ticker, formType });
    monitoring.incrementCounter(`ai.${provider.name}_context_attempted`, 1);

    try {
      const excerpt = content.slice(0, provider.maxExcerptLength);
      const prompts = provider.buildPrompt(excerpt, companyName, ticker);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), remaining);

      let response: Response;
      try {
        response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://tldrsec.app',
            'X-Title': 'TLDRSEC.AI',
          },
          body: JSON.stringify({
            model,
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
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        componentLogger.warn(`${provider.name} search API error`, {
          status: response.status,
          statusText: response.statusText,
        });
        continue;
      }

      const data = await response.json();
      const responseContent = data?.choices?.[0]?.message?.content;

      if (!responseContent || typeof responseContent !== 'string') {
        componentLogger.warn(`${provider.name} search returned empty content`);
        continue;
      }

      // Extract JSON from response (may have markdown code fences)
      const fenceMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = (fenceMatch ? fenceMatch[1] : responseContent).trim();

      const result = provider.parseResponse(jsonStr);
      if (result) {
        const formatted = `${result.label}: ${result.context}`;
        results.push(`--- ${provider.sectionHeader} ---\n${formatted}`);
        componentLogger.info(`${provider.name} context found`, { ticker, label: result.label });
        monitoring.incrementCounter(`ai.${provider.name}_context_added`, 1);
      } else {
        componentLogger.info(`No ${provider.name} context available`, { ticker });
      }
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        componentLogger.warn(`${provider.name} search timed out`);
        monitoring.incrementCounter(`ai.${provider.name}_context_timeout`, 1);
      } else if (error instanceof SyntaxError) {
        componentLogger.warn(`${provider.name} search returned malformed JSON`, {
          error: error.message,
        });
      } else {
        componentLogger.warn(`${provider.name} search failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      monitoring.incrementCounter(`ai.${provider.name}_context_error`, 1);
    }
  }

  return results;
}

// ─── Default Providers ────────────────────────────────────────────────────────

/** All built-in enrichment providers in execution order */
export const DEFAULT_PROVIDERS: EnrichmentProvider[] = [
  counterpartyProvider,
  governanceProvider,
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
  options?: { totalTimeoutMs?: number; _fetchImpl?: typeof fetch },
): Promise<string[]> {
  return runEnrichment(DEFAULT_PROVIDERS, content, formType, companyName, ticker, options);
}
