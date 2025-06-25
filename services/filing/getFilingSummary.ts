import { FilingSummary } from '../../types/sec/filing';
import { FilingSummaryResult } from './types';
import { getFilingById } from './getFilingById';
import { parseForm } from '../../lib/parsers/form-parser';
import { getFormMetadata } from '../../lib/sec-edgar/form-registry';
import { logger } from '../../lib/logging';
import { extractKeyPoints, generateSimpleSummary } from './utils';

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
  try {
    logger.debug(`Getting filing summary for ${accessionNumber}`);
    
    // Get the filing data
    const { data: filingData } = await getFilingById(accessionNumber, cik);
    
    if (!filingData) {
      throw new Error(`No filing data found for ${accessionNumber}`);
    }
    
    // Parse the filing content
    const parsedContent = await parseForm(
      filingData.content,
      filingData.metadata.formType || 'UNKNOWN'
    );
    
    // Get the form metadata
    const formMetadata = getFormMetadata(filingData.metadata.formType);
    
    // Extract the ticker symbol from the metadata
    let ticker = '';
    if (filingData.metadata.tickers && filingData.metadata.tickers.length > 0) {
      ticker = filingData.metadata.tickers[0];
    }
    
    // If no ticker found in metadata, try to extract from parsed content
    if (!ticker && parsedContent.ticker) {
      ticker = parsedContent.ticker;
    }
    
    // Generate a simple summary if no AI summary is available
    const summaryText = generateSimpleSummary(
      parsedContent,
      filingData.metadata.formType,
      ticker,
      filingData.metadata.companyName || 'Unknown Company'
    );
    
    // Extract key points from the parsed content
    const keyPoints = extractKeyPoints(parsedContent, filingData.metadata.formType);
    
    // Create the summary result
    const summaryResult: FilingSummaryResult = {
      ticker: ticker,
      companyName: filingData.metadata.companyName || 'Unknown Company',
      filingType: filingData.metadata.formType,
      filingDate: filingData.metadata.filingDate || new Date().toISOString().split('T')[0],
      accessionNumber: accessionNumber,
      summaryText: summaryText,
      keyPoints: keyPoints,
      url: filingData.urls.html,
      filingUrl: filingData.urls.content,
      parsedContent: parsedContent,
      rawData: filingData,
      processingStatus: 'completed',
      processingTimeMs: 0,
    };
    
    return summaryResult;
  } catch (error: any) {
    logger.error(`Error in getFilingSummary: ${error.message}`);
    
    // Create an error result
    const errorResult: FilingSummaryResult = {
      ticker: '',
      companyName: '',
      filingType: 'UNKNOWN',
      filingDate: new Date().toISOString().split('T')[0],
      accessionNumber: accessionNumber,
      summaryText: 'Failed to generate summary.',
      keyPoints: ['Error retrieving filing information.'],
      url: `https://www.sec.gov/Archives/edgar/data/${accessionNumber}`,
      processingStatus: 'failed',
      failureReason: error.message,
    };
    
    return errorResult;
  }
}
