/**
 * SEC Filing Parsers
 * 
 * This module exports all the parsers and utilities needed to parse SEC filings.
 * It initializes the filing type registry and makes the parsers available.
 */

// Initialize the filing type registry
import './filing-types';

// Re-export parsers and utilities
export * from './html-parser';
export * from './sec-filing-parser';
export * from './filing-parser-factory';
export * from './filing-type-registry';
export * from './chunk-manager';

// Export the individual filing types (for direct imports if needed)
export * as filingTypes from './filing-types';

// Initialize logging
import { Logger } from '@/lib/logging';
const logger = new Logger({}, 'parsers');

// Log successful initialization
logger.debug('SEC filing parsers initialized');

/**
 * Initialize parsers with any additional configuration
 * This is exposed for cases where explicit initialization is needed
 */
export function initializeParsers(): void {
  // Import the filing type definitions (which registers them)
  // This is already done via the import above, but we're making it explicit here
  // for cases where programmatic initialization is needed
  require('./filing-types');
  
  logger.info('SEC filing parsers successfully initialized');
} 