/**
 * Direct Filing Summary Service - Tranche 2 Migration
 * 
 * Combines enhanced document fetching (Tranche 1) with direct Claude integration (Tranche 2)
 * This provides the full test-summarize experience while maintaining production compatibility
 */

import { FilingType } from '../../../types/sec/filing';
import { FilingSummaryResult } from '../../filing/types';
import { DirectClaudeClient } from '../../../lib/ai/directClaudeClient';
import { fetchEnhancedDocumentContent } from '../extractors/enhancedDocumentScraper';
import { parseFormContentEnhanced } from '../../../lib/parsers/enhanced-form-parser';
import * as secService from '../../secService';
import { findExistingSummary, storeSummary } from '../database/filingDatabase';
import { generateFallbackSummary, generateFallbackKeyPoints } from './fallbackSummaryGenerator';
import { normalizeFormType } from '../utils/formTypeUtils';
import { logger } from '../../../lib/logging';
import { monitoring } from '../../../lib/monitoring';

const directLogger = logger.child('direct-filing-summary-service');

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
 * Configuration for direct filing summarization
 */
export interface DirectSummarizationConfig {
  useDirectClaude?: boolean;
  useEnhancedFetch?: boolean;
  enableFallbacks?: boolean;
  saveToDatabase?: boolean;
  cacheResults?: boolean;
  claudeConfig?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    enableChunking?: boolean;
  };
}

/**
 * In-memory cache for direct summarization (simple implementation)
 */
const directSummaryCache: Record<string, { 
  data: FilingSummaryResult; 
  expiresAt: Date; 
}> = {};

/**
 * Cache utilities
 */
function getCacheKey(ticker: string, formType: string, filingDate?: string): string {
  const baseKey = `${ticker.toUpperCase()}-${formType.toUpperCase()}`;
  return filingDate ? `${baseKey}-${filingDate}` : baseKey;
}

function getCachedSummary(ticker: string, formType: string): FilingSummaryResult | null {
  const key = getCacheKey(ticker, formType);
  const cached = directSummaryCache[key];
  
  if (cached && cached.expiresAt > new Date()) {
    return cached.data;
  }
  
  if (cached && cached.expiresAt <= new Date()) {
    delete directSummaryCache[key];
  }
  
  return null;
}

function setCachedSummary(ticker: string, formType: string, data: FilingSummaryResult, ttlMinutes: number = 60): void {
  const key = getCacheKey(ticker, formType);
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);
  
  directSummaryCache[key] = { data, expiresAt };
}

/**
 * Direct filing summary service with full test-summarize functionality
 */
