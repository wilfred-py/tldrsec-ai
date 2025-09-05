import { FilingType } from '../../../types/sec/filing';
import { FilingSummaryResult, SECFiling, Company } from '../../filing/types';
import { summarizeFiling, SummarizationOptions } from '../../../lib/ai/summarize';
import * as secService from '../../secService';
import { findExistingSummary, storeSummary } from '../database/filingDatabase';
import { scrapeDocumentLinksFromFilingPage, fetchDocumentContent } from '../extractors/documentScraper';
import { generateFallbackSummary, generateFallbackKeyPoints } from './fallbackSummaryGenerator';
import { normalizeFormType } from '../utils/formTypeUtils';
import { getSecApiHeaders } from '../utils/apiHeaders';
import { getClaudeModel } from '../../../lib/ai/config';

/**
 * Gets a filing summary for a ticker and form type
 * 
 * @param ticker The company ticker symbol
 * @param formType The SEC form type
 * @param options Options for summary generation
 * @returns Object containing the summary data or an error
 */
export async function getFilingSummary(
  ticker: string, 
  formType: FilingType,
  options: { bypassCache?: boolean; fromCron?: boolean } = {}
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
          model: getClaudeModel(),
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
    const shouldBypassCache = options.bypassCache || options.fromCron || false;
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
          content = await secService.getFilingContent(filing.accessionNumber, mainDocument.sequence);
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
            model: 'fallback',
            failureReason: 'Document content could not be retrieved',
            filingDetails: filingDetails
          }
        );
        
        return { data: summaryResult };
      }
      
      // We have content, generate a summary using AI
      console.log(`[DEBUG][FilingSummaryService] 🤖 Generating AI summary for ${ticker} - ${normalizedFormType}`);
      
      // Set summarization options
      const options: SummarizationOptions = {
        maxRetries: 2,
        model: getClaudeModel(),
        metadata: {
          ticker: ticker,
          companyName: companyInfo.name || ticker,
          formType: normalizedFormType,
          filingDate: filing.filingDate || new Date().toISOString(),
          accessionNumber: filing.accessionNumber || '',
          cik: filing.cik || companyInfo.cik || '',
          documentType: mainDocument?.type || normalizedFormType,
          documentDescription: mainDocument?.description || `Form ${normalizedFormType}`
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
            model: 'fallback',
            failureReason: 'AI summarization failed',
            filingDetails: filingDetails
          }
        );
        
        return { data: summaryResult };
      }
      
      // Create the summary result
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
          documentType: mainDocument?.type || 'unknown',
          documentDescription: mainDocument?.description || 'unknown',
          filingDetails: filingDetails,
          tokensUsed: summaryJSON.tokensUsed,
          inputTokens: summaryJSON.inputTokens,
          outputTokens: summaryJSON.outputTokens,
          model: summaryJSON.model || options.model,
          cost: summaryJSON.cost,
          processingTimeMs: summaryJSON.processingTimeMs
        }
      );
      
      console.log(`[DEBUG][FilingSummaryService] ✅ Successfully created summary for ${ticker} - ${normalizedFormType}`);
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
