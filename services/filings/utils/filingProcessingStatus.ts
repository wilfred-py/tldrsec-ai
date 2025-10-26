import { prisma } from '../../../lib/db/prisma';

/**
 * Checks if a specific filing has already been processed (has a Summary record)
 * 
 * This function determines if a filing should use cached results or generate fresh summaries.
 * A filing is considered "processed" if there's already a Summary record for the specific
 * accession number, ticker, and form type combination.
 * 
 * @param ticker The company ticker symbol (e.g., 'TSLA')
 * @param formType The SEC form type (e.g., '10-K', '10-Q', '8-K', '4')
 * @param accessionNumber The SEC filing accession number (e.g., '0001318605-25-000123')
 * @returns Promise<boolean> - true if filing has been processed (use cache), false if fresh (bypass cache)
 */
export async function checkIfFilingProcessed(
  ticker: string,
  formType: string,
  accessionNumber: string
): Promise<boolean> {
  try {
    console.log(`[DEBUG][FilingProcessingStatus] Checking processing status for ${ticker} - ${formType} - ${accessionNumber}`);
    
    // CRITICAL FIX: Check RssFilingCheck.processed field first
    // This prevents the race condition where Summary check fails but transaction check succeeds
    const rssFilingCheck = await prisma.rssFilingCheck.findFirst({
      where: {
        accessionNumber: accessionNumber,
        tickerMonitoring: {
          symbol: ticker.toUpperCase()
        },
        filingType: formType
      }
    });

    if (rssFilingCheck && rssFilingCheck.processed) {
      console.log(`[DEBUG][FilingProcessingStatus] ✅ Filing already processed for ${ticker} - ${formType} - ${accessionNumber} (RssFilingCheck marked as processed)`);
      return true;
    }
    
    // Find the ticker record for Summary check
    const tickerRecord = await prisma.ticker.findFirst({
      where: {
        symbol: ticker.toUpperCase()
      }
    });
    
    if (!tickerRecord) {
      console.log(`[DEBUG][FilingProcessingStatus] No ticker record found for ${ticker} - filing not processed`);
      return false;
    }
    
    // Check if there's already a Summary record for this specific filing
    const existingSummary = await prisma.summary.findFirst({
      where: {
        tickerId: tickerRecord.id,
        filingType: formType,
        // Check by accession number stored in the summary metadata or JSON
        OR: [
          // Check if accession number is stored in the summaryJSON metadata
          {
            summaryJSON: {
              path: ['accessionNumber'],
              equals: accessionNumber
            }
          },
          // Also check if there's a related SecFiling record with this accession number
          {
            secFiling: {
              accessionNumber: accessionNumber
            }
          }
        ]
      },
      include: {
        secFiling: true
      }
    });
    
    if (existingSummary) {
      console.log(`[DEBUG][FilingProcessingStatus] ✅ Filing already processed for ${ticker} - ${formType} - ${accessionNumber} (Summary ID: ${existingSummary.id})`);
      return true;
    }
    
    console.log(`[DEBUG][FilingProcessingStatus] 🆕 Filing not yet processed for ${ticker} - ${formType} - ${accessionNumber} - will generate fresh summary`);
    return false;
    
  } catch (error) {
    console.error(`[ERROR][FilingProcessingStatus] Error checking filing processing status: ${error instanceof Error ? error.message : String(error)}`);
    // On error, default to not bypassing cache (safer for cost control)
    // This means if we can't determine the status, we'll use cached data if available
    return true;
  }
}

/**
 * Alternative method to check if filing is processed by looking at recent summaries
 * This is a fallback in case the accession number matching fails
 * 
 * @param ticker The company ticker symbol
 * @param formType The SEC form type
 * @param filingDate The filing date to check against
 * @returns Promise<boolean> - true if recent summary exists for this form type
 */
export async function checkIfRecentFilingProcessed(
  ticker: string,
  formType: string,
  filingDate: string
): Promise<boolean> {
  try {
    const tickerRecord = await prisma.ticker.findFirst({
      where: {
        symbol: ticker.toUpperCase()
      }
    });
    
    if (!tickerRecord) {
      return false;
    }
    
    // Check if there's a summary for this form type created after the filing date
    const filingDateObj = new Date(filingDate);
    const recentSummary = await prisma.summary.findFirst({
      where: {
        tickerId: tickerRecord.id,
        filingType: formType,
        filingDate: {
          gte: filingDateObj
        }
      },
      orderBy: {
        filingDate: 'desc'
      }
    });
    
    if (recentSummary) {
      console.log(`[DEBUG][FilingProcessingStatus] ✅ Recent filing processed for ${ticker} - ${formType} after ${filingDate}`);
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error(`[ERROR][FilingProcessingStatus] Error checking recent filing processing: ${error instanceof Error ? error.message : String(error)}`);
    return true; // Default to using cache on error
  }
}