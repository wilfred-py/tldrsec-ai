/**
 * Summarization Types
 * 
 * Common types used across the enhanced summarization modules
 */

import { SummarizationResult as BaseSummarizationResult } from '../summarize';

/**
 * Extended SummarizationResult interface that supports both modelUsed and model properties
 * for compatibility across the codebase
 */
export interface EnhancedSummarizationResult extends BaseSummarizationResult {
  /**
   * The model used for summarization (new property name)
   */
  model?: string;
  
  /**
   * The model used for summarization (legacy property name)
   * This is required by the BaseSummarizationResult interface
   */
  modelUsed: string;
  
  /**
   * Flag indicating if the result was retrieved from cache
   */
  fromCache?: boolean;
  
  /**
   * Results from individual chunks when batch processing
   */
  chunkResults?: Array<{
    isPartial: boolean;
    parsingErrors?: string[];
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
}

/**
 * Re-export the base types for convenience
 */
export type { BaseSummarizationResult };
