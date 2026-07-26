import { FilingType } from '../../../types/sec/filing';
import { FilingSummaryResult, SECFiling, Company } from '../shared-types';
import { summarizeFiling, SummarizationOptions } from '../../../lib/ai/summarize';
import type { XSentiment } from '../../../lib/ai/parsers/x-sentiment-validator';
import * as secService from '../../secService';
import { findExistingSummary, storeSummary, StoreSummaryOptions } from '../database/filingDatabase';
import { scrapeDocumentLinksFromFilingPage, fetchDocumentContent } from '../extractors/documentScraper';
import { generateFallbackSummary, generateFallbackKeyPoints } from './fallbackSummaryGenerator';
import { normalizeFormType } from '../utils/formTypeUtils';
import { getSecApiHeaders } from '../utils/apiHeaders';
import { getDefaultModel } from '../../../lib/ai/config';

/**
 * General content validation rules for all SEC forms
 */
const CONTENT_VALIDATION_RULES = {
  minBytes: 50,        // Very permissive minimum - even brief notices can be valid
  maxBytes: 100000000  // 100MB maximum - handles even the largest annual reports
};

/**
 * Validates content before AI processing with general rules for all forms
 */
function validateContentForProcessing(content: string, ticker: string, formType: string): { isValid: boolean; reason?: string; contentLength: number } {
  const contentLength = content?.length || 0;
  
  // Basic empty content check
  if (contentLength === 0) {
    return {
      isValid: false,
      reason: 'Content is empty (contentLength: 0)',
      contentLength: 0
    };
  }
  
  // General length validation - applies to all forms
  if (contentLength < CONTENT_VALIDATION_RULES.minBytes) {
    return {
      isValid: false,
      reason: `Content too short (${contentLength} bytes, minimum ${CONTENT_VALIDATION_RULES.minBytes} required)`,
      contentLength
    };
  }
  
  if (contentLength > CONTENT_VALIDATION_RULES.maxBytes) {
    return {
      isValid: false,
      reason: `Content too large (${contentLength} bytes, maximum ${CONTENT_VALIDATION_RULES.maxBytes} allowed)`,
      contentLength
    };
  }
  
  // Content type validation - check if it looks like valid filing content
  const htmlIndicators = ['<html', '<body', '<div', '<table', '<p>', '<br>', '<span', '<td>', '<tr>'];
  const xmlIndicators = ['<?xml', '<xbrl', '<us-gaap:', '<dei:', '<document>'];
  const formIndicators = ['SEC FORM', 'FORM ', formType.toUpperCase(), 'SECURITIES AND EXCHANGE COMMISSION'];
  const textIndicators = ['UNITED STATES', 'WASHINGTON', 'COMMISSION FILE NUMBER']; // Plain text filings
  
  const lowerContent = content.toLowerCase().substring(0, 10000); // Check first 10KB for indicators
  const hasHtmlIndicators = htmlIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
  const hasXmlIndicators = xmlIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
  const hasFormIndicators = formIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
  const hasTextIndicators = textIndicators.some(indicator => lowerContent.includes(indicator.toLowerCase()));
  
  // Must have at least one type of content indicator
  if (!hasHtmlIndicators && !hasXmlIndicators && !hasFormIndicators && !hasTextIndicators) {
    return {
      isValid: false,
      reason: 'Content does not appear to be a valid SEC filing (no recognizable filing indicators found)',
      contentLength
    };
  }
  
  // Check for common error indicators (more comprehensive)
  const errorIndicators = [
    'not found',
    '404 error',
    'access denied', 
    'file not found',
    'document not available',
    'temporarily unavailable',
    'server error',
    'internal server error',
    'bad request',
    'forbidden'
  ];
  
  const hasErrorIndicators = errorIndicators.some(indicator => lowerContent.includes(indicator));
  if (hasErrorIndicators) {
    return {
      isValid: false,
      reason: 'Content contains error indicators suggesting document retrieval failure',
      contentLength
    };
  }
  
  // All validations passed
  return {
    isValid: true,
    contentLength
  };
}

