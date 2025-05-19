/**
 * Token Estimation for Claude API
 * 
 * Simple utility functions to roughly estimate token counts for Claude messages.
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
 * Calculate the approximate cost of a Claude API call
 * 
 * @param inputTokens Number of input tokens
 * @param outputTokens Number of output tokens
 * @param model Claude model name (defaults to sonnet)
 * @returns Cost in USD
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string = 'claude-3-sonnet-20240229'
): { inputCost: number; outputCost: number; totalCost: number } {
  // Claude price structure (as of May 2024)
  const prices: Record<string, { input: number; output: number }> = {
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
    },
    // Add fallback for older models
    'claude-2.1': {
      input: 0.000008,  // $8 per million tokens
      output: 0.000024  // $24 per million tokens
    }
  };
  
  // Use sonnet pricing as default fallback
  const pricing = prices[model] || prices['claude-3-sonnet-20240229'];
  
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