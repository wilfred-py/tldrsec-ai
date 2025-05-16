import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { SECEdgarClient } from '@/lib/sec-edgar/client';
import { parseRssFeed, processFilingEntries } from '@/lib/sec-edgar/parsers';
import { FilingType, ParsedFiling } from '@/lib/sec-edgar/types';

// Initialize Prisma client
const prisma = new PrismaClient();

// Initialize SEC EDGAR client with proper user agent
const secClient = new SECEdgarClient({
  userAgent: process.env.SEC_USER_AGENT || 'TLDRSEC-AI-App contact@example.com',
  maxRequestsPerSecond: 10
});

/**
 * GET handler for SEC filing cron job
 * This endpoint is called by Vercel Cron to check for new filings
 */
export async function GET() {
  try {
    // Fetch all unique tickers being tracked by users
    const trackedTickers = await prisma.ticker.findMany({
      select: { 
        id: true,
        symbol: true,
        userId: true
      }
    });
    
    // Create a set of unique ticker symbols for faster lookups
    const tickerSymbols = new Set(trackedTickers.map((t: { symbol: string }) => t.symbol));
    
    console.log(`Checking filings for ${tickerSymbols.size} tracked tickers`);
    
    // Early return if no tickers are being tracked
    if (tickerSymbols.size === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No tickers being tracked', 
        processedCount: 0 
      });
    }
    
    // Fetch filings from SEC EDGAR
    const filingTypes: FilingType[] = ['10-K', '10-Q', '8-K', 'Form4'];
    const recentFilings = await fetchRecentFilings(filingTypes);
    
    console.log(`Fetched ${recentFilings.length} recent filings`);
    
    // Filter filings for tracked tickers
    const relevantFilings = recentFilings.filter(filing => 
      tickerSymbols.has(filing.ticker)
    );
    
    console.log(`Found ${relevantFilings.length} relevant filings for tracked tickers`);
    
    // Process and store the relevant filings
    const processedCount = await processRelevantFilings(relevantFilings, trackedTickers);
    
    return NextResponse.json({ 
      success: true, 
      totalFilings: recentFilings.length,
      relevantFilings: relevantFilings.length,
      processedCount 
    });
    
  } catch (error) {
    console.error('Error checking SEC filings:', error);
    
    // Return a formatted error response
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to check SEC filings',
      message: (error as Error).message
    }, { 
      status: 500 
    });
  }
}

/**
 * Fetch recent filings from SEC EDGAR
 */
async function fetchRecentFilings(filingTypes: FilingType[]): Promise<ParsedFiling[]> {
  try {
    // Fetch recent filings feed
    const response = await secClient.getRecentFilings({
      count: 100, // Limit to 100 most recent filings
      formType: filingTypes
    });
    
    // Parse the RSS feed
    const feedData = parseRssFeed(response as unknown as string);
    
    // Process the filing entries
    return processFilingEntries(feedData.entries);
    
  } catch (error) {
    console.error('Error fetching recent filings:', error);
    throw new Error(`Failed to fetch recent filings: ${(error as Error).message}`);
  }
}

/**
 * Process and store relevant filings in the database
 */
async function processRelevantFilings(
  filings: ParsedFiling[], 
  trackedTickers: { id: string; symbol: string; userId: string }[]
): Promise<number> {
  let processedCount = 0;
  
  try {
    // For each filing, find matching user tickers and create summaries
    for (const filing of filings) {
      // Find all ticker entries matching this symbol
      const matchingTickers = trackedTickers.filter(t => t.symbol === filing.ticker);
      
      // Skip if no matching tickers found (shouldn't happen due to filtering)
      if (matchingTickers.length === 0) continue;
      
      // Check if this filing already exists for any of the matching tickers
      const existingFiling = await prisma.summary.findFirst({
        where: {
          ticker: {
            symbol: filing.ticker
          },
          filingType: filing.filingType,
          filingDate: filing.filingDate
        }
      });
      
      // Skip if filing already exists
      if (existingFiling) {
        console.log(`Filing ${filing.id} already exists, skipping`);
        continue;
      }
      
      // Create a summary record for each matching ticker
      for (const ticker of matchingTickers) {
        await prisma.summary.create({
          data: {
            tickerId: ticker.id,
            filingType: filing.filingType,
            filingDate: filing.filingDate,
            filingUrl: filing.filingUrl,
            summaryText: '', // Will be populated by AI processing in a future task
            summaryJSON: null, // Will be populated by AI processing in a future task
            sentToUser: false
          }
        });
        
        processedCount++;
      }
    }
    
    return processedCount;
  } catch (error) {
    console.error('Error processing filings:', error);
    throw new Error(`Failed to process filings: ${(error as Error).message}`);
  }
} 