/**
 * Validates AI-generated summary to ensure quality and completeness
 */
function validateAISummary(summaryText: string, keyPoints: string[], ticker: string, formType: string): { isValid: boolean; reason?: string; suggestions?: string[] } {
  const suggestions: string[] = [];
  
  // Basic content checks
  if (!summaryText || summaryText.trim().length === 0) {
    return {
      isValid: false,
      reason: 'Summary text is empty or only whitespace'
    };
  }
  
  // Check for minimum summary length based on form type
  const minSummaryLengths = {
    '10-K': 300,    // Annual reports need substantial summaries
    '10-Q': 200,    // Quarterly reports need good detail
    '8-K': 100,     // Current reports can be brief
    'DEFA14A': 150, // Proxy materials need reasonable detail
    'FORM4': 50,    // Insider trading can be very brief
    '144': 30,      // Notice of sale can be minimal
    'DEFAULT': 50   // General minimum
  };
  
  const minLength = minSummaryLengths[formType.toUpperCase()] || minSummaryLengths['DEFAULT'];
  if (summaryText.trim().length < minLength) {
    return {
      isValid: false,
      reason: `Summary too brief for ${formType} (${summaryText.trim().length} chars, minimum ${minLength} required)`
    };
  }
  
  // Check for truncated summary indicators
  const truncationIndicators = [
    'summary was cut off',
    'content truncated',
    '...[truncated]',
    'response limit reached',
    'token limit exceeded',
    'incomplete summary',
    '[TRUNCATED]'
  ];
  
  const lowerSummary = summaryText.toLowerCase();
  const hasTruncationIndicators = truncationIndicators.some(indicator => lowerSummary.includes(indicator.toLowerCase()));
  if (hasTruncationIndicators) {
    return {
      isValid: false,
      reason: 'Summary appears to be truncated or incomplete'
    };
  }
  
  // Check for generic/placeholder content
  const placeholderIndicators = [
    'unable to generate summary',
    'summary not available',
    'content could not be processed',
    'failed to analyze',
    'error in processing',
    'no summary available'
  ];
  
  const hasPlaceholderContent = placeholderIndicators.some(indicator => lowerSummary.includes(indicator));
  if (hasPlaceholderContent) {
    return {
      isValid: false,
      reason: 'Summary contains placeholder or error content instead of actual analysis'
    };
  }
  
  // Check key points quality
  if (!keyPoints || keyPoints.length === 0) {
    suggestions.push('No key points provided - consider regenerating with key points extraction');
  } else if (keyPoints.length === 1 && keyPoints[0].trim().length < 20) {
    suggestions.push('Key points appear too brief or generic');
  }
  
  // Check for form-specific content expectations
  if (formType.toUpperCase().includes('10-K') || formType.toUpperCase().includes('10-Q')) {
    if (!lowerSummary.includes('financial') && !lowerSummary.includes('revenue') && !lowerSummary.includes('earnings')) {
      suggestions.push('Financial filing summary lacks financial terminology - may need regeneration');
    }
  }
  
  // Check for company/ticker relevance
  if (!lowerSummary.includes(ticker.toLowerCase()) && ticker.length > 1) {
    suggestions.push(`Summary does not mention ticker ${ticker} - verify relevance`);
  }
  
  return {
    isValid: true,
    suggestions: suggestions.length > 0 ? suggestions : undefined
  };
}

/**
 * Gets a filing summary for a ticker and form type
 *
 * @param ticker The company ticker symbol
 * @param formType The SEC form type
 * @param fetchOptions Options for summary generation and storage
 * @returns Object containing the summary data or an error
 */
