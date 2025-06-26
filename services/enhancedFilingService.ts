/**
 * Enhanced Filing Service
 * 
 * Provides advanced SEC filing summarization with:
 * - Caching to prevent redundant API calls when multiple users request the same filing
 * - Streaming support for faster partial results
 * - Enhanced chunking to process all document chunks
 * - Batch processing with concurrency limits
 * - Improved error recovery with retries and fallbacks
 */

import { FilingType } from '../lib/sec-edgar/types';
import { FormTypeMetadata, getFormMetadata } from '../lib/sec-edgar/form-registry';
import { parseFormContent, extractImportantContent, ParsedContent } from '../lib/parsers/form-parser';
import { prisma } from '../lib/db';
import { FilingSummaryResult } from './filingService';
import { enhancedSummarizer, SummarizationEvent } from '../lib/ai/enhanced-summarize';
import { summaryCache, SummaryCacheKey } from '../lib/ai/cache/summary-cache';
import { logger } from '../lib/logging';
import { monitoring } from '../lib/monitoring';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

// Import modularized components directly
import { getCompanyInfo } from './filings/companyInfo';
import { getFilings, getFilingContent } from './filings/filingRetrieval';

// Component logger
const componentLogger = logger.child('enhanced-filing-service');

/**
 * Events emitted by the enhanced filing service
 */
export enum EnhancedFilingEvent {
  SUMMARY_STARTED = 'filing:summary_started',
  SUMMARY_PROGRESS = 'filing:summary_progress',
  SUMMARY_COMPLETED = 'filing:summary_completed',
  SUMMARY_ERROR = 'filing:summary_error',
  BATCH_STARTED = 'filing:batch_started',
  BATCH_PROGRESS = 'filing:batch_progress',
  BATCH_COMPLETED = 'filing:batch_completed'
}

/**
 * Enhanced filing service class
 */
