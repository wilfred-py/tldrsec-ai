/**
 * Filing analyzer service that handles Claude AI analysis of SEC filings
 * with optimized prompting, caching, and error handling
 */

import { claudeClient } from './claude-client';
import { getPromptForFilingType } from './sec-prompts';
import { FilingType } from '../sec-edgar/types';

// Simple in-memory cache for filing analyses
type CacheEntry = {
  analysis: any;
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
  ): Promise<any> {
    const {
      maxContentLength = 15000,
      useCaching = true,
      documentHash,
      temperature = 0.2,
      timeout = 30000,
      maxTokens = 2000,
      model = 'claude-3-opus-20240229'
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
      
      // Get the appropriate prompt for this filing type
      const prompt = getPromptForFilingType(
        filingType as FilingType, 
        ticker, 
        companyName,
        truncatedContent
      );
      
      // Call Claude API
      console.log(`Calling Claude API for ${ticker} ${filingType} analysis...`);
      const response = await claudeClient.completeChat({
        messages: [
          { role: 'user', content: prompt }
        ],
        model,
        temperature,
        max_tokens: maxTokens,
        system: "You are an expert financial analyst specializing in SEC filings analysis. Provide concise, accurate analyses in valid JSON format."
      }, {
        timeout,
        requestType: 'premium' // Use premium request type for higher priority
      });
      
      // Parse the response
      let responseText = '';
      if (response.content && response.content.length > 0) {
        if ('text' in response.content[0]) {
          responseText = response.content[0].text as string;
        }
      }
      
      let analysis;
      try {
        // Try to extract JSON from the response if it's wrapped in text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
        
        // Try to parse as JSON
        analysis = jsonStr ? JSON.parse(jsonStr) : null;
        console.log('Successfully parsed Claude response as JSON');
      } catch (parseError) {
        console.warn('Failed to parse Claude response as JSON:', parseError);
        // If not valid JSON, use the raw text but truncate if too long
        analysis = { 
          parseError: true,
          rawAnalysis: responseText.substring(0, 500),
          fullTextLength: responseText.length
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
  private addToCache(key: string, analysis: any, documentHash: string): void {
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
   * Get Claude API usage statistics
   * 
   * @returns The usage statistics
   */
  getUsageStats(): any {
    try {
      return claudeClient.getUsage();
    } catch (error) {
      console.warn('Could not retrieve Claude usage statistics:', error);
      return { error: 'Usage statistics unavailable' };
    }
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
  getCacheStats(): any {
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
