/**
 * Enhanced Claude AI Summarization Service
 * 
 * This file re-exports the modular components from the summarization directory.
 * The implementation has been refactored into smaller, more manageable modules:
 * 
 * - enhanced-summarization-service.ts: Main service class
 * - chunk-processor.ts: Processing individual document chunks
 * - batch-processor.ts: Batch processing multiple chunks
 * - db-utils.ts: Database operations for summaries
 * 
 * This modular approach improves:
 * - Code organization and maintainability
 * - Testing capabilities
 * - Type safety and error handling
 */

// Import from our new modules
import {
  EnhancedSummarizationService,
  SummarizationEvent,
  EnhancedSummarizationOptions
} from './summarization/enhanced-summarization-service';

import {
  processSingleChunk,
  identifyMissingFields
} from './summarization/chunk-processor';

import {
  processAllChunks
} from './summarization/batch-processor';

import {
  updateSummaryWithPartialResult,
  updateSummaryWithResult
} from './summarization/db-utils';

// Import original dependencies to re-export
import { SummarizationOptions, SummarizationResult, SummarizationError } from './summarize';
import { SECFilingType } from './prompts/prompt-types';
import { createStreamHandler, StreamEvent } from './streaming/stream-handler';
import { summaryCache, SummaryCacheKey } from './cache/summary-cache';
import { processDocumentContent } from './chunking/enhanced-chunker';
import { extractFilingContent } from '../parsers/filing-extractor';

/**
 * Re-export all components
 */
// Re-export types with proper 'export type' syntax for TypeScript isolatedModules
export { EnhancedSummarizationService, SummarizationEvent };
export type { EnhancedSummarizationOptions };

// Processing functions
export { processSingleChunk, processAllChunks, identifyMissingFields };

// Database utilities
export { updateSummaryWithPartialResult, updateSummaryWithResult };

// Original types and utilities
export { SummarizationError };
export type { SummarizationOptions, SummarizationResult };
export type { SECFilingType };
export type { StreamEvent, SummaryCacheKey };

// Utility functions
export { createStreamHandler, extractFilingContent, processDocumentContent, summaryCache };

// Export singleton instance of the service
export const enhancedSummarizer = new EnhancedSummarizationService();
