/**
 * xAI Direct Client
 *
 * Calls api.x.ai/v1/responses directly. Required for the `x_search` tool,
 * which is xAI-proprietary and not exposed via OpenRouter (verified during
 * G1 spike — see tasks/x-sentiment-spike-findings.md).
 *
 * This is a separate code path from `openrouter-client.ts`:
 * - Different endpoint, different auth header value, different cost shape
 * - Native cost reporting via `usage.cost_in_usd_ticks` (1 tick = $1e-10 USD)
 * - Streaming deferred (Phase 2 if needed)
 */

import { logger } from '../logging';
import { monitoring } from '../monitoring';

const componentLogger = logger.child('xai-direct');

const XAI_BASE_URL = 'https://api.x.ai/v1';
const XAI_RESPONSES_PATH = '/responses';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = 'grok-4.20-reasoning';

const TICK_TO_USD = 1e-10;

export type XaiTool = { type: 'x_search' } | { type: 'web_search' };

export interface XaiResponseRequest {
  model?: string;
  input: string;
  tools?: XaiTool[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface XaiUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
  numSourcesUsed: number;
  numServerSideToolsUsed: number;
  costUsd: number;
  costTicks: number;
}

export interface XaiToolCall {
  name: string;
  status: string;
  arguments: string;
}

export interface XaiResponse {
  id: string;
  model: string;
  status: string;
  text: string;
  toolCalls: XaiToolCall[];
  citationUrls: string[];
  usage: XaiUsage;
  latencyMs: number;
  raw?: unknown;
}

export class XaiDirectError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'XaiDirectError';
  }
}

function getApiKey(): string {
  const key = process.env.tldrsec_x_search || process.env.XAI_API_KEY;
  if (!key) {
    throw new XaiDirectError(
      'xAI API key missing — set tldrsec_x_search or XAI_API_KEY in environment',
      undefined,
      'no_api_key',
      false,
    );
  }
  return key;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function extractCitationUrls(parsed: any): string[] {
  const urls = new Set<string>();
  function walk(node: any): void {
    if (!node) return;
    if (typeof node === 'string') {
      const matches = node.match(/https?:\/\/[^\s"'<>)\]]+/g);
      matches?.forEach((u) => urls.add(u.replace(/[.,;:]+$/, '')));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') {
      if (typeof node.url === 'string') urls.add(node.url);
      Object.values(node).forEach(walk);
    }
  }
  walk(parsed);
  return Array.from(urls);
}

function extractMessageText(parsed: any): string {
  if (!Array.isArray(parsed?.output)) return '';
  const message = parsed.output.find((o: any) => o?.type === 'message');
  if (!message?.content) return '';
  return message.content
    .filter((c: any) => c?.type === 'output_text' && typeof c.text === 'string')
    .map((c: any) => c.text)
    .join('\n');
}

function extractToolCalls(parsed: any): XaiToolCall[] {
  if (!Array.isArray(parsed?.output)) return [];
  return parsed.output
    .filter((o: any) => o?.type === 'custom_tool_call')
    .map((o: any) => ({
      name: String(o.name ?? 'unknown'),
      status: String(o.status ?? 'unknown'),
      arguments: typeof o.arguments === 'string' ? o.arguments : JSON.stringify(o.arguments ?? {}),
    }));
}

function extractUsage(parsed: any): XaiUsage {
  const u = parsed?.usage ?? {};
  const inputTokens = Number(u.input_tokens ?? 0);
  const outputTokens = Number(u.output_tokens ?? 0);
  const reasoningTokens = Number(u.output_tokens_details?.reasoning_tokens ?? 0);
  const cachedTokens = Number(u.input_tokens_details?.cached_tokens ?? 0);
  const totalTokens = Number(u.total_tokens ?? inputTokens + outputTokens);
  const costTicks = Number(u.cost_in_usd_ticks ?? 0);
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cachedTokens,
    totalTokens,
    numSourcesUsed: Number(u.num_sources_used ?? 0),
    numServerSideToolsUsed: Number(u.num_server_side_tools_used ?? 0),
    costTicks,
    costUsd: costTicks * TICK_TO_USD,
  };
}

/**
 * Single-shot call to xAI Responses API. No retry — caller decides retry policy
 * based on `error.retryable` so per-feature backoff can differ.
 */
export async function callXaiResponses(req: XaiResponseRequest): Promise<XaiResponse> {
  const apiKey = getApiKey();
  const model = req.model ?? DEFAULT_MODEL;
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body: Record<string, unknown> = {
    model,
    input: req.input,
  };
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  if (req.signal) {
    // If the upstream signal is already aborted, propagate immediately —
    // addEventListener won't fire for an event that already happened, so a
    // pre-aborted signal would otherwise let the fetch run to completion.
    if (req.signal.aborted) {
      controller.abort();
    } else {
      req.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`${XAI_BASE_URL}${XAI_RESPONSES_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    const aborted = err instanceof Error && err.name === 'AbortError';
    monitoring.incrementCounter('ai.xai_direct.network_error', 1);
    throw new XaiDirectError(
      aborted ? `xAI request aborted after ${timeoutMs}ms` : `xAI fetch failed: ${(err as Error).message}`,
      undefined,
      aborted ? 'timeout' : 'network',
      true,
    );
  }
  clearTimeout(timeoutHandle);

  const latencyMs = Date.now() - startedAt;
  const text = await res.text();

  if (!res.ok) {
    const retryable = isRetryableStatus(res.status);
    monitoring.incrementCounter(`ai.xai_direct.http_${res.status}`, 1);
    componentLogger.warn('xAI request failed', { status: res.status, body: text.slice(0, 500) });
    let code = 'http_error';
    try {
      const parsed = JSON.parse(text);
      code = String(parsed?.error?.code ?? code);
    } catch {
      /* keep default */
    }
    throw new XaiDirectError(`xAI HTTP ${res.status}: ${text.slice(0, 200)}`, res.status, code, retryable);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new XaiDirectError(`xAI returned non-JSON body: ${text.slice(0, 200)}`, res.status, 'invalid_json', false);
  }

  if (parsed?.error) {
    throw new XaiDirectError(
      `xAI returned error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`,
      res.status,
      String(parsed.error.code ?? 'api_error'),
      false,
    );
  }

  const usage = extractUsage(parsed);
  const messageText = extractMessageText(parsed);
  const toolCalls = extractToolCalls(parsed);
  const citationUrls = extractCitationUrls(parsed);

  monitoring.incrementCounter('ai.xai_direct.success', 1);
  monitoring.recordValue('ai.xai_direct.cost_usd', usage.costUsd);
  monitoring.recordValue('ai.xai_direct.latency_ms', latencyMs);

  return {
    id: String(parsed.id ?? ''),
    model: String(parsed.model ?? model),
    status: String(parsed.status ?? 'unknown'),
    text: messageText,
    toolCalls,
    citationUrls,
    usage,
    latencyMs,
  };
}

export const _internal = {
  TICK_TO_USD,
  DEFAULT_MODEL,
  extractCitationUrls,
  extractMessageText,
  extractToolCalls,
  extractUsage,
  isRetryableStatus,
};
