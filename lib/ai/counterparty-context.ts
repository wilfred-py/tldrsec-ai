/**
 * Counterparty Context Service
 *
 * When an 8-K filing involves an acquisition or merger, this module:
 * 1. Detects M&A signals (Item 1.01/2.01 + keywords)
 * 2. Uses an LLM with web search to identify the counterparty and provide context
 * 3. Returns context that gets injected into the main summarization prompt
 *
 * Uses a direct fetch to OpenRouter (not the shared client) to avoid
 * modifying the core summarization pipeline.
 */

import { logger } from '../logging';
import { monitoring } from '../monitoring';

const componentLogger = logger.child('counterparty-context');


/** Timeout for the counterparty web search call */
const SEARCH_TIMEOUT_MS = 30_000;

/** Max tokens for the search response */
const SEARCH_MAX_TOKENS = 500;

/** Max chars of filing content to send as excerpt */
const FILING_EXCERPT_LENGTH = 2000;

/** Max chars for counterparty name */
const MAX_COUNTERPARTY_NAME_LENGTH = 200;

/** Max chars for counterparty context */
const MAX_CONTEXT_LENGTH = 500;

/** M&A-related SEC item numbers */
const MA_ITEM_PATTERN = /Item\s+[12]\.01/i;

/** M&A keywords that must appear alongside item numbers */
const MA_KEYWORDS = [
  'acqui', // acquisition, acquire, acquired, acquiring
  'merger',
  'business combination',
  'merge ',
  'purchase agreement',
];

/**
 * Detects if an 8-K filing involves an acquisition or merger.
 * Requires BOTH an M&A item number (1.01 or 2.01) AND M&A keywords
 * to reduce false positives (Item 1.01 covers all material contracts).
 */
export function isMAFiling(content: string, formType: string): boolean {
  if (!formType) return false;
  const normalizedType = formType.toUpperCase();
  if (normalizedType !== '8-K' && normalizedType !== '8-K/A') {
    return false;
  }

  // Check for M&A item numbers
  if (!MA_ITEM_PATTERN.test(content)) {
    return false;
  }

  // Check for M&A keywords (case-insensitive)
  const lowerContent = content.toLowerCase();
  return MA_KEYWORDS.some(keyword => lowerContent.includes(keyword));
}

/**
 * Result from the counterparty search
 */
interface CounterpartySearchResult {
  counterpartyName: string;
  context: string;
}

/**
 * Searches for counterparty context using OpenRouter with web search.
 * Makes a direct fetch to avoid modifying the shared OpenRouter client.
 *
 * The LLM extracts the counterparty name from the filing excerpt AND
 * searches the web for context about them. More reliable than regex
 * for legal document language.
 */
export async function searchCounterpartyContext(
  filingExcerpt: string,
  acquirerName: string,
  ticker: string,
  _fetchImpl: typeof fetch = fetch
): Promise<CounterpartySearchResult | null> {
  const apiKey = process.env.TLDRSEC_AI_SUMMARIZER || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    componentLogger.warn('No OpenRouter API key available for counterparty search');
    return null;
  }

  const model = process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4.1-fast';

  const prompt = `This 8-K filing excerpt describes an acquisition or merger by ${acquirerName} (${ticker}).

1) Extract the exact legal name of the company being acquired or merged with.
2) Search the web for that company.
3) In 2-3 sentences, describe who they are, what they do, their approximate size or market position, and why this deal matters to ${ticker} investors.

Respond with ONLY valid JSON in this exact format:
{"counterpartyName": "Exact Company Name LLC", "context": "2-3 sentence description"}

<filing_excerpt>
${filingExcerpt.slice(0, FILING_EXCERPT_LENGTH)}
</filing_excerpt>`;

  try {
    const body = JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a financial research assistant. Extract counterparty information from SEC filings and provide investor-relevant context. Respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      tools: [{ type: 'openrouter:web_search' }],
      max_tokens: SEARCH_MAX_TOKENS,
      temperature: 0.2,
      stream: false,
    });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://tldrsec.app',
      'X-Title': 'TLDRSEC.AI',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await _fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      componentLogger.warn('Counterparty search API error', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      componentLogger.warn('Counterparty search returned empty content');
      return null;
    }

    // Extract JSON from the response (may have markdown code fences or surrounding text)
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = (fenceMatch ? fenceMatch[1] : content).trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.counterpartyName || !parsed.context) {
      componentLogger.warn('Counterparty search returned incomplete JSON', {
        hasName: !!parsed.counterpartyName,
        hasContext: !!parsed.context,
      });
      return null;
    }

    return {
      counterpartyName: String(parsed.counterpartyName).slice(0, MAX_COUNTERPARTY_NAME_LENGTH),
      context: String(parsed.context).slice(0, MAX_CONTEXT_LENGTH),
    };
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      componentLogger.warn('Counterparty search timed out');
      monitoring.incrementCounter('ai.counterparty_context_timeout', 1);
    } else if (error instanceof SyntaxError) {
      componentLogger.warn('Counterparty search returned malformed JSON', {
        error: error.message,
      });
    } else {
      componentLogger.warn('Counterparty search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

/**
 * Orchestrates M&A detection and counterparty context enrichment.
 * Returns a formatted context string or null if not applicable.
 */
export async function getCounterpartyContext(
  content: string,
  formType: string,
  companyName: string,
  ticker: string,
  _fetchImpl?: typeof fetch
): Promise<string | null> {
  if (!isMAFiling(content, formType)) {
    return null;
  }

  componentLogger.info('M&A filing detected, searching for counterparty context', {
    ticker,
    formType,
  });
  monitoring.incrementCounter('ai.counterparty_context_attempted', 1);

  const result = await searchCounterpartyContext(content, companyName, ticker, _fetchImpl);

  if (!result) {
    componentLogger.info('No counterparty context available', { ticker });
    return null;
  }

  componentLogger.info('Counterparty context found', {
    ticker,
    counterparty: result.counterpartyName,
  });

  return `${result.counterpartyName}: ${result.context}`;
}
