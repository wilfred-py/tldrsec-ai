import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { SECEdgarClient } from '@/lib/sec-edgar/client';
import { parseRssFeed, processFilingEntries } from '@/lib/sec-edgar/parsers';
import { FilingType, ParsedFiling } from '@/lib/sec-edgar/types';
import { JobQueueService, JobType } from '@/lib/job-queue';
import { LockService } from '@/lib/job-queue/lock-service';
import { v4 as uuidv4 } from 'uuid';

// Initialize Prisma client
const prisma = new PrismaClient();

// Initialize SEC EDGAR client with proper user agent
const secClient = new SECEdgarClient({
  userAgent: process.env.SEC_USER_AGENT || 'TLDRSEC-AI-App contact@example.com',
  maxRequestsPerSecond: 10
});

// Process ID for this instance
const processId = uuidv4();

/**
 * GET handler for SEC filing cron job
 * This endpoint is called by Vercel Cron to check for new filings
 */
export async function GET(request: Request) {
  // Extract filing type from query parameters if any
  const { searchParams } = new URL(request.url);
  const specificFilingType = searchParams.get('type') as FilingType | null;
  
  // Create a lock name that includes the filing type if specified
  const lockName = specificFilingType 
    ? `check-${specificFilingType.toLowerCase()}-filings`
    : 'check-all-filings';
    
  try {
    // Try to acquire a distributed lock to prevent concurrent execution
    const lock = await LockService.acquireLock(lockName, processId, 10); // 10 minutes TTL
    
    if (!lock) {
      console.log(`Job ${lockName} is already running, skipping`);
      return NextResponse.json({ 
        success: false, 
        message: 'Another filing check job is already running' 
      });
    }
    
    console.log(`Starting ${lockName} job with process ID ${processId}`);
    
    // Determine filing types to check
    let filingTypes: FilingType[];
    
    if (specificFilingType) {
      filingTypes = [specificFilingType];
    } else {
      filingTypes = ['10-K', '10-Q', '8-K', 'Form4'];
    }
    
    // Create a job for each filing type or process directly if a specific type was requested
    if (specificFilingType) {
      const result = await processFilingType(specificFilingType);
      
      // Release the lock after processing
      await LockService.releaseLock(lockName, processId);
      
      return NextResponse.json(result);
    } else {
      // Queue individual jobs for each filing type
      for (const filingType of filingTypes) {
        // Map filing type to job type
        const jobType = getJobTypeForFilingType(filingType);
        
        // Create a unique idempotency key for today to prevent duplicate job creation
        const today = new Date().toISOString().split('T')[0];
        const idempotencyKey = `${jobType}_${today}`;
        
        await JobQueueService.addJob({
          jobType,
          payload: { filingType },
          priority: getPriorityForFilingType(filingType),
          idempotencyKey,
          // Schedule 10-K/10-Q jobs less frequently (weekly)
          scheduledFor: calculateNextScheduleTime(filingType)
        });
      }
      
      // Release the lock after queueing
      await LockService.releaseLock(lockName, processId);
      
      return NextResponse.json({ 
        success: true, 
        message: `Queued filing check jobs for types: ${filingTypes.join(', ')}` 
      });
    }
  } catch (error) {
    console.error(`Error in ${lockName} job:`, error);
    
    // Attempt to release the lock in case of error
    try {
      await LockService.releaseLock(lockName, processId);
    } catch (lockError) {
      console.error('Failed to release lock:', lockError);
    }
    
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
 * Process filings for a specific filing type
 */
async function processFilingType(filingType: FilingType) {
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
    
    console.log(`Checking ${filingType} filings for ${tickerSymbols.size} tracked tickers`);
    
    // Early return if no tickers are being tracked
    if (tickerSymbols.size === 0) {
      return { 
        success: true, 
        message: 'No tickers being tracked', 
        processedCount: 0 
      };
    }
    
    // Fetch filings from SEC EDGAR
    const recentFilings = await fetchRecentFilings([filingType]);
    
    console.log(`Fetched ${recentFilings.length} recent ${filingType} filings`);
    
    // Filter filings for tracked tickers
    const relevantFilings = recentFilings.filter(filing => 
      tickerSymbols.has(filing.ticker)
    );
    
    console.log(`Found ${relevantFilings.length} relevant ${filingType} filings for tracked tickers`);
    
    // Process and store the relevant filings
    const processedCount = await processRelevantFilings(relevantFilings, trackedTickers);
    
    // Queue jobs for processing the newly added summaries
    await queueFilingProcessingJobs(filingType);
    
    return { 
      success: true, 
      filingType,
      totalFilings: recentFilings.length,
      relevantFilings: relevantFilings.length,
      processedCount 
    };
  } catch (error) {
    console.error(`Error processing ${filingType} filings:`, error);
    throw new Error(`Failed to process ${filingType} filings: ${(error as Error).message}`);
  }
}

/**
 * Queue processing jobs for newly added summaries
 */
async function queueFilingProcessingJobs(filingType: FilingType) {
  try {
    // Find summaries that need processing (empty summaryText)
    const summaries = await prisma.summary.findMany({
      where: {
        filingType,
        summaryText: '',
        sentToUser: false
      },
      include: {
        ticker: true
      }
    });
    
    console.log(`Queueing processing jobs for ${summaries.length} ${filingType} summaries`);
    
    // Queue a job for each summary
    for (const summary of summaries) {
      // Create idempotency key to prevent duplicate processing
      const idempotencyKey = `PROCESS_FILING_${summary.id}`;
      
      await JobQueueService.addJob({
        jobType: 'PROCESS_FILING',
        payload: {
          summaryId: summary.id,
          tickerId: summary.tickerId,
          ticker: summary.ticker.symbol,
          companyName: summary.ticker.companyName,
          filingType: summary.filingType,
          filingUrl: summary.filingUrl
        },
        priority: getPriorityForFilingType(filingType),
        idempotencyKey
      });
    }
    
    return summaries.length;
  } catch (error) {
    console.error('Error queueing filing processing jobs:', error);
    throw new Error(`Failed to queue filing processing jobs: ${(error as Error).message}`);
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

/**
 * Map filing type to job type
 */
function getJobTypeForFilingType(filingType: FilingType): JobType {
  switch (filingType) {
    case '10-K':
      return 'CHECK_10K_FILINGS';
    case '10-Q':
      return 'CHECK_10Q_FILINGS';
    case '8-K':
      return 'CHECK_8K_FILINGS';
    case 'Form4':
      return 'CHECK_FORM4_FILINGS';
    default:
      return 'CHECK_FILINGS';
  }
}

/**
 * Get priority level for filing type
 */
function getPriorityForFilingType(filingType: FilingType): number {
  switch (filingType) {
    case '8-K':  // Breaking news, highest priority
      return 10;
    case 'Form4': // Insider trading, high priority
      return 8;
    case '10-Q': // Quarterly reports, medium priority
      return 6;
    case '10-K': // Annual reports, lower priority (larger, less time-sensitive)
      return 5;
    default:
      return 5;
  }
}

/**
 * Calculate next schedule time based on filing type
 */
function calculateNextScheduleTime(filingType: FilingType): Date {
  const now = new Date();
  
  switch (filingType) {
    case '8-K':  // Check every hour
      return now;
    case 'Form4': // Check every 4 hours
      return new Date(now.getTime() + 4 * 60 * 60 * 1000);
    case '10-Q': // Check once a day
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case '10-K': // Check once a week
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return now;
  }
} 