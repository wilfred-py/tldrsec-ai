/**
 * Token Estimation for AI Models (OpenRouter/xAI)
 * 
 * Simple utility functions to roughly estimate token counts for AI models.
 * Updated to support xAI models through OpenRouter with cost calculations.
 * For precise token counts, you'd need to use a proper tokenizer like tiktoken,
 * but these functions provide reasonable estimates for planning purposes.
 */

/**
 * Rough estimate of tokens in a string for Claude models
 * Based on the guideline that 1 token is approximately 4 characters for English text
 * 
 * @param text The text to estimate token count for
 * @returns Estimated number of tokens
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  
  // Average token is ~4 chars of English text
  // This is an approximation - actual tokenization is more complex
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
 * 
 * @param messages Array of messages with role and content
 * @returns Estimated token count
 */
export function estimateMessagesTokenCount(messages: MessageForTokenCount[]): number {
  // Base token count for the message format
  let totalTokens = 0;
  
  // Add tokens for each message
  for (const message of messages) {
    // Add overhead for message formatting (role indicators, etc.)
    // This is an approximation based on Claude's tokenization
    totalTokens += 4; // Overhead per message
    
    // Add tokens for content
    totalTokens += estimateTokenCount(message.content);
  }
  
  return totalTokens;
}

/**
 * Calculate the approximate cost of an AI API call (OpenRouter/xAI)
 * 
 * @param inputTokens Number of input tokens
 * @param outputTokens Number of output tokens
 * @param model AI model name (defaults to xAI grok-4-fast-reasoning)
 * @returns Cost in USD
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string = process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4-fast:free'
): { inputCost: number; outputCost: number; totalCost: number } {
  // xAI price structure through OpenRouter (95% cheaper than Claude)
  const prices: Record<string, { input: number; output: number }> = {
    // xAI models (primary) - environment configured models
    'x-ai/grok-4-fast-reasoning': {
      input: 0.0000003,  // $0.30 per million tokens
      output: 0.0000005  // $0.50 per million tokens
    },
    'x-ai/grok-code-fast-1': {
      input: 0.00000015, // $0.15 per million tokens
      output: 0.00000025 // $0.25 per million tokens
    },
    // xAI models (additional)
    'x-ai/grok-4-fast:free': {
      input: 0,          // Free tier (limited usage)
      output: 0
    },
    'x-ai/grok-4': {
      input: 0.0000002,  // $0.20 per million tokens
      output: 0.0000005  // $0.50 per million tokens
    },
    'x-ai/grok-3': {
      input: 0.0000001,  // $0.10 per million tokens
      output: 0.00000025 // $0.25 per million tokens
    },
    // Legacy Claude models (deprecated but kept for backward compatibility)
    'claude-sonnet-4-20250514': {
      input: 0.000003,  // $3 per million tokens
      output: 0.000015  // $15 per million tokens
    },
    'claude-3-opus-20240229': {
      input: 0.000015,  // $15 per million tokens
      output: 0.000075  // $75 per million tokens
    },
    'claude-3-sonnet-20240229': {
      input: 0.000003,  // $3 per million tokens
      output: 0.000015  // $15 per million tokens
    },
    'claude-3-haiku-20240307': {
      input: 0.00000025, // $0.25 per million tokens
      output: 0.00000125 // $1.25 per million tokens
    }
  };
  
  // Use xAI grok-4-fast-reasoning pricing as default fallback
  const pricing = prices[model] || prices['x-ai/grok-4-fast:free'];
  
  const inputCost = inputTokens * pricing.input;
  const outputCost = outputTokens * pricing.output;
  
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost
  };
}

/**
 * Format a cost value as a readable string
 * 
 * @param cost Cost in USD
 * @returns Formatted string (e.g., "$0.0123")
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
} 