export class EnhancedFilingService extends EventEmitter {
  /**
   * Get a summary of a specific filing type for a company with enhanced features
   * @param ticker Company ticker symbol
   * @param formType SEC form type
   * @param options Additional options
   * @returns Filing summary result or error
   */
  async getFilingSummary(
    ticker: string,
    formType: FilingType,
    options: {
      userId?: string;
      useStreaming?: boolean;
      useCache?: boolean;
      processAllChunks?: boolean;
      concurrencyLimit?: number;
    } = {}
  ): Promise<{ data: FilingSummaryResult | null; error?: string }> {
    const startTime = Date.now();
    const summaryId = uuidv4();
    const requestId = `${ticker}-${formType}-${summaryId.slice(0, 8)}`;
    
    componentLogger.info(`Enhanced filing summary request: ${ticker} ${formType} (${requestId})`);
    
    try {
      // Emit started event
      this.emit(EnhancedFilingEvent.SUMMARY_STARTED, { ticker, formType, requestId });
      
      // Step 1: Get company information
      const companyInfo = await getCompanyInfo(ticker);
      if (!companyInfo || !companyInfo.cik) {
        throw new Error(`Company information not found for ticker: ${ticker}`);
      }
      
      // Step 2: Get the latest filing of the requested type
      const filings = await getFilings(companyInfo.cik, formType, 1);
      if (!filings || filings.length === 0) {
        throw new Error(`No ${formType} filings found for ${ticker}`);
      }
      
      const latestFiling = filings[0];
      const { accessionNumber, filingDate, form } = latestFiling;
      
      // Step 3: Check if we already have this filing in our database
      let secFiling = await prisma.secFiling.findFirst({
        where: {
          ticker: { symbol: ticker },
          formType: form,
          accessionNumber
        },
        include: {
          summaries: true,
          ticker: true
        }
      });
      
      // Step 4: Create cache key for this filing
      const cacheKey: SummaryCacheKey = {
        formType: form,
        cik: companyInfo.cik,
        accessionNumber
      };
      
      // Step 5: Check cache for existing summary
      if (options.useCache !== false) {
        const cachedResult = await summaryCache.checkCache(cacheKey);
        
        if (cachedResult && cachedResult.status === 'COMPLETED' && cachedResult.result) {
          componentLogger.info(`Cache hit for ${ticker} ${formType} (${requestId})`);
          monitoring.incrementCounter('filing.cache.hits', 1);
          
          // Convert to filing summary result
          const result = this._convertToFilingSummaryResult(
            cachedResult.result,
            ticker,
            companyInfo.name,
            form as FilingType,
            filingDate,
            accessionNumber,
            latestFiling.htmlUrl
          );
          
          // Emit completed event
          this.emit(EnhancedFilingEvent.SUMMARY_COMPLETED, { 
            ticker, 
            formType, 
            requestId,
            result,
            fromCache: true
          });
          
          return { data: result };
        }
        
        monitoring.incrementCounter('filing.cache.misses', 1);
      }
      
      // Step 6: If filing doesn't exist in our database, fetch and store it
      if (!secFiling) {
        // Get the filing content
        const filingContent = await getFilingContent(
          accessionNumber,
          companyInfo.cik
        );
        
        if (!filingContent) {
          throw new Error(`Failed to fetch content for ${form} filing ${accessionNumber}`);
        }
        
        // Create ticker record if it doesn't exist
        const ticker = await prisma.ticker.upsert({
          where: { symbol: companyInfo.ticker },
          update: {},
          create: {
            symbol: companyInfo.ticker,
            companyName: companyInfo.name,
            cik: companyInfo.cik
          }
        });
        
        // Create the SEC filing record
        secFiling = await prisma.secFiling.create({
          data: {
            tickerId: ticker.id,
            formType: form,
            filingDate: new Date(filingDate),
            accessionNumber,
            htmlUrl: latestFiling.htmlUrl,
            txtUrl: latestFiling.txtUrl,
            rawContent: filingContent,
            cik: companyInfo.cik
          },
          include: {
            ticker: true
          }
        });
      }
      
      // Step 7: Create a new summary record
      const summary = await prisma.summary.create({
        data: {
          secFilingId: secFiling.id,
          processingStatus: 'QUEUED',
          requestedBy: options.userId
        }
      });
      
      // Step 8: Set up event forwarding from the summarizer
      enhancedSummarizer.on(SummarizationEvent.PROGRESS, (data) => {
        if (data.summaryId === summary.id) {
          this.emit(EnhancedFilingEvent.SUMMARY_PROGRESS, {
            ticker,
            formType,
            requestId,
            content: data.content,
            isPartial: true
          });
        }
      });
      
      enhancedSummarizer.on(SummarizationEvent.PARTIAL_RESULT, (data) => {
        if (data.summaryId === summary.id) {
          const partialResult = this._convertToFilingSummaryResult(
            {
              summaryId: summary.id,
              summaryText: data.result,
              isPartial: true,
              duration: Date.now() - startTime
            },
            ticker,
            companyInfo.name,
            form as FilingType,
            filingDate,
            accessionNumber,
            latestFiling.htmlUrl
          );
          
          this.emit(EnhancedFilingEvent.SUMMARY_PROGRESS, {
            ticker,
            formType,
            requestId,
            result: partialResult,
            isPartial: true
          });
        }
      });
      
      // Step 9: Process the filing with enhanced summarizer
      const summarizationResult = await enhancedSummarizer.summarizeFiling({
        filingId: secFiling.id,
        summaryId: summary.id,
        useStreaming: options.useStreaming,
        useCache: options.useCache !== false,
        processAllChunks: options.processAllChunks,
        concurrencyLimit: options.concurrencyLimit,
        cacheKey,
        filingType: form as FilingType
      });
      
      // Step 10: Convert result to filing summary result
      const result = this._convertToFilingSummaryResult(
        summarizationResult,
        ticker,
        companyInfo.name,
        form as FilingType,
        filingDate,
        accessionNumber,
        latestFiling.htmlUrl
      );
      
      // Emit completed event
      this.emit(EnhancedFilingEvent.SUMMARY_COMPLETED, { 
        ticker, 
        formType, 
        requestId,
        result,
        fromCache: false,
        duration: Date.now() - startTime
      });
      
      monitoring.recordTiming('filing.summary_duration', Date.now() - startTime);
      return { data: result };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      componentLogger.error(`Error getting filing summary for ${ticker} ${formType}: ${errorMessage}`);
      
      // Emit error event
      this.emit(EnhancedFilingEvent.SUMMARY_ERROR, { 
        ticker, 
        formType, 
        requestId,
        error: errorMessage
      });
      
      monitoring.incrementCounter('filing.summary_error', 1);
      return { data: null, error: `Failed to get filing summary: ${errorMessage}` };
    }
  }
  
