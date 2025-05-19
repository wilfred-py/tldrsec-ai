/**
 * AI Module Index
 * Exports Claude client and configuration
 */

export * from './claude-client';
export * from './config';
// Export token-counter explicitly to avoid collision
export { estimateTokenCount, calculateCost } from './token-counter';
export * from './prompts';
export * from './parsers';

// Re-export the singleton for convenience
import { claudeClient } from './claude-client';
export default claudeClient; 