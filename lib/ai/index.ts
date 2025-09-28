/**
 * AI Module Index
 * Exports OpenRouter client and configuration
 */

export * from './openrouter-client';
export * from './config';
// Export token-counter explicitly to avoid collision
export { estimateTokenCount, calculateCost } from './token-counter';
export * from './prompts';
export * from './parsers';

// Re-export the singleton for convenience
import { openRouterClient } from './openrouter-client';
export default openRouterClient; 