export async function getDirectFilingSummary(
  ticker: string,
  formType: FilingType,
  config: DirectSummarizationConfig = {}
): Promise<{ data: FilingSummaryResult | null, error?: string }> {
  const startTime = Date.now();
  const {
    useDirectClaude = true,
    useEnhancedFetch = true,
    enableFallbacks = true,
    saveToDatabase = true,
    cacheResults = true,
    claudeConfig = {}
  } = config;
  
  try {
    directLogger.info(`🚀 Direct filing summary request: ${ticker} - ${formType}`, {
      useDirectClaude,
      useEnhancedFetch,
      enableFallbacks
    });
    
    const normalizedFormType = normalizeFormType(formType);
    
    // Step 1: Check cache first
    if (cacheResults) {
      const cachedResult = getCachedSummary(ticker, normalizedFormType);
      if (cachedResult) {
        directLogger.info(`✅ Cache hit for ${ticker} - ${normalizedFormType}`);
        safeMonitoring.recordDuration('direct_filing_summary_cache_hit_ms', Date.now() - startTime, {
          ticker,
          formType: normalizedFormType,
          cache_hit: 'true'
        });
        return { data: cachedResult };
      }
    }
    
    // Step 2: Check database if enabled
    if (saveToDatabase) {
      const existingSummary = await findExistingSummary(ticker, normalizedFormType);
      if (existingSummary) {
        directLogger.info(`✅ Found existing database summary for ${ticker} - ${normalizedFormType}`);
        
        if (cacheResults) {
          setCachedSummary(ticker, normalizedFormType, existingSummary);
        }
        
        safeMonitoring.recordDuration('direct_filing_summary_db_hit_ms', Date.now() - startTime, {
          ticker,
          formType: normalizedFormType,
          db_hit: 'true'
        });
        return { data: existingSummary };
      }
    }
    
    // Step 3: Get company info
    directLogger.debug(`🏢 Getting company info for ${ticker}`);
    const companyInfo = await secService.getCompanyInfo(ticker);
    if (!companyInfo) {
      directLogger.error(`❌ Could not find company info for ${ticker}`);
      return { data: null, error: `Could not find company info for ${ticker}` };
    }
    
    // Step 4: Get latest filing
    directLogger.debug(`📄 Getting latest filing of type ${normalizedFormType} for ${ticker}`);
    const filing = await secService.getLatestFilingByFormType(ticker, normalizedFormType);
    if (!filing) {
      directLogger.error(`❌ No ${normalizedFormType} filing found for ${ticker}`);
      return { data: null, error: `No ${normalizedFormType} filing found for ${ticker}` };
    }
    
    // Step 5: Generate filing URL
    const htmlViewerUrl = filing.filingUrl || 
      `https://www.sec.gov/Archives/edgar/data/${filing.cik}/${filing.accessionNumber.replace(/-/g, '')}/` + 
      `${filing.accessionNumber}-index.html`;
    
    // Step 6: Fetch content using enhanced method
    let content = '';
    let contentMetadata: Record<string, any> = {};
    let fetchMethod = 'none';
    
    try {
      if (useEnhancedFetch) {
        directLogger.debug(`🚀 Using enhanced fetch for ${htmlViewerUrl}`);
        const fetchStart = Date.now();
        
        const result = await fetchEnhancedDocumentContent(htmlViewerUrl);
        content = result.content;
        contentMetadata = result.metadata;
        fetchMethod = 'enhanced';
        
        safeMonitoring.recordDuration('direct_enhanced_content_fetch_ms', Date.now() - fetchStart, {
          ticker,
          formType: normalizedFormType,
          was_directory: contentMetadata.wasDirectoryListing?.toString() || 'false'
        });
        
        directLogger.info(`✅ Enhanced fetch successful, content length: ${content.length}`, {
          actualUrl: result.actualUrl,
          wasDirectory: contentMetadata.wasDirectoryListing
        });
      } else {
        // Legacy fetch as fallback
        directLogger.debug(`📄 Using legacy fetch method for ${htmlViewerUrl}`);
        const filingDetails = await secService.getFilingDetails(filing.accessionNumber);
        if (filingDetails && filingDetails.documents && filingDetails.documents.length > 0) {
          const mainDocument = filingDetails.documents[0];
          content = await secService.getFilingContent(filing.accessionNumber, mainDocument.sequence);
          fetchMethod = 'legacy';
        }
      }
    } catch (fetchError) {
      directLogger.warn(`⚠️ Content fetch failed:`, fetchError);
      if (enableFallbacks && useEnhancedFetch) {
        // Try legacy as fallback
        try {
          const filingDetails = await secService.getFilingDetails(filing.accessionNumber);
          if (filingDetails && filingDetails.documents && filingDetails.documents.length > 0) {
            const mainDocument = filingDetails.documents[0];
            content = await secService.getFilingContent(filing.accessionNumber, mainDocument.sequence);
            fetchMethod = 'legacy-fallback';
            directLogger.info(`✅ Legacy fallback successful`);
          }
        } catch (fallbackError) {
          directLogger.error(`❌ Legacy fallback also failed:`, fallbackError);
        }
      }
    }
    
    // Step 7: Handle no content scenario
    if (!content && enableFallbacks) {
      directLogger.warn(`⚠️ Could not retrieve document content, using fallback summary`);
      return await createFallbackSummary(
        ticker, normalizedFormType, filing, companyInfo, htmlViewerUrl, 
        saveToDatabase, cacheResults, startTime, fetchMethod
      );
    }
    
    if (!content) {
      return { data: null, error: 'Could not retrieve filing content and fallbacks are disabled' };
    }
    
    // Step 8: Generate AI summary using direct Claude
    if (useDirectClaude) {
      directLogger.debug(`🤖 Generating direct Claude summary for ${ticker} - ${normalizedFormType}`);
      const summarizeStart = Date.now();
      
      try {
        const claudeClient = new DirectClaudeClient(claudeConfig);
        const claudeResult = await claudeClient.summarizeFiling(
          content,
          normalizedFormType as FilingType,
          {
            ticker: ticker,
            companyName: companyInfo.name || ticker
          }
        );
        
        safeMonitoring.recordDuration('direct_claude_summarization_ms', Date.now() - summarizeStart, {
          ticker,
          formType: normalizedFormType,
          chunksProcessed: claudeResult.chunksProcessed?.toString() || '1'
        });
        
        // Create successful summary result
        const summaryResult: FilingSummaryResult = {
          ticker: ticker,
          companyName: companyInfo.name || ticker,
          filingType: normalizedFormType as FilingType,
          filingDate: filing.filingDate || new Date().toISOString(),
          accessionNumber: filing.accessionNumber || '',
          summaryText: typeof claudeResult.summary === 'string' ? claudeResult.summary : JSON.stringify(claudeResult.summary),
          keyPoints: extractKeyPointsFromSummary(claudeResult.summary),
          url: htmlViewerUrl,
          filingUrl: filing.filingUrl,
          tokensUsed: claudeResult.inputTokens + claudeResult.outputTokens,
          inputTokens: claudeResult.inputTokens,
          outputTokens: claudeResult.outputTokens,
          model: claudeResult.model,
          cost: claudeResult.cost,
          processingStatus: 'COMPLETED',
          processingTimeMs: Date.now() - startTime
        };
        
        // Save to database if enabled
        if (saveToDatabase) {
          await storeSummary(
            ticker,
            normalizedFormType,
            filing.filingDate || new Date().toISOString(),
            htmlViewerUrl,
            summaryResult.summaryText,
            summaryResult.keyPoints,
            {
              accessionNumber: filing.accessionNumber,
              content: content.substring(0, 5000),
              tokensUsed: claudeResult.inputTokens + claudeResult.outputTokens,
              inputTokens: claudeResult.inputTokens,
              outputTokens: claudeResult.outputTokens,
              model: claudeResult.model,
              cost: claudeResult.cost,
              processingTimeMs: Date.now() - startTime,
              fetchMethod,
              chunksProcessed: claudeResult.chunksProcessed,
              primaryDocUrl: filing.primaryDocUrl, // Store actual document URL for email links
              ...contentMetadata
            }
          );
        }
        
        // Cache the result
        if (cacheResults) {
          setCachedSummary(ticker, normalizedFormType, summaryResult);
        }
        
        safeMonitoring.recordDuration('direct_filing_summary_total_ms', Date.now() - startTime, {
          ticker,
          formType: normalizedFormType,
          fetchMethod,
          result: 'success',
          direct_claude: 'true'
        });
        
        directLogger.info(`✅ Direct filing summary completed for ${ticker} - ${normalizedFormType}`, {
          fetchMethod,
          tokensUsed: claudeResult.inputTokens + claudeResult.outputTokens,
          cost: claudeResult.cost,
          processingTimeMs: Date.now() - startTime,
          chunksProcessed: claudeResult.chunksProcessed
        });
        
        return { data: summaryResult };
        
      } catch (claudeError) {
        directLogger.error(`❌ Direct Claude summarization failed:`, claudeError);
        
        if (enableFallbacks) {
          directLogger.warn(`🔄 Falling back to fallback summary after Claude failure`);
          return await createFallbackSummary(
            ticker, normalizedFormType, filing, companyInfo, htmlViewerUrl,
            saveToDatabase, cacheResults, startTime, fetchMethod
          );
        } else {
          return { data: null, error: `AI summarization failed: ${claudeError instanceof Error ? claudeError.message : String(claudeError)}` };
        }
      }
    } else {
      // Fall back to legacy AI summarization if direct Claude is disabled
      directLogger.warn(`⚠️ Direct Claude disabled, falling back to legacy AI summarization`);
      
      try {
        const legacySummaryResult = await generateLegacyAISummary(
          content,
          ticker,
          normalizedFormType,
          filing,
          companyInfo,
          htmlViewerUrl,
          fetchMethod,
          startTime
        );
        
        // Save to database if enabled
        if (saveToDatabase) {
          await storeSummary(
            ticker,
            normalizedFormType,
            filing.filingDate || new Date().toISOString(),
            htmlViewerUrl,
            legacySummaryResult.summaryText,
            legacySummaryResult.keyPoints,
            {
              accessionNumber: filing.accessionNumber,
              content: content.substring(0, 5000),
              model: 'legacy-ai',
              processingTimeMs: Date.now() - startTime,
              fetchMethod,
              primaryDocUrl: filing.primaryDocUrl, // Store actual document URL for email links
              ...contentMetadata
            }
          );
        }
        
        // Cache the result
        if (cacheResults) {
          setCachedSummary(ticker, normalizedFormType, legacySummaryResult);
        }
        
        safeMonitoring.recordDuration('direct_filing_summary_total_ms', Date.now() - startTime, {
          ticker,
          formType: normalizedFormType,
          fetchMethod,
          result: 'success',
          legacy_ai: 'true'
        });
        
        directLogger.info(`✅ Legacy AI summary completed for ${ticker} - ${normalizedFormType}`, {
          fetchMethod,
          processingTimeMs: Date.now() - startTime,
          model: 'legacy-ai'
        });
        
        return { data: legacySummaryResult };
        
      } catch (legacyError) {
        directLogger.error(`❌ Legacy AI summarization failed:`, legacyError);
        
        if (enableFallbacks) {
          directLogger.warn(`🔄 Falling back to fallback summary after legacy AI failure`);
          return await createFallbackSummary(
            ticker, normalizedFormType, filing, companyInfo, htmlViewerUrl,
            saveToDatabase, cacheResults, startTime, fetchMethod
          );
        } else {
          return { data: null, error: `Legacy AI summarization failed: ${legacyError instanceof Error ? legacyError.message : String(legacyError)}` };
        }
      }
    }
    
  } catch (error: unknown) {
    safeMonitoring.recordDuration('direct_filing_summary_error_ms', Date.now() - startTime, {
      ticker,
      formType: normalizedFormType,
      result: 'error'
    });
    
    directLogger.error(`❌ Direct filing summary error for ${ticker}:`, error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : `Failed to generate direct summary for ${ticker}` 
    };
  }
}

