/**
 * Enhanced Filing Services
 * 
 * This module provides enhanced SEC filing processing capabilities including:
 * - Intelligent document discovery and prioritization
 * - Smart content chunking for large documents
 * - Structured AI summarization with fallback handling
 * - Advanced caching with performance tracking
 */

// Main service
export { 
  getEnhancedFilingSummary,
  type EnhancedFilingSummaryOptions,
  type EnhancedFilingSummaryResult
} from './enhancedFilingSummaryService';

// Document processing
export {
  processFilingDocument,
  isDirectoryListing,
  prioritizeDocuments,
  extractDocumentLinksFromDirectoryListing,
  type DocumentProcessingOptions,
  type DocumentProcessingResult,
  type DocumentPriority
} from './documentProcessor';

// Content chunking
export {
  chunkContent,
  estimateProcessingCost,
  calculateTokenCost,
  validateChunks,
  getChunkingStats,
  type ChunkingOptions,
  type ChunkingResult,
  type ContentChunk,
  type TokenCostEstimate
} from './contentChunker';

// AI summarization
export {
  summarizeWithChunking,
  summarizeSingle,
  generateStructuredPrompt,
  generateChunkPrompt,
  type SummarizationOptions,
  type SummarizationResult,
  type StructuredSummary
} from './aiSummarizer';

// Enhanced caching
export {
  checkEnhancedCache,
  saveToEnhancedCache,
  getEnhancedCacheStats,
  cleanupEnhancedCache,
  invalidateEnhancedCache,
  type CacheEntry,
  type CacheStats
} from './enhancedCache';

// Version info
export const ENHANCED_SERVICES_VERSION = '1.0.0';

/**
 * Feature flags for enhanced services
 */
export const ENHANCED_FEATURES = {
  INTELLIGENT_CHUNKING: process.env.ENABLE_INTELLIGENT_CHUNKING !== 'false',
  DOCUMENT_PRIORITIZATION: process.env.ENABLE_DOCUMENT_PRIORITIZATION !== 'false',
  STRUCTURED_SUMMARIES: process.env.ENABLE_STRUCTURED_SUMMARIES !== 'false',
  ENHANCED_CACHING: process.env.ENABLE_ENHANCED_CACHING !== 'false',
  FALLBACK_PROCESSING: process.env.ENABLE_FALLBACK_PROCESSING !== 'false'
} as const;

/**
 * Default configuration for enhanced services
 */
export const ENHANCED_DEFAULTS = {
  MAX_TOKENS_PER_CHUNK: parseInt(process.env.ENHANCED_CHUNK_SIZE || '50000'),
  MAX_CHUNKS: parseInt(process.env.ENHANCED_MAX_CHUNKS || '10'),
  SINGLE_PROCESSING_LIMIT: parseInt(process.env.ENHANCED_SINGLE_LIMIT || '100000'),
  CACHE_TTL_DAYS: parseInt(process.env.ENHANCED_CACHE_TTL || '30'),
  MAX_RETRIES: parseInt(process.env.ENHANCED_MAX_RETRIES || '3')
} as const;