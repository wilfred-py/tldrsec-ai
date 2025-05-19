/**
 * AI Module Index
 * Exports Claude client and configuration
 */

export * from './claude-client';
export * from './config';
export * from './token-counter';
export * from './prompts';

// Re-export the singleton for convenience
import { claudeClient } from './claude-client';
export default claudeClient; 