/**
 * Filing analyzer service that handles Claude AI analysis of SEC filings
 * with optimized prompting, caching, and error handling
 */

import { openRouterClient } from './openrouter-client';
import { generateFilingPrompt } from './prompts/unified-prompts';
import { parseJSONResponse } from './parsers/simple-parser';
import { FilingType } from '../sec-edgar/types';

// Simple in-memory cache for filing analyses
type CacheEntry = {
  analysis: unknown;
  timestamp: number;
  documentHash: string;
};

class FilingAnalyzerService {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTimeoutMs: number = 24 * 60 * 60 * 1000; // 24 hours
  private cacheMaxSize: number = 100; // Maximum cache size
  
  /**
   * Analyze a filing with Claude AI
   * 
   * @param filingType The SEC filing type (e.g., '10-K', '10-Q')
   * @param ticker The stock ticker symbol
   * @param companyName The company name
   * @param documentContent The filing content to analyze
   * @param options Additional options for analysis
   * @returns The analysis result
   */
  async analyzeFilingWithClaude(
    filingType: FilingType | string,
    ticker: string,
    companyName: string,
    documentContent: string,
    options: {
      maxContentLength?: number;
      useCaching?: boolean;
      documentHash?: string;
      temperature?: number;
      timeout?: number;
      maxTokens?: number;
      model?: string;
    } = {}
  ): Promise<unknown> {
    const {
      maxContentLength = 15000,
      useCaching = true,
      documentHash,
      temperature = 0.2,
      timeout = 30000,
      maxTokens = 2000,
      model = 'claude-sonnet-4-20250514'
    } = options;
    
    // Generate a cache key if caching is enabled
    const cacheKey = useCaching && documentHash ? 
      `${ticker}-${filingType}-${documentHash}` : null;
    
    // Check cache first if enabled and we have a document hash
    if (cacheKey && this.cache.has(cacheKey)) {
      const cacheEntry = this.cache.get(cacheKey)!;
      
      // Check if cache entry is still valid
      if (Date.now() - cacheEntry.timestamp < this.cacheTimeoutMs) {
        console.log(`Using cached analysis for ${ticker} ${filingType}`);
        return cacheEntry.analysis;
      }
      
      // Remove expired cache entry
      this.cache.delete(cacheKey);
    }
    
    try {
      // Truncate content to avoid token limits
      const truncatedContent = documentContent.substring(0, maxContentLength);

      // Generate prompt using the unified prompt system
      const { systemPrompt, userPrompt } = generateFilingPrompt({
        formType: filingType as string,
        company: companyName,
        ticker,
        filingContent: truncatedContent
      });

      // Call OpenRouter API
      console.log(`Calling OpenRouter API for ${ticker} ${filingType} analysis...`);
      const response = await openRouterClient.sendMessage([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        model,
        temperature,
        maxTokens,
        timeout,
        requestType: 'premium' // Use premium request type for higher priority
      });

      // Parse the response using the simple parser
      const responseText = response.content;
      const parseResult = parseJSONResponse(responseText, filingType as string);

      let analysis;
      if (parseResult.success && parseResult.data) {
        analysis = parseResult.data;
        console.log('Successfully parsed Claude response as JSON');
      } else {
        console.warn('Failed to parse Claude response as JSON:', parseResult.error || parseResult.validationErrors);
        // Return error info for debugging
        analysis = {
          parseError: true,
          rawAnalysis: responseText.substring(0, 500),
          fullTextLength: responseText.length,
          parserError: parseResult.error,
          validationErrors: parseResult.validationErrors
        };
      }

      // Cache the result if caching is enabled and we have a document hash
      if (cacheKey && analysis) {
        this.addToCache(cacheKey, analysis, documentHash || '');
      }

      return analysis;
    } catch (error) {
      console.error(`Error analyzing ${ticker} ${filingType} with Claude:`, error);
      throw new Error(`AI analysis failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Add an analysis to the cache
   * 
   * @param key The cache key
   * @param analysis The analysis result
   * @param documentHash The document hash
   */
  private addToCache(key: string, analysis: unknown, documentHash: string): void {
    // Evict old entries if cache is too large
    if (this.cache.size >= this.cacheMaxSize) {
      // Remove oldest entries (first 10% of cache)
      const keysToRemove = Array.from(this.cache.keys())
        .slice(0, Math.floor(this.cacheMaxSize * 0.1));
      
      keysToRemove.forEach(key => this.cache.delete(key));
    }
    
    this.cache.set(key, {
      analysis,
      timestamp: Date.now(),
      documentHash
    });
  }
  
  /**
   * Get API usage statistics
   *
   * @returns The usage statistics (placeholder - OpenRouter doesn't expose usage directly)
   */
  getUsageStats(): unknown {
    return { message: 'Usage statistics available via OpenRouter dashboard' };
  }
  
  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Get cache statistics
   * 
   * @returns Cache statistics
   */
  getCacheStats(): unknown {
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      timeoutMs: this.cacheTimeoutMs,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        documentHash: entry.documentHash
      }))
    };
  }
}

// Export a singleton instance
export const filingAnalyzer = new FilingAnalyzerService();