export async function getFilingSummary(
  ticker: string,
  formType: FilingType,
  fetchOptions: { bypassCache?: boolean; fromCron?: boolean; storageOptions?: StoreSummaryOptions } = {}
): Promise<{ data: FilingSummaryResult | null, error?: string }> {
  // Feature flag for enhanced filing service (Unified Flow)
  const useEnhancedSummarization = process.env.ENABLE_ENHANCED_SUMMARIZATION === 'true';
  
  if (useEnhancedSummarization) {
    try {
      const { getEnhancedFilingSummary } = await import('../enhanced/enhancedFilingSummaryService');
      console.log(`[INFO][FilingSummaryService] 🚀 Using enhanced summarization for ${ticker} - ${formType}`);
      const result = await getEnhancedFilingSummary(ticker, formType, {
        useEnhancedFetch: true,
        enableFallbacks: true,
        saveToDatabase: true,
        chunkingOptions: {
          maxTokensPerChunk: parseInt(process.env.ENHANCED_CHUNK_SIZE || '50000'),
          preserveStructure: true
        },
        summarizationOptions: {
          model: getDefaultModel(),
          maxRetries: 2,
          enableFallback: true
        }
      });
      
      // Log enhanced processing metadata for monitoring
      if (result.metadata) {
        console.log(`[INFO][FilingSummaryService] Enhanced processing completed`, {
          strategy: result.metadata.processingStrategy,
          cacheHit: result.metadata.cacheHit,
          chunksProcessed: result.metadata.chunkingResult?.totalChunks,
          totalTokens: result.metadata.summarizationResult.metadata.totalTokens,
          cost: result.metadata.summarizationResult.metadata.cost,
          processingTimeMs: result.metadata.totalProcessingTimeMs
        });
      }
      
      return result;
    } catch (enhancedError) {
      console.warn(`[WARN][FilingSummaryService] Enhanced summarization failed, falling back to legacy: ${enhancedError}`);
      // Fall through to legacy implementation
    }
  }
  try {
    console.log(`[DEBUG][FilingSummaryService] 🔍 Generating summary for ${ticker} - ${formType}`);
    
    // Normalize the form type
    const normalizedFormType = normalizeFormType(formType);
    
    // Check if we already have a summary for this ticker and form type
    // Bypass cache if explicitly requested or when called from cron processing
    const shouldBypassCache = fetchOptions.bypassCache || fetchOptions.fromCron || false;
    const existingSummary = await findExistingSummary(ticker, normalizedFormType, shouldBypassCache);
    if (existingSummary) {
      console.log(`[DEBUG][FilingSummaryService] ✅ Found existing summary for ${ticker} - ${normalizedFormType}`);
      return { data: existingSummary };
    }
    
    // Get company info
    console.log(`[DEBUG][FilingSummaryService] 🏢 Getting company info for ${ticker}`);
    const companyInfo = await secService.getCompanyInfo(ticker);
    if (!companyInfo) {
      console.error(`[DEBUG][FilingSummaryService] ❌ Could not find company info for ${ticker}`);
      return { data: null, error: `Could not find company info for ${ticker}` };
    }
    
    // Get the latest filing of the specified type
    console.log(`[DEBUG][FilingSummaryService] 📄 Getting latest filing of type ${normalizedFormType} for ${ticker}`);
    const filing = await secService.getLatestFilingByFormType(ticker, normalizedFormType);
    if (!filing) {
      console.error(`[DEBUG][FilingSummaryService] ❌ No ${normalizedFormType} filing found for ${ticker}`);
      return { data: null, error: `No ${normalizedFormType} filing found for ${ticker}` };
    }
    
    try {
      // Get the filing details
      console.log(`[DEBUG][FilingSummaryService] 📝 Getting filing details for ${filing.accessionNumber}`);
      const filingDetails = await secService.getFilingDetails(filing.accessionNumber);
      
      // Get the HTML viewer URL
      const htmlViewerUrl = filing.filingUrl || `https://www.sec.gov/Archives/edgar/data/${filing.cik}/${filing.accessionNumber.replace(/-/g, '')}/` + 
                                              `${filing.accessionNumber}-index.html`;
      
      // Get the document content
      console.log(`[DEBUG][FilingSummaryService] 📄 Getting document content for ${htmlViewerUrl}`);
      
      // First try to get the document content from the filing details
      let content = '';
      let mainDocument = null;
      
      if (filingDetails && filingDetails.documents && filingDetails.documents.length > 0) {
        // Find the main document (usually the first one or one with a specific type)
        mainDocument = filingDetails.documents.find(doc => 
          doc.type === normalizedFormType || 
          doc.description?.toLowerCase().includes('filing') ||
          doc.description?.toLowerCase().includes('form')
        );
        
        // If no main document found, use the first document
        if (!mainDocument && filingDetails.documents.length > 0) {
          mainDocument = filingDetails.documents[0];
        }
        
        if (mainDocument) {
          console.log(`[DEBUG][FilingSummaryService] 📄 Found main document: ${mainDocument.description || mainDocument.type}`);
          content = await secService.getFilingContent(filing.accessionNumber, mainDocument.sequence, filing.cik);
        }
      }
      
      // If we couldn't get the content from the filing details, try scraping it
      if (!content) {
        console.log(`[DEBUG][FilingSummaryService] 🔍 Attempting to scrape document content`);
        const documentUrl = await scrapeDocumentLinksFromFilingPage(filing, getSecApiHeaders());
        
        if (documentUrl) {
          content = await fetchDocumentContent(documentUrl) || '';
        }
      }
      
      // If we still don't have content, generate a fallback summary
      if (!content) {
        console.warn(`[DEBUG][FilingSummaryService] ⚠️ Could not retrieve document content, using fallback summary`);
        
        // Generate a fallback summary
        const summaryText = generateFallbackSummary(filing, companyInfo, normalizedFormType);
        const keyPoints = generateFallbackKeyPoints(filing, companyInfo, normalizedFormType);
        
        // Create the summary result
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
        
        // Store the fallback summary
        await storeSummary(
          ticker,
          normalizedFormType,
          filing.filingDate || new Date().toISOString(),
          htmlViewerUrl,
          summaryText,
          keyPoints,
          {
            accessionNumber: filing.accessionNumber,
            primaryDocUrl: filing.primaryDocUrl,
            model: 'fallback',
            failureReason: 'Document content could not be retrieved',
            filingDetails: filingDetails
          },
          fetchOptions.storageOptions
        );

        return { data: summaryResult };
      }

      // Validate content before AI processing
      const validation = validateContentForProcessing(content, ticker, normalizedFormType);
      if (!validation.isValid) {
        console.warn(`[DEBUG][FilingSummaryService] ⚠️ Content validation failed: ${validation.reason}`);
        
        // Generate a fallback summary with validation failure reason
        const summaryText = generateFallbackSummary(filing, companyInfo, normalizedFormType);
        const keyPoints = generateFallbackKeyPoints(filing, companyInfo, normalizedFormType);
        
        // Create the summary result
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
          failureReason: `Content validation failed: ${validation.reason}`
        };
        
        // Store the fallback summary
        await storeSummary(
          ticker,
          normalizedFormType,
          filing.filingDate || new Date().toISOString(),
          htmlViewerUrl,
          summaryText,
          keyPoints,
          {
            accessionNumber: filing.accessionNumber,
            primaryDocUrl: filing.primaryDocUrl,
            model: 'fallback',
            failureReason: `Content validation failed: ${validation.reason}`,
            contentLength: validation.contentLength,
            filingDetails: filingDetails
          },
          fetchOptions.storageOptions
        );

        return { data: summaryResult };
      }

      // We have valid content, generate a summary using AI
      console.log(`[DEBUG][FilingSummaryService] 🤖 Generating AI summary for ${ticker} - ${normalizedFormType} (content: ${validation.contentLength} bytes)`);
      
      // Set summarization options
      const options: SummarizationOptions = {
        maxRetries: 2,
        model: getDefaultModel(),
        metadata: {
          ticker: ticker,
          companyName: companyInfo.name || ticker,
          formType: normalizedFormType,
          filingDate: filing.filingDate || new Date().toISOString(),
          accessionNumber: filing.accessionNumber || '',
          cik: filing.cik || companyInfo.cik || '',
          documentType: mainDocument?.type || normalizedFormType,
          documentDescription: mainDocument?.description || `Form ${normalizedFormType}`,
          contentLength: validation.contentLength
        }
      };
      
      // Generate the summary
      const summaryJSON = await summarizeFiling(content, options);
      
      // Check if summarization was successful
      if (!summaryJSON || !summaryJSON.summary) {
        console.error(`[DEBUG][FilingSummaryService] ❌ Failed to generate summary`);
        
        // Generate a fallback summary
        const summaryText = generateFallbackSummary(filing, companyInfo, normalizedFormType);
        const keyPoints = generateFallbackKeyPoints(filing, companyInfo, normalizedFormType);
        
        // Create the summary result
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
        
        // Store the fallback summary
        await storeSummary(
          ticker,
          normalizedFormType,
          filing.filingDate || new Date().toISOString(),
          htmlViewerUrl,
          summaryText,
          keyPoints,
          {
            accessionNumber: filing.accessionNumber,
            primaryDocUrl: filing.primaryDocUrl,
            model: 'fallback',
            failureReason: 'AI summarization failed',
            filingDetails: filingDetails,
            // Even when AI's summary text fell back, summarize.ts may have
            // attached xSentiment from the parser-fallback path on the nested
            // summaryJSON field. Propagate so the X sentiment block can render.
            xSentiment: summaryJSON ? (summaryJSON.summaryJSON as { xSentiment?: XSentiment } | undefined)?.xSentiment : undefined,
          },
          fetchOptions.storageOptions
        );

        return { data: summaryResult };
      }

      // Validate AI-generated summary for quality and completeness
      const summaryValidation = validateAISummary(summaryJSON.summary, summaryJSON.keyPoints || [], ticker, normalizedFormType);
      if (!summaryValidation.isValid) {
        console.warn(`[DEBUG][FilingSummaryService] ⚠️ AI summary validation failed: ${summaryValidation.reason}`);
        
        // Generate a fallback summary since AI output is invalid
        const summaryText = generateFallbackSummary(filing, companyInfo, normalizedFormType);
        const keyPoints = generateFallbackKeyPoints(filing, companyInfo, normalizedFormType);
        
        // Create the summary result with fallback content
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
          failureReason: `AI summary validation failed: ${summaryValidation.reason}`
        };
        
        // Store the fallback summary
        await storeSummary(
          ticker,
          normalizedFormType,
          filing.filingDate || new Date().toISOString(),
          htmlViewerUrl,
          summaryText,
          keyPoints,
          {
            accessionNumber: filing.accessionNumber,
            primaryDocUrl: filing.primaryDocUrl,
            model: 'fallback',
            failureReason: `AI summary validation failed: ${summaryValidation.reason}`,
            filingDetails: filingDetails,
            // AI summary failed validation but the x_sentiment provider may
            // have run; preserve its payload (nested at summaryJSON.summaryJSON)
            // so the X sentiment block can still surface with a fallback body.
            xSentiment: (summaryJSON.summaryJSON as { xSentiment?: XSentiment } | undefined)?.xSentiment,
          },
          fetchOptions.storageOptions
        );

        return { data: summaryResult };
      }

      // Log any validation suggestions for monitoring
      if (summaryValidation.suggestions && summaryValidation.suggestions.length > 0) {
        console.log(`[DEBUG][FilingSummaryService] 💡 AI summary validation suggestions for ${ticker}-${normalizedFormType}:`, summaryValidation.suggestions);
      }
      
      // Store the summary in the database first to get the database ID
      const storeResult = await storeSummary(
        ticker,
        normalizedFormType,
        filing.filingDate || new Date().toISOString(),
        htmlViewerUrl,
        summaryJSON.summary,
        summaryJSON.keyPoints || [],
        {
          accessionNumber: filing.accessionNumber,
          primaryDocUrl: filing.primaryDocUrl,
          content: content.substring(0, 5000),
          documentType: mainDocument?.type || 'unknown',
          documentDescription: mainDocument?.description || 'unknown',
          filingDetails: filingDetails,
          tokensUsed: summaryJSON.tokensUsed,
          inputTokens: summaryJSON.inputTokens,
          outputTokens: summaryJSON.outputTokens,
          model: summaryJSON.model || options.model,
          cost: summaryJSON.cost,
          processingTimeMs: summaryJSON.processingTimeMs,
          // Thread the F3-validated X sentiment payload through to DB persistence.
          // The variable `summaryJSON` here is summarizeFiling's RETURN object;
          // the parsed AI data (which carries xSentiment) lives nested at
          // `summaryJSON.summaryJSON`. Without this thread, the data was
          // generated upstream (real $0.05/x_search call) but lost before
          // reaching the DB row — the email render path then has nothing to show.
          xSentiment: (summaryJSON.summaryJSON as { xSentiment?: XSentiment } | undefined)?.xSentiment,
        },
        fetchOptions.storageOptions
      );

      // Create the summary result with database ID for email delivery tracking
      // IMPORTANT: Pass full summaryJSON through rawData for email templates
      // This enables Form 4 multi-transaction display, filer info, and other structured data
      const summaryResult: FilingSummaryResult = {
        ticker: ticker,
        companyName: companyInfo.name || ticker,
        filingType: normalizedFormType as FilingType,
        filingDate: filing.filingDate || new Date().toISOString(),
        accessionNumber: filing.accessionNumber || '',
        summaryText: summaryJSON.summary,
        keyPoints: summaryJSON.keyPoints || [],
        url: filing.primaryDocUrl || htmlViewerUrl, // Prefer primaryDocUrl for direct document links
        filingUrl: filing.filingUrl,
        parsedContent: undefined,
        rawData: { summaryJSON: summaryJSON.summaryJSON }, // Pass full AI-parsed data for email templates
        tokensUsed: summaryJSON.tokensUsed,
        inputTokens: summaryJSON.inputTokens,
        outputTokens: summaryJSON.outputTokens,
        model: summaryJSON.model || options.model,
        cost: summaryJSON.cost,
        processingStatus: 'COMPLETED',
        processingTimeMs: summaryJSON.processingTimeMs,
        // Include database ID for email delivery tracking (use first ID if multiple users)
        databaseId: storeResult.summaryIds.length > 0 ? storeResult.summaryIds[0] : undefined,
        isCacheHit: false
      };

      console.log(`[DEBUG][FilingSummaryService] ✅ Successfully created summary for ${ticker} - ${normalizedFormType} (stored for ${storeResult.stored}/${storeResult.total} users)`);
      return { data: summaryResult };
    } catch (summaryError: unknown) {
      console.error(`[DEBUG][FilingSummaryService] ❌ Error preparing summary result: ${summaryError instanceof Error ? summaryError.message : 'Unknown error'}`);
      return { data: null, error: `Error preparing summary result: ${summaryError instanceof Error ? summaryError.message : 'Unknown error'}` };
    }
  } catch (error: unknown) {
    console.error(`[DEBUG][FilingSummaryService] ❌ Error generating summary for ${ticker}:`, error);
    console.error(`[DEBUG][FilingSummaryService] Error stack:`, error instanceof Error ? error.stack : 'No stack trace available');
    console.error(`[DEBUG][FilingSummaryService] Form type that caused error: ${formType}`);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : `Failed to generate summary for ${ticker}` 
    };
  }
}
