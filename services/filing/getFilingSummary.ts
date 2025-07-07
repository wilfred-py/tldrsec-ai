import { FilingSummary, FilingType } from '../../types/sec/filing';
import { FilingType as SecEdgarFilingType } from '../../lib/sec-edgar/types';
import { FilingSummaryResult, SECFiling, Company } from './types';
import { getFilingById } from './getFilingById';
import { parseFormContent, ParsedContent } from '../../lib/parsers/form-parser';
import { getFormMetadata } from '../../lib/sec-edgar/form-registry';
import { logger } from '../../lib/logging';
import { extractKeyPoints, generateSimpleSummary } from './utils';
import { normalizeFormType } from './formTypeService';
import { generateFallbackSummary } from './fallbackSummary';
import { checkSummaryExists, getSummaryFromDatabase, saveSummaryToDatabase, logFilingProcessing } from './databaseService';
import { scrapeDocumentLinksFromFilingPage, fetchDocumentContent } from './documentScraper';
import { generateAISummaryWithRetry } from './summaryGenerationService';
import * as secService from '../secService';

/**
 * Get a summary of a filing by its accession number
 * @param accessionNumber SEC filing accession number
 * @param cik Optional CIK number
 * @returns Filing summary result
 */
export async function getFilingSummary(
  accessionNumber: string,
  cik?: string
): Promise<FilingSummaryResult> {
  const startTime = Date.now();
  
  try {
    logger.debug(`Getting filing summary for ${accessionNumber}`);
    
    // Check if summary already exists in the database
    const existingSummary = await getSummaryFromDatabase(accessionNumber);
    if (existingSummary) {
      logger.info(`Found existing summary for ${accessionNumber} in database`);
      return existingSummary;
    }
    
    // Get the filing data
    const { data: filingData } = await getFilingById(accessionNumber, cik);
    
    if (!filingData) {
      throw new Error(`No filing data found for ${accessionNumber}`);
    }
    
    // Parse the filing content
    const parsedContent = await parseFormContent(
      filingData.content,
      (filingData.metadata.formType || 'UPLOAD') as SecEdgarFilingType
    ) as ParsedContent & { ticker?: string }; // Add ticker property to ParsedContent
    
    // Get the form metadata
    const formMetadata = getFormMetadata(
      filingData.metadata.formType || 'UPLOAD'
    );
    const normalizedFormType = normalizeFormType(filingData.metadata.formType || 'UPLOAD' as SecEdgarFilingType) as FilingType;
    
    // Extract the ticker symbol from the metadata
    let ticker = '';
    if (filingData.metadata.tickers && filingData.metadata.tickers.length > 0) {
      ticker = filingData.metadata.tickers[0];
    }
    
    // If no ticker found in metadata, try to extract from parsed content
    if (!ticker && parsedContent.ticker) {
      ticker = parsedContent.ticker;
    }
    
    // Create filing and company objects for use with our services
    const filing: SECFiling = {
      filingDate: filingData.metadata.filingDate,
      formType: normalizedFormType,
      accessionNumber: accessionNumber,
      cik: filingData.metadata.cik || cik,
      filingHtmlUrl: filingData.urls.html,
      filingUrl: filingData.urls.content
    };
    
    const company: Company = {
      name: filingData.metadata.companyName || 'Unknown Company',
      ticker: ticker,
      cik: filingData.metadata.cik || cik
    };
    
    // Try to generate an AI summary
    let summaryText = '';
    let keyPoints: string[] = [];
    let aiMetrics = {};
    let failureReason = '';
    
    try {
      // Get document content for AI summarization
      const documentLink = await scrapeDocumentLinksFromFilingPage(filing, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      });
      
      if (documentLink) {
        const documentContent = await fetchDocumentContent(documentLink, {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        });
        
        if (documentContent) {
          // Generate AI summary with retry
          const aiSummary = await generateAISummaryWithRetry(documentContent, filing, company);
          
          if (aiSummary.error) {
            failureReason = aiSummary.error;
            // Use the AI-generated summary but note that there was an error
            summaryText = aiSummary.summary;
            keyPoints = aiSummary.keyPoints;
          } else {
            // Use the AI-generated summary
            summaryText = aiSummary.summary;
            keyPoints = aiSummary.keyPoints;
            
            // Store AI metrics
            aiMetrics = {
              tokensUsed: aiSummary.tokensUsed,
              inputTokens: aiSummary.inputTokens,
              outputTokens: aiSummary.outputTokens,
              model: aiSummary.model,
              cost: aiSummary.cost
            };
          }
        } else {
          // Fallback to simple summary if document content couldn't be fetched
          failureReason = 'Failed to fetch document content';
          summaryText = generateFallbackSummary(filing, company, normalizedFormType);
          keyPoints = extractKeyPoints(parsedContent, normalizedFormType);
        }
      } else {
        // Fallback to simple summary if document link couldn't be found
        failureReason = 'Failed to find document link';
        summaryText = generateFallbackSummary(filing, company, normalizedFormType);
        keyPoints = extractKeyPoints(parsedContent, normalizedFormType);
      }
    } catch (error) {
      // Fallback to simple summary if AI summarization fails
      failureReason = error instanceof Error ? error.message : String(error);
      logger.error(`Error generating AI summary: ${failureReason}`);
      summaryText = generateSimpleSummary(
        parsedContent,
        normalizedFormType,
        ticker,
        company.name || 'Unknown Company'
      );
      keyPoints = extractKeyPoints(parsedContent, normalizedFormType);
    }
    
    // Calculate processing time
    const processingTimeMs = Date.now() - startTime;
    
    // Create the summary result
    const summaryResult: FilingSummaryResult = {
      ticker: ticker || 'UNKNOWN',
      companyName: filingData.metadata.companyName || 'Unknown Company',
      filingType: normalizedFormType,
      filingDate: filingData.metadata.filingDate || new Date().toISOString().split('T')[0],
      accessionNumber: accessionNumber,
      summaryText: summaryText,
      keyPoints: keyPoints,
      url: filingData.urls.html,
      filingUrl: filingData.urls.content,
      parsedContent: parsedContent,
      rawData: filingData,
      processingStatus: failureReason ? 'completed' : 'completed', // Still mark as completed even if we used fallback
      processingTimeMs: processingTimeMs,
      failureReason: failureReason || undefined,
      ...aiMetrics
    };
    
    // Save the summary to the database
    await saveSummaryToDatabase(summaryResult);
    
    // Log the processing
    await logFilingProcessing(accessionNumber, failureReason ? 'failure' : 'success', failureReason);
    
    return summaryResult;
  } catch (error: any) {
    logger.error(`Error in getFilingSummary: ${error.message}`);
    
    // Calculate processing time
    const processingTimeMs = Date.now() - startTime;
    
    // Create an error result
    const errorResult: FilingSummaryResult = {
      ticker: '',
      companyName: '',
      filingType: 'UPLOAD' as FilingType, // Use a valid FilingType value instead of 'UNKNOWN'
      filingDate: new Date().toISOString().split('T')[0],
      accessionNumber: accessionNumber,
      summaryText: 'Failed to generate summary.',
      keyPoints: ['Error retrieving filing information.'],
      url: `https://www.sec.gov/Archives/edgar/data/${accessionNumber}`,
      processingStatus: 'failed',
      processingTimeMs: processingTimeMs,
      failureReason: error.message,
    };
    
    // Log the processing failure
    await logFilingProcessing(accessionNumber, 'failure', error.message);
    
    return errorResult;
  }
}
