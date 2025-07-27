/**
 * Enhanced Filing Summary Service - Tranche 1 Migration
 * 
 * Integrates enhanced document fetching while maintaining existing API compatibility
 * This is a drop-in replacement for filingSummaryService.ts with improved performance
 */

import { FilingType } from '../../../types/sec/filing';
import { FilingSummaryResult, SECFiling, Company } from '../../filing/types';
import { summarizeFiling, SummarizationOptions } from '../../../lib/ai/summarize';
import * as secService from '../../secService';
import { findExistingSummary, storeSummary } from '../database/filingDatabase';
import { fetchEnhancedDocumentContent, getEnhancedSecApiHeaders } from '../extractors/enhancedDocumentScraper';
import { generateFallbackSummary, generateFallbackKeyPoints } from './fallbackSummaryGenerator';
import { normalizeFormType } from '../utils/formTypeUtils';
import { logger } from '../../../lib/logging';
import { monitoring } from '../../../lib/monitoring';

const enhancedLogger = logger.child('enhanced-filing-summary-service');

// Safe monitoring wrapper
const safeMonitoring = {
  recordDuration: function(metric: string, value: number, tags: Record<string, string | boolean> = {}) {
    try {
      if (typeof monitoring.recordTiming === 'function') {
        monitoring.recordTiming(metric, value, tags);
      }
    } catch (error) {
      console.warn('Failed to record timing', { error });
    }
  }
};

/**
 * Enhanced filing summary generation with improved fetching and fallback handling
 */
