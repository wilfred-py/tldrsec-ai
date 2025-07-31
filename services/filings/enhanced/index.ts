/**
 * Enhanced Filing Services
 * 
 * This module provides enhanced SEC filing processing capabilities including:
 * - Intelligent document discovery and prioritization
 * - Smart content chunking for large documents
 * - Structured AI summarization with fallback handling
 * - Advanced caching with performance tracking
 * - Token optimization based on subscription tiers
 * - Subscription-aware processing limits
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

// Token optimization
export {
  optimizeTokens,
  getOptimizationLevelForTier,
  validateOptimization,
  type OptimizationLevel,
  type SubscriptionTier,
  type TokenOptimizationOptions,
  type TokenOptimizationResult
} from './tokenOptimizer';

// Subscription management
export {
  getUserSubscription,
  canProcessFiling,
  getOptimizationLevelForUser,
  recordFilingUsage,
  getSubscriptionTierInfo,
  hasFeatureAccess,
  formatSubscriptionInfo,
  getSubscriptionAnalytics,
  updateUserSubscription,
  type UserSubscription,
  SUBSCRIPTION_FEATURES
} from './subscriptionService';

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
  MAX_RETRIES: parseInt(process.env.ENHANCED_MAX_RETRIES || '3'),
  ENABLE_TOKEN_OPTIMIZATION: process.env.ENABLE_TOKEN_OPTIMIZATION !== 'false'
} as const;

/**
 * Convenience function that integrates subscription-aware filing processing
 */
export async function processFilingWithSubscription(
  ticker: string,
  formType: string,
  userId: string,
  options: Partial<EnhancedFilingSummaryOptions> = {}
): Promise<EnhancedFilingSummaryResult> {
  const { 
    canProcessFiling: canProcess, 
    getOptimizationLevelForUser,
    recordFilingUsage 
  } = await import('./subscriptionService');
  
  const { getEnhancedFilingSummary } = await import('./enhancedFilingSummaryService');
  
  // Check if user can process this filing
  const eligibility = await canProcess(userId);
  if (!eligibility.canProcess) {
    return {
      data: null,
      error: eligibility.reason || 'Cannot process filing due to subscription limits'
    };
  }
  
  // Get user's optimization level based on subscription tier
  const optimizationLevel = await getOptimizationLevelForUser(userId);
  
  // Process the filing with subscription-appropriate optimization
  const result = await getEnhancedFilingSummary(ticker, formType as any, {
    ...options,
    optimizationLevel,
    enableTokenOptimization: ENHANCED_DEFAULTS.ENABLE_TOKEN_OPTIMIZATION,
    subscriptionTier: undefined // Will be determined by optimizationLevel
  });
  
  // Record usage if processing was successful
  if (result.data && result.metadata?.tokenOptimizationResult) {
    await recordFilingUsage(
      userId, 
      formType, 
      ticker,
      result.data.accessionNumber,
      {
        level: result.metadata.tokenOptimizationResult.optimizationLevel,
        originalTokens: result.metadata.tokenOptimizationResult.originalTokens,
        optimizedTokens: result.metadata.tokenOptimizationResult.optimizedTokens,
        reductionPercentage: result.metadata.tokenOptimizationResult.reductionPercentage,
        cost: result.data.cost,
        processingTimeMs: result.metadata.totalProcessingTimeMs
      }
    );
  } else if (result.data) {
    // Record basic usage without optimization data
    await recordFilingUsage(userId, formType, ticker);
  }
  
  return result;
}