/**
 * Create fallback summary helper
 */
async function createFallbackSummary(
  ticker: string,
  normalizedFormType: string,
  filing: any,
  companyInfo: any,
  htmlViewerUrl: string,
  saveToDatabase: boolean,
  cacheResults: boolean,
  startTime: number,
  fetchMethod: string
): Promise<{ data: FilingSummaryResult | null, error?: string }> {
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
    failureReason: 'Content retrieval or AI summarization failed',
    processingTimeMs: Date.now() - startTime
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
        failureReason: 'Content retrieval or AI summarization failed',
        fetchMethod,
        primaryDocUrl: filing.primaryDocUrl, // Store actual document URL for email links
        processingTimeMs: Date.now() - startTime
      }
    );
  }
  
  if (cacheResults) {
    setCachedSummary(ticker, normalizedFormType, summaryResult);
  }
  
  safeMonitoring.recordDuration('direct_filing_summary_fallback_ms', Date.now() - startTime, {
    ticker,
    formType: normalizedFormType,
    result: 'fallback'
  });
  
  return { data: summaryResult };
}

/**
 * Extract key points from Claude summary (handles both string and object formats)
 */
function extractKeyPointsFromSummary(summary: string | Record<string, any>): string[] {
  if (typeof summary === 'string') {
    // Extract bullet points or key insights from text
    const lines = summary.split('\n').filter(line => 
      line.trim().startsWith('•') || 
      line.trim().startsWith('-') || 
      line.trim().startsWith('*')
    );
    return lines.map(line => line.trim().replace(/^[•\-*]\s*/, ''));
  }
  
  if (typeof summary === 'object' && summary !== null) {
    const keyPoints: string[] = [];
    
    // Extract from different sections
    if (Array.isArray(summary.financialPerformance)) {
      keyPoints.push(...summary.financialPerformance.map((fp: any) => 
        `${fp.metric}: ${fp.value} (${fp.insight || 'No insight provided'})`
      ));
    }
    
    if (Array.isArray(summary.businessHighlights)) {
      keyPoints.push(...summary.businessHighlights.map((bh: any) => 
        `${bh.topic}: ${bh.detail}`
      ));
    }
    
    if (Array.isArray(summary.riskFactors)) {
      keyPoints.push(...summary.riskFactors.map((rf: any) => 
        `Risk - ${rf.category}: ${rf.description}`
      ));
    }
    
    if (summary.keyTakeaway) {
      keyPoints.push(`Key Takeaway: ${summary.keyTakeaway}`);
    }
    
    return keyPoints.slice(0, 10); // Limit to 10 key points
  }
  
  return ['Unable to extract key points from summary'];
}