  /**
   * Get summaries for multiple filings in parallel
   * @param requests Array of filing requests
   * @param options Additional options
   * @returns Array of filing summary results
   */
  async getBatchFilingSummaries(
    requests: Array<{ ticker: string; formType: FilingType }>,
    options: {
      userId?: string;
      concurrencyLimit?: number;
      useCache?: boolean;
      processAllChunks?: boolean;
    } = {}
  ): Promise<{ 
    results: FilingSummaryResult[]; 
    errors: Array<{ ticker: string; formType: string; error: string }> 
  }> {
    const startTime = Date.now();
    const batchId = `batch-${uuidv4().slice(0, 8)}`;
    const concurrencyLimit = options.concurrencyLimit || 3;
    
    componentLogger.info(`Starting batch filing summaries for ${requests.length} filings (${batchId})`);
    
    // Emit batch started event
    this.emit(EnhancedFilingEvent.BATCH_STARTED, { 
      batchId, 
      requests,
      concurrencyLimit
    });
    
    try {
      const results: FilingSummaryResult[] = [];
      const errors: Array<{ ticker: string; formType: string; error: string }> = [];
      let completedCount = 0;
      
      // Process in batches with concurrency limit
      const batches = [];
      for (let i = 0; i < requests.length; i += concurrencyLimit) {
        batches.push(requests.slice(i, i + concurrencyLimit));
      }
      
      for (const batch of batches) {
        const batchPromises = batch.map(async ({ ticker, formType }) => {
          try {
            const result = await this.getFilingSummary(ticker, formType, {
              ...options,
              useStreaming: false // Disable streaming for batch operations
            });
            
            if (result.data) {
              results.push(result.data);
            } else if (result.error) {
              errors.push({ ticker, formType, error: result.error });
            }
            
            // Update progress
            completedCount++;
            this.emit(EnhancedFilingEvent.BATCH_PROGRESS, {
              batchId,
              completed: completedCount,
              total: requests.length,
              progress: Math.round((completedCount / requests.length) * 100)
            });
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push({ ticker, formType, error: errorMessage });
            
            // Update progress even on error
            completedCount++;
            this.emit(EnhancedFilingEvent.BATCH_PROGRESS, {
              batchId,
              completed: completedCount,
              total: requests.length,
              progress: Math.round((completedCount / requests.length) * 100)
            });
          }
        });
        
        // Wait for current batch to complete before starting next batch
        await Promise.all(batchPromises);
      }
      
      // Emit batch completed event
      this.emit(EnhancedFilingEvent.BATCH_COMPLETED, { 
        batchId, 
        results,
        errors,
        duration: Date.now() - startTime
      });
      
      monitoring.recordTiming('filing.batch_summary_duration', Date.now() - startTime);
      return { results, errors };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      componentLogger.error(`Error in batch filing summaries: ${errorMessage}`);
      monitoring.incrementCounter('filing.batch_summary_error', 1);
      
      return { 
        results: [], 
        errors: requests.map(req => ({ 
          ticker: req.ticker, 
          formType: req.formType, 
          error: errorMessage 
        }))
      };
    }
  }
  
