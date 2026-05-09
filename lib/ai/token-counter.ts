/**
 * Token Estimation for AI Models (OpenRouter/xAI)
 *
 * Simple utility functions to estimate token counts and call costs for AI models.
 * Single-target model: x-ai/grok-4.3 (1M context, tiered pricing at 200K boundary).
 * For precise token counts a real tokenizer is needed; these heuristics are
 * "close enough" for cost reporting and budget planning.
 */

import { TIERED_PRICING_THRESHOLD, getDefaultModel, getFallbackModel } from './config';

/**
 * Rough estimate of tokens in a string.
 * 1 token ≈ 4 characters of English text (heuristic, not exact).
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Message structure for token counting
 */
interface MessageForTokenCount {
  role: string;
  content: string;
}

/**
 * Estimate the total tokens in an array of messages
 */
export function estimateMessagesTokenCount(messages: MessageForTokenCount[]): number {
  let totalTokens = 0;
  for (const message of messages) {
    totalTokens += 4; // overhead per message (role indicators)
    totalTokens += estimateTokenCount(message.content);
  }
  return totalTokens;
}

/**
 * Resolve grok-4.3 per-token pricing for a given input-token volume.
 *
 * xAI bills calls in flat tiers (not marginal per-token):
 *   ≤200K input tokens: $1.25/M input, $2.50/M output
 *   >200K input tokens: $2.50/M input, $5.00/M output
 *
 * Boundary: an exactly-200K call stays in the cheap tier (xAI says "exceeding").
 */
function getGrok43Pricing(inputTokens: number): { input: number; output: number } {
  if (inputTokens > TIERED_PRICING_THRESHOLD) {
    return {
      input: parseFloat(process.env.XAI_GROK_INPUT_COST_HIGH || '2.50') / 1_000_000,
      output: parseFloat(process.env.XAI_GROK_OUTPUT_COST_HIGH || '5.00') / 1_000_000,
    };
  }
  return {
    input: parseFloat(process.env.XAI_GROK_INPUT_COST || '1.25') / 1_000_000,
    output: parseFloat(process.env.XAI_GROK_OUTPUT_COST || '2.50') / 1_000_000,
  };
}

/**
 * Calculate the approximate cost of an AI API call.
 *
 * For x-ai/grok-4.3 (the only configured production model), pricing is tiered
 * based on `inputTokens` (see getGrok43Pricing). For unknown / legacy models
 * we still return zero rather than throw, matching prior fallback behavior.
 *
 * @param inputTokens Number of input tokens
 * @param outputTokens Number of output tokens
 * @param model Model slug (defaults to configured default model)
 * @returns Cost breakdown in USD
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string = getDefaultModel()
): { inputCost: number; outputCost: number; totalCost: number } {
  const grok43Pricing = getGrok43Pricing(inputTokens);

  // Static price map for non-grok-4.3 entries (legacy Claude rows kept for
  // backward compatibility with stored cost-tracking rows; see plan §3 D4).
  const staticPrices: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-20250514': {
      input: 0.000003,
      output: 0.000015,
    },
    'claude-3-opus-20240229': {
      input: 0.000015,
      output: 0.000075,
    },
    'claude-3-sonnet-20240229': {
      input: 0.000003,
      output: 0.000015,
    },
    'claude-3-haiku-20240307': {
      input: 0.00000025,
      output: 0.00000125,
    },
  };

  let pricing: { input: number; output: number };
  if (model === 'x-ai/grok-4.3' || model === getDefaultModel() || model === getFallbackModel()) {
    pricing = grok43Pricing;
  } else if (staticPrices[model]) {
    pricing = staticPrices[model];
  } else {
    // Unknown model — fall back to grok-4.3 cheap tier so cost reporting never
    // crashes and never silently zeroes (the previous code's terminal fallback
    // pointed at a key that didn't exist in the dict, returning undefined).
    pricing = getGrok43Pricing(0);
  }

  const inputCost = inputTokens * pricing.input;
  const outputCost = outputTokens * pricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Format a cost value as a readable string (e.g. "$0.0123")
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}