/**
 * Generate summary using legacy AI client (fallback)
 */
async function generateLegacyAISummary(
  content: string,
  ticker: string,
  normalizedFormType: string,
  filing: any,
  companyInfo: any,
  htmlViewerUrl: string,
  fetchMethod: string,
  startTime: number
): Promise<FilingSummaryResult> {
  directLogger.info(`🔄 Using legacy AI summarization for ${ticker} - ${normalizedFormType}`);
  
  // Import legacy AI client if available
  let aiClient;
  try {
    // Try to import the legacy AI client
    const { claudeAI } = await import('../../../lib/ai/claude');
    aiClient = claudeAI;
  } catch (importError) {
    directLogger.warn('Legacy AI client not available, using simple text processing');
    
    // Fallback to simple text processing
    return {
      ticker: ticker,
      companyName: companyInfo.name || ticker,
      filingType: normalizedFormType as FilingType,
      filingDate: filing.filingDate || new Date().toISOString(),
      accessionNumber: filing.accessionNumber || '',
      summaryText: generateSimpleTextSummary(content, normalizedFormType, companyInfo),
      keyPoints: extractKeyPointsFromContent(content),
      url: htmlViewerUrl,
      filingUrl: filing.filingUrl,
      model: 'simple-text-processing',
      processingStatus: 'COMPLETED',
      processingTimeMs: Date.now() - startTime
    };
  }
  
  try {
    // Use legacy AI client to generate summary
    const legacyResult = await aiClient.summarizeFiling(content, {
      formType: normalizedFormType,
      ticker: ticker,
      companyName: companyInfo.name || ticker
    });
    
    return {
      ticker: ticker,
      companyName: companyInfo.name || ticker,
      filingType: normalizedFormType as FilingType,
      filingDate: filing.filingDate || new Date().toISOString(),
      accessionNumber: filing.accessionNumber || '',
      summaryText: legacyResult.summary || 'Summary generated using legacy AI client',
      keyPoints: legacyResult.keyPoints || extractKeyPointsFromContent(content),
      url: htmlViewerUrl,
      filingUrl: filing.filingUrl,
      tokensUsed: legacyResult.tokensUsed || 0,
      model: 'legacy-ai',
      processingStatus: 'COMPLETED',
      processingTimeMs: Date.now() - startTime
    };
  } catch (legacyError) {
    directLogger.error('Legacy AI client failed, falling back to text processing', legacyError);
    
    // Final fallback to simple text processing
    return {
      ticker: ticker,
      companyName: companyInfo.name || ticker,
      filingType: normalizedFormType as FilingType,
      filingDate: filing.filingDate || new Date().toISOString(),
      accessionNumber: filing.accessionNumber || '',
      summaryText: generateSimpleTextSummary(content, normalizedFormType, companyInfo),
      keyPoints: extractKeyPointsFromContent(content),
      url: htmlViewerUrl,
      filingUrl: filing.filingUrl,
      model: 'simple-text-processing',
      processingStatus: 'COMPLETED',
      processingTimeMs: Date.now() - startTime,
      failureReason: 'Legacy AI client failed, used simple text processing'
    };
  }
}