  /**
   * Convert a summarization result to a filing summary result
   * @param result Summarization result
   * @param ticker Company ticker
   * @param companyName Company name
   * @param filingType SEC form type
   * @param filingDate Filing date
   * @param accessionNumber SEC accession number
   * @param url SEC HTML viewer URL
   * @returns Filing summary result
   */
  private _convertToFilingSummaryResult(
    result: any,
    ticker: string,
    companyName: string,
    filingType: FilingType,
    filingDate: string,
    accessionNumber: string,
    url: string
  ): FilingSummaryResult {
    // Extract summary text
    let summaryText = '';
    let keyPoints: string[] = [];
    let parsedContent: ParsedContent | undefined;
    
    if (typeof result.summaryText === 'string') {
      summaryText = result.summaryText;
      
      // Try to extract key points from the summary text
      keyPoints = this._extractKeyPoints(summaryText, filingType);
    } else if (typeof result.summaryText === 'object' && result.summaryText !== null) {
      // If the summary is a structured object, convert it to a string and extract key points
      const summaryObj = result.summaryText;
      
      if (summaryObj.summary) {
        summaryText = summaryObj.summary;
      } else {
        summaryText = JSON.stringify(summaryObj, null, 2);
      }
      
      // Use key points if available in the object
      if (Array.isArray(summaryObj.keyPoints)) {
        keyPoints = summaryObj.keyPoints;
      } else if (Array.isArray(summaryObj.key_points)) {
        keyPoints = summaryObj.key_points;
      } else if (Array.isArray(summaryObj.highlights)) {
        keyPoints = summaryObj.highlights;
      } else {
        // Extract key points from summary text
        keyPoints = this._extractKeyPoints(summaryText, filingType);
      }
      
      // Store the structured content
      parsedContent = summaryObj as any;
    }
    
    // Ensure we have at least some key points
    if (!keyPoints || keyPoints.length === 0) {
      keyPoints = [
        `${filingType} filing for ${companyName} (${ticker})`,
        `Filed on ${filingDate}`,
        'Contains official company disclosures',
        'May contain material information for investors'
      ];
    }
    
    // Return formatted result
    return {
      ticker,
      companyName,
      filingType,
      filingDate,
      accessionNumber,
      summaryText,
      keyPoints,
      url,
      filingUrl: url, // For backward compatibility
      parsedContent,
      rawData: result.summaryJSON || result.summaryText,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      tokensUsed: (result.inputTokens || 0) + (result.outputTokens || 0),
      model: result.modelUsed,
      cost: result.cost,
      processingStatus: result.isPartial ? 'PARTIAL' : 'COMPLETED',
      processingTimeMs: result.duration,
      failureReason: result.parsingErrors ? result.parsingErrors.join('; ') : undefined
    };
  }
  
  /**
   * Extract key points from a summary text
   * @param summaryText Summary text
   * @param formType SEC form type
   * @returns Array of key points
   */
  private _extractKeyPoints(summaryText: string, formType: FilingType): string[] {
    const keyPoints: string[] = [];
    
    // Try to extract bullet points
    const bulletPointRegex = /[•\-\*]\s*([^\n]+)/g;
    let match;
    while ((match = bulletPointRegex.exec(summaryText)) !== null && keyPoints.length < 10) {
      keyPoints.push(match[1].trim());
    }
    
    // If no bullet points found, try to extract sentences
    if (keyPoints.length === 0) {
      const sentences = summaryText
        .split(/[.!?]/)
        .map(s => s.trim())
        .filter(s => s.length > 20 && s.length < 150);
      
      // Take up to 5 sentences as key points
      for (let i = 0; i < Math.min(5, sentences.length); i++) {
        keyPoints.push(sentences[i] + '.');
      }
    }
    
    return keyPoints;
  }
}

// Export singleton instance
export const enhancedFilingService = new EnhancedFilingService();
