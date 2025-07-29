import { NextRequest, NextResponse } from 'next/server';
import { 
  getActiveTickersForMonitoring, 
  checkTickerForNewFilings, 
  getUnprocessedFilings,
  markFilingAsProcessed,
  cleanupOldMonitoringData 
} from '../../../../lib/sec-edgar/ticker-monitoring';
import { enhancedFetch } from '../../../../lib/network/enhanced-fetch';
import { parseFormContentEnhanced } from '../../../../lib/parsers/enhanced-form-parser';
import { generateSummary } from '../../../../lib/ai/claude-client';
import { getPrismaClient } from '../../../../lib/db/prisma';
import { logger } from '../../../../lib/logging';
import { sendFilingSummaryEmail } from '../../../../lib/email/filing-summary';

const prisma = getPrismaClient();
const cronLogger = logger.child('cron-sec-monitoring');

// Rate limiting config
const BATCH_SIZE = 5; // Process max 5 filings per run
const MAX_CONCURRENT_RSS_CHECKS = 3; // Check max 3 tickers simultaneously
const PROCESSING_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes (Vercel limit is 10 minutes)

interface ProcessingStats {
  tickersChecked: number;
  newFilingsFound: number;
  filingsProcessed: number;
  emailsSent: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

/**
 * Main cron job handler for SEC filing monitoring
 * Runs every 30 minutes during market hours (Mon-Fri 6am-10pm EST)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const stats: ProcessingStats = {
    tickersChecked: 0,
    newFilingsFound: 0,
    filingsProcessed: 0,
    emailsSent: 0,
    errors: 0,
    startTime: new Date()
  };

  try {
    cronLogger.info('Starting SEC filing monitoring cron job');

    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      cronLogger.warn('Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Phase 1: Check for new filings via RSS
    await checkForNewFilings(stats);
    
    // Phase 2: Process unprocessed filings
    await processUnprocessedFilings(stats);
    
    // Phase 3: Cleanup old data
    await cleanupOldMonitoringData();
    
    stats.endTime = new Date();
    const duration = Date.now() - startTime;

    cronLogger.info('SEC filing monitoring completed successfully', {
      ...stats,
      durationMs: duration,
      avgTimePerTicker: stats.tickersChecked > 0 ? duration / stats.tickersChecked : 0
    });

    return NextResponse.json({
      success: true,
      stats,
      durationMs: duration
    });

  } catch (error) {
    stats.endTime = new Date();
    const duration = Date.now() - startTime;
    
    cronLogger.error('SEC filing monitoring failed', {
      error,
      stats,
      durationMs: duration
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stats,
      durationMs: duration
    }, { status: 500 });
  }
}

/**
 * Phase 1: Check active tickers for new filings via RSS
 */
async function checkForNewFilings(stats: ProcessingStats): Promise<void> {
  try {
    const activeTickers = await getActiveTickersForMonitoring();
    stats.tickersChecked = activeTickers.length;

    if (activeTickers.length === 0) {
      cronLogger.info('No active tickers to monitor');
      return;
    }

    cronLogger.info(`Checking ${activeTickers.length} active tickers for new filings`);

    // Process tickers in batches to avoid overwhelming SEC servers
    for (let i = 0; i < activeTickers.length; i += MAX_CONCURRENT_RSS_CHECKS) {
      const batch = activeTickers.slice(i, i + MAX_CONCURRENT_RSS_CHECKS);
      
      const batchPromises = batch.map(async (ticker) => {
        try {
          const newFilings = await checkTickerForNewFilings(ticker);
          stats.newFilingsFound += newFilings.length;
          
          cronLogger.debug(`Checked ${ticker.symbol}: ${newFilings.length} new filings`);
          
        } catch (error) {
          stats.errors++;
          cronLogger.error(`Failed to check ticker ${ticker.symbol}`, { error });
        }
      });

      await Promise.all(batchPromises);
      
      // Brief pause between batches to be respectful to SEC servers
      if (i + MAX_CONCURRENT_RSS_CHECKS < activeTickers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    cronLogger.info(`RSS check phase completed`, {
      tickersChecked: stats.tickersChecked,
      newFilingsFound: stats.newFilingsFound
    });

  } catch (error) {
    cronLogger.error('Failed to check for new filings', { error });
    throw error;
  }
}

/**
 * Phase 2: Process unprocessed filings (fetch, parse, summarize, email)
 */
async function processUnprocessedFilings(stats: ProcessingStats): Promise<void> {
  try {
    const unprocessedFilings = await getUnprocessedFilings(BATCH_SIZE);
    
    if (unprocessedFilings.length === 0) {
      cronLogger.info('No unprocessed filings to handle');
      return;
    }

    cronLogger.info(`Processing ${unprocessedFilings.length} unprocessed filings`);

    // Process filings sequentially to manage costs and avoid rate limits
    for (const filing of unprocessedFilings) {
      try {
        await processSingleFiling(filing, stats);
        stats.filingsProcessed++;
        
        // Brief pause between filings to manage rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        stats.errors++;
        cronLogger.error(`Failed to process filing ${filing.accessionNumber}`, {
          error,
          ticker: filing.ticker.symbol,
          filingType: filing.filingType
        });
        
        // Mark as processed even on error to avoid infinite retries
        try {
          await markFilingAsProcessed(filing.id);
        } catch (markError) {
          cronLogger.error('Failed to mark filing as processed after error', { markError });
        }
      }
    }

    cronLogger.info(`Filing processing phase completed`, {
      filingsProcessed: stats.filingsProcessed,
      emailsSent: stats.emailsSent
    });

  } catch (error) {
    cronLogger.error('Failed to process unprocessed filings', { error });
    throw error;
  }
}

/**
 * Process a single filing: fetch, parse, summarize, store, email
 */
async function processSingleFiling(filing: any, stats: ProcessingStats): Promise<void> {
  cronLogger.debug(`Processing filing ${filing.accessionNumber}`, {
    ticker: filing.ticker.symbol,
    filingType: filing.filingType,
    filingUrl: filing.filingUrl
  });

  // Step 1: Fetch filing content
  const content = await enhancedFetch(filing.filingUrl, {
    responseType: 'text',
    headers: {
      'User-Agent': 'tldrSEC-AI Cron Monitor (contact@tldrsec.com)',
    },
    operationName: 'sec-filing-cron-fetch'
  });

  // Step 2: Parse filing content
  const parsedContent = await parseFormContentEnhanced(content);

  // Step 3: Generate AI summary
  const summary = await generateSummary({
    filingType: filing.filingType as any,
    content: parsedContent.sections,
    metadata: {
      ...parsedContent.metadata,
      companyName: filing.ticker.companyName,
      ticker: filing.ticker.symbol,
      filingDate: filing.filingDate,
      accessionNumber: filing.accessionNumber
    }
  });

  // Step 4: Find or create ticker in database
  const dbTicker = await findOrCreateTicker(filing.ticker);

  // Step 5: Store summary in database
  const savedSummary = await prisma.summary.create({
    data: {
      tickerId: dbTicker.id,
      filingType: filing.filingType,
      filingDate: filing.filingDate,
      filingUrl: filing.filingUrl,
      summaryText: typeof summary.text === 'string' ? summary.text : JSON.stringify(summary.text),
      summaryJSON: typeof summary.text === 'object' ? summary.text : null,
      cost: summary.cost,
      tokensUsed: summary.inputTokens + summary.outputTokens,
      processingTimeMs: summary.duration,
      processingStatus: 'COMPLETED',
      processingCompletedAt: new Date(),
      model: 'claude-3-5-sonnet-20241022',
      sentToUser: false
    }
  });

  // Step 6: Send emails to all subscribers
  const subscribers = await prisma.user.findMany({
    where: {
      tickers: {
        some: {
          symbol: filing.ticker.symbol
        }
      }
    },
    select: {
      id: true,
      email: true,
      name: true
    }
  });

  for (const subscriber of subscribers) {
    try {
      await sendFilingSummaryEmail(
        subscriber.email,
        {
          companyName: filing.ticker.companyName,
          ticker: filing.ticker.symbol,
          filingType: filing.filingType,
          filingDate: filing.filingDate,
          summary: savedSummary.summaryText,
          filingUrl: filing.filingUrl
        }
      );
      
      stats.emailsSent++;
      
    } catch (emailError) {
      cronLogger.error('Failed to send email notification', {
        error: emailError,
        subscriberEmail: subscriber.email,
        ticker: filing.ticker.symbol
      });
    }
  }

  // Step 7: Mark filing as processed
  await markFilingAsProcessed(filing.id);

  cronLogger.info(`Successfully processed filing ${filing.accessionNumber}`, {
    ticker: filing.ticker.symbol,
    filingType: filing.filingType,
    summaryId: savedSummary.id,
    emailsSent: subscribers.length,
    cost: summary.cost
  });
}

/**
 * Find or create ticker in database for a test user
 */
async function findOrCreateTicker(tickerInfo: { symbol: string; companyName: string }): Promise<{ id: string }> {
  // Find or create a system user for cron jobs
  let systemUser = await prisma.user.findFirst({
    where: { email: 'system@tldrsec.com' }
  });

  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        email: 'system@tldrsec.com',
        name: 'System User',
        authProvider: 'system',
        authProviderId: 'system-cron',
        onboardingCompleted: true
      }
    });
  }

  // Find or create ticker
  const ticker = await prisma.ticker.upsert({
    where: {
      userId_symbol: {
        userId: systemUser.id,
        symbol: tickerInfo.symbol
      }
    },
    update: {
      companyName: tickerInfo.companyName
    },
    create: {
      symbol: tickerInfo.symbol,
      companyName: tickerInfo.companyName,
      userId: systemUser.id
    }
  });

  return { id: ticker.id };
}