/**
 * Generate a simple text-based summary when AI is not available
 */
function generateSimpleTextSummary(content: string, formType: string, companyInfo: any): string {
  const companyName = companyInfo.name || 'Unknown Company';
  const contentLength = content.length;
  
  // Basic content analysis
  const paragraphs = content.split('\n').filter(p => p.trim().length > 50).length;
  const words = content.split(/\s+/).length;
  
  let summary = `${formType} filing for ${companyName}\n\n`;
  summary += `This document contains ${words.toLocaleString()} words across ${paragraphs} substantial paragraphs. `;
  
  // Look for common SEC filing sections
  const sections = [];
  if (content.toLowerCase().includes('business overview') || content.toLowerCase().includes('business description')) {
    sections.push('business overview');
  }
  if (content.toLowerCase().includes('risk factors')) {
    sections.push('risk factors');
  }
  if (content.toLowerCase().includes('financial statements') || content.toLowerCase().includes('consolidated statements')) {
    sections.push('financial statements');
  }
  if (content.toLowerCase().includes('management discussion') || content.toLowerCase().includes('md&a')) {
    sections.push("management's discussion and analysis");
  }
  
  if (sections.length > 0) {
    summary += `The filing includes sections on: ${sections.join(', ')}. `;
  }
  
  summary += `\n\nNote: This is a basic summary generated without AI analysis. `;
  summary += `For detailed insights, please review the full filing document.`;
  
  return summary;
}