export async function getEnhancedFilingSummary(
  ticker: string, 
  formType: FilingType,
  options: {
    useEnhancedFetch?: boolean;
    enableFallbacks?: boolean;
    saveToDatabase?: boolean;
  } = {}
): Promise<{ data: FilingSummaryResult | null, error?: string }> {
  const startTime = Date.now();
  const { useEnhancedFetch = true, enableFallbacks = true, saveToDatabase = true } = options;
  
  try {
    enhancedLogger.info(`🚀 Enhanced filing summary request: ${ticker} - ${formType}`, { useEnhancedFetch });
    
    // Normalize the form type
    const normalizedFormType = normalizeFormType(formType);
    
    // Check if we already have a summary for this ticker and form type
    if (saveToDatabase) {
      const existingSummary = await findExistingSummary(ticker, normalizedFormType);
      if (existingSummary) {
        enhancedLogger.info(`✅ Found existing summary for ${ticker} - ${normalizedFormType}`);
        safeMonitoring.recordDuration('enhanced_filing_summary_cache_hit_ms', Date.now() - startTime, {
          ticker,
          formType: normalizedFormType,
          cache_hit: 'true'
        });
        return { data: existingSummary };
      }
    }
    
    // Get company info
    enhancedLogger.debug(`🏢 Getting company info for ${ticker}`);
    const companyInfo = await secService.getCompanyInfo(ticker);
    if (!companyInfo) {
      enhancedLogger.error(`❌ Could not find company info for ${ticker}`);
      return { data: null, error: `Could not find company info for ${ticker}` };
    }
    
    // Get the latest filing of the specified type
    enhancedLogger.debug(`📄 Getting latest filing of type ${normalizedFormType} for ${ticker}`);
    const filing = await secService.getLatestFilingByFormType(ticker, normalizedFormType);
    if (!filing) {
      enhancedLogger.error(`❌ No ${normalizedFormType} filing found for ${ticker}`);
      return { data: null, error: `No ${normalizedFormType} filing found for ${ticker}` };
    }
    
    // Generate filing URL
    const htmlViewerUrl = filing.filingUrl || 
      `https://www.sec.gov/Archives/edgar/data/${filing.cik}/${filing.accessionNumber.replace(/-/g, '')}/` + 
      `${filing.accessionNumber}-index.html`;
    
    let content = '';
    let contentMetadata: Record<string, any> = {};
    let fetchMethod = 'legacy';
    
    try {
      if (useEnhancedFetch) {
        // Use enhanced fetch method
        enhancedLogger.debug(`🚀 Using enhanced fetch for ${htmlViewerUrl}`);
        const fetchStart = Date.now();
        
        const result = await fetchEnhancedDocumentContent(htmlViewerUrl);
        content = result.content;
        contentMetadata = result.metadata;
        fetchMethod = 'enhanced';
        
        safeMonitoring.recordDuration('enhanced_content_fetch_ms', Date.now() - fetchStart, {
          ticker,
          formType: normalizedFormType,
          method: 'enhanced',
          was_directory: contentMetadata.wasDirectoryListing?.toString() || 'false'
        });
        
        enhancedLogger.info(`✅ Enhanced fetch successful, content length: ${content.length}`, {
          actualUrl: result.actualUrl,
          wasDirectory: contentMetadata.wasDirectoryListing
        });
      } else {
        // Fallback to legacy method
        enhancedLogger.debug(`📄 Using legacy fetch method for ${htmlViewerUrl}`);
        const fetchStart = Date.now();
        
        const filingDetails = await secService.getFilingDetails(filing.accessionNumber);
        let mainDocument = null;
        
        if (filingDetails && filingDetails.documents && filingDetails.documents.length > 0) {
          mainDocument = filingDetails.documents.find(doc => 
            doc.type === normalizedFormType || 
            doc.description?.toLowerCase().includes('filing') ||
            doc.description?.toLowerCase().includes('form')
          );
          
          if (!mainDocument) {
            mainDocument = filingDetails.documents[0];
          }
          
          if (mainDocument) {
            content = await secService.getFilingContent(filing.accessionNumber, mainDocument.sequence);
            fetchMethod = 'legacy';
          }
        }
        
        safeMonitoring.recordDuration('legacy_content_fetch_ms', Date.now() - fetchStart, {
          ticker,
          formType: normalizedFormType,
          method: 'legacy'
        });
      }
    } catch (fetchError) {
      enhancedLogger.warn(`⚠️ Content fetch failed with ${fetchMethod} method:`, fetchError);
      
      if (useEnhancedFetch && enableFallbacks) {
        // Try legacy method as fallback
        enhancedLogger.debug(`🔄 Falling back to legacy fetch method`);
        try {
          const filingDetails = await secService.getFilingDetails(filing.accessionNumber);
          let mainDocument = null;
          
          if (filingDetails && filingDetails.documents && filingDetails.documents.length > 0) {
            mainDocument = filingDetails.documents[0];
            if (mainDocument) {
              content = await secService.getFilingContent(filing.accessionNumber, mainDocument.sequence);
              fetchMethod = 'legacy-fallback';
              enhancedLogger.info(`✅ Legacy fallback successful, content length: ${content.length}`);
            }
          }
        } catch (fallbackError) {
          enhancedLogger.error(`❌ Legacy fallback also failed:`, fallbackError);
        }
      }
    }
    
    // If we still don't have content, generate a fallback summary
    if (!content && enableFallbacks) {
      enhancedLogger.warn(`⚠️ Could not retrieve document content, using fallback summary`);
      
      const summaryText = generateFallbackSummary(filing, companyInfo, normalizedFormType);
      const keyPoints = generateFallbackKeyPoints(filing, companyInfo, normalizedFormType);
      
      const summaryResult: FilingSummaryResult = {
        ticker: ticker,
        companyName: companyInfo.name || ticker,
        filingType: normalizedFormType as FilingType,
        filingDate: filing.filingDate || new Date().toISOString(),
        accessionNumber: filing.accessionNumber || '',
        summaryText: summaryText,
        keyPoints: keyPoints,
        url: htmlViewerUrl,
        filingUrl: filing.filingUrl,
        model: 'fallback',
        failureReason: 'Document content could not be retrieved'
      };
      
      if (saveToDatabase) {
        await storeSummary(
          ticker,
          normalizedFormType,
          filing.filingDate || new Date().toISOString(),
          htmlViewerUrl,
          summaryText,
          keyPoints,
          {
            accessionNumber: filing.accessionNumber,
            model: 'fallback',
            failureReason: 'Document content could not be retrieved',
            fetchMethod
          }
        );
      }
      
      safeMonitoring.recordDuration('enhanced_filing_summary_fallback_ms', Date.now() - startTime, {
        ticker,
        formType: normalizedFormType,
        result: 'fallback'
      });
      
      return { data: summaryResult };
    }
    
    if (!content) {
      return { data: null, error: 'Could not retrieve filing content and fallbacks are disabled' };
    }
    
    // Generate AI summary
    enhancedLogger.debug(`🤖 Generating AI summary for ${ticker} - ${normalizedFormType}`);
    const summarizeStart = Date.now();
    
    const options: SummarizationOptions = {
      maxRetries: 2,
      model: 'claude-sonnet-4-20250514',
      metadata: {
        ticker: ticker,
        companyName: companyInfo.name || ticker,
        formType: normalizedFormType,
        filingDate: filing.filingDate || new Date().toISOString(),
        accessionNumber: filing.accessionNumber || '',
        cik: filing.cik || companyInfo.cik || '',
        fetchMethod,
        ...contentMetadata
      }
    };
    
    const summaryJSON = await summarizeFiling(content, options);
    
    safeMonitoring.recordDuration('enhanced_ai_summarization_ms', Date.now() - summarizeStart, {
      ticker,
      formType: normalizedFormType,
      fetchMethod,
      contentLength: content.length.toString()
    });
    
    // Check if summarization was successful
    if (!summaryJSON || !summaryJSON.summary) {
      if (enableFallbacks) {
        enhancedLogger.warn(`⚠️ AI summarization failed, using fallback summary`);
        
        const summaryText = generateFallbackSummary(filing, companyInfo, normalizedFormType);
        const keyPoints = generateFallbackKeyPoints(filing, companyInfo, normalizedFormType);
        
        const summaryResult: FilingSummaryResult = {
          ticker: ticker,
          companyName: companyInfo.name || ticker,
          filingType: normalizedFormType as FilingType,
          filingDate: filing.filingDate || new Date().toISOString(),
          accessionNumber: filing.accessionNumber || '',
          summaryText: summaryText,
          keyPoints: keyPoints,
          url: htmlViewerUrl,
          filingUrl: filing.filingUrl,
          model: 'fallback',
          failureReason: 'AI summarization failed'
        };
        
        if (saveToDatabase) {
          await storeSummary(
            ticker,
            normalizedFormType,
            filing.filingDate || new Date().toISOString(),
            htmlViewerUrl,
            summaryText,
            keyPoints,
            {
              accessionNumber: filing.accessionNumber,
              model: 'fallback',
              failureReason: 'AI summarization failed',
              fetchMethod
            }
          );
        }
        
        return { data: summaryResult };
      } else {
        return { data: null, error: 'AI summarization failed and fallbacks are disabled' };
      }
    }
    
    // Create successful summary result
    const summaryResult: FilingSummaryResult = {
      ticker: ticker,
      companyName: companyInfo.name || ticker,
      filingType: normalizedFormType as FilingType,
      filingDate: filing.filingDate || new Date().toISOString(),
      accessionNumber: filing.accessionNumber || '',
      summaryText: summaryJSON.summary,
      keyPoints: summaryJSON.keyPoints || [],
      url: htmlViewerUrl,
      filingUrl: filing.filingUrl,
      parsedContent: undefined,
      rawData: undefined,
      tokensUsed: summaryJSON.tokensUsed,
      inputTokens: summaryJSON.inputTokens,
      outputTokens: summaryJSON.outputTokens,
      model: summaryJSON.model || options.model,
      cost: summaryJSON.cost,
      processingStatus: 'COMPLETED',
      processingTimeMs: summaryJSON.processingTimeMs
    };
    
    // Store the summary in the database
    if (saveToDatabase) {
      await storeSummary(
        ticker,
        normalizedFormType,
        filing.filingDate || new Date().toISOString(),
        htmlViewerUrl,
        summaryJSON.summary,
        summaryJSON.keyPoints || [],
        {
          accessionNumber: filing.accessionNumber,
          content: content.substring(0, 5000),
          tokensUsed: summaryJSON.tokensUsed,
          inputTokens: summaryJSON.inputTokens,
          outputTokens: summaryJSON.outputTokens,
          model: summaryJSON.model || options.model,
          cost: summaryJSON.cost,
          processingTimeMs: summaryJSON.processingTimeMs,
          fetchMethod,
          ...contentMetadata
        }
      );
    }
    
    safeMonitoring.recordDuration('enhanced_filing_summary_total_ms', Date.now() - startTime, {
      ticker,
      formType: normalizedFormType,
      fetchMethod,
      result: 'success'
    });
    
    enhancedLogger.info(`✅ Enhanced filing summary completed for ${ticker} - ${normalizedFormType}`, {
      fetchMethod,
      tokensUsed: summaryJSON.tokensUsed,
      cost: summaryJSON.cost,
      processingTimeMs: Date.now() - startTime
    });
    
    return { data: summaryResult };
    
  } catch (error: unknown) {
    const errorFormType = formType || 'unknown';
    safeMonitoring.recordDuration('enhanced_filing_summary_error_ms', Date.now() - startTime, {
      ticker,
      formType: errorFormType,
      result: 'error'
    });
    
    enhancedLogger.error(`❌ Enhanced filing summary error for ${ticker}:`, error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : `Failed to generate enhanced summary for ${ticker}` 
    };
  }
}

/**
 * Backward compatibility wrapper - drop-in replacement for existing getFilingSummary
 */
export async function getFilingSummary(
  ticker: string, 
  formType: FilingType
): Promise<{ data: FilingSummaryResult | null, error?: string }> {
  return getEnhancedFilingSummary(ticker, formType, {
    useEnhancedFetch: true,
    enableFallbacks: true,
    saveToDatabase: true
  });
}