/**
 * Extract key points from content using simple text analysis
 */
function extractKeyPointsFromContent(content: string): string[] {
  const keyPoints: string[] = [];
  
  // Look for bullet points or numbered lists
  const bulletRegex = /^[\s]*[•\-*\d+\.]\s*(.+)$/gm;
  const bullets = [...content.matchAll(bulletRegex)];
  
  bullets.slice(0, 5).forEach(match => {
    const point = match[1]?.trim();
    if (point && point.length > 10 && point.length < 200) {
      keyPoints.push(point);
    }
  });
  
  // Look for sentences with financial keywords
  const financialKeywords = ['revenue', 'income', 'profit', 'loss', 'earnings', 'sales', 'growth', 'margin'];
  const sentences = content.split(/[.!?]+/);
  
  sentences.forEach(sentence => {
    const lowerSentence = sentence.toLowerCase();
    if (financialKeywords.some(keyword => lowerSentence.includes(keyword)) && 
        sentence.trim().length > 20 && sentence.trim().length < 150) {
      keyPoints.push(sentence.trim());
    }
  });
  
  // Ensure we have at least a few key points
  if (keyPoints.length === 0) {
    keyPoints.push('No specific key points identified in automated analysis');
    keyPoints.push('Manual review of the filing is recommended for detailed insights');
  }
  
  return keyPoints.slice(0, 8); // Limit to 8 key points
}

/**
 * Backward compatibility wrapper - drop-in replacement for getFilingSummary
 */
export async function getFilingSummary(
  ticker: string, 
  formType: FilingType
): Promise<{ data: FilingSummaryResult | null, error?: string }> {
  return getDirectFilingSummary(ticker, formType, {
    useDirectClaude: true,
    useEnhancedFetch: true,
    enableFallbacks: true,
    saveToDatabase: true,
    cacheResults: true
  });
}