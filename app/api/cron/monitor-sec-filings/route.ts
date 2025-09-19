import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createErrorResponse } from '../../../../lib/error-handling/standardized-responses';

// Dynamic imports will be used within functions to avoid build-time dependencies

// Rate limiting config
const BATCH_SIZE = 5; // Process max 5 filings per run
const MAX_CONCURRENT_RSS_CHECKS = 3; // Check max 3 tickers simultaneously

// Secure authentication function to prevent timing attacks
function verifyAuthHeader(authHeader: string | null, secret: string | undefined): boolean {
  if (!authHeader || !secret) return false;
  
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  
  return timingSafeEqual(
    Buffer.from(authHeader, 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}
// const PROCESSING_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes (Railway/Vercel timeout) - Reserved for future use

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
  let monitor: InstanceType<typeof CronJobMonitor>;
  let cronLogger: ReturnType<typeof import('../../../../lib/logging').logger.child>;
  
  try {
    // Dynamic imports for build-time safety with error handling
    const [
      { CronJobMonitor },
      { logger }
    ] = await Promise.all([
      import('../../../../lib/monitoring/cron-monitor'),
      import('../../../../lib/logging')
    ]);
    
    // Initialize monitoring for Vercel platform
    const platform = 'VERCEL_CRON';
    monitor = new CronJobMonitor('sec-filing-monitor', platform);
    cronLogger = logger.child('cron-sec-monitoring');
  } catch (importError) {
    console.error('Failed to load required modules:', importError);
    return NextResponse.json({ 
      error: 'Service initialization failed',
      details: importError instanceof Error ? importError.message : 'Unknown import error'
    }, { status: 503 });
  }
  
  try {
    cronLogger.info('Starting SEC filing monitoring cron job');

    // Verify this is a legitimate cron request using timing-safe comparison
    const authHeader = request.headers.get('authorization');
    if (!verifyAuthHeader(authHeader, process.env.CRON_SECRET)) {
      cronLogger.warn('Unauthorized cron request', { 
        authHeaderPresent: !!authHeader,
        secretConfigured: !!process.env.CRON_SECRET 
      });
      await monitor.complete('FAILED', 'Unauthorized access attempt');
      return createErrorResponse('UNAUTHORIZED', 401);
    }

    // Phase 1: Check for new filings via RSS
    await checkForNewFilings(cronLogger);
    
    // Phase 2: Process unprocessed filings
    await processUnprocessedFilings(cronLogger);
    
    // Phase 3: Cleanup old data
    const { cleanupOldMonitoringData } = await import('../../../../lib/sec-edgar/ticker-monitoring');
    await cleanupOldMonitoringData();

    // Complete monitoring
    const result = await monitor.complete('SUCCESS');
    
    cronLogger.info('SEC filing monitoring completed successfully', result);

    return NextResponse.json({
      success: true,
      executionId: result.executionId,
      duration: result.duration,
      metrics: result.metrics
    });

  } catch (error) {
    const errorResult = await monitor.complete('FAILED', error instanceof Error ? error.message : 'Unknown error');
    
    cronLogger.error('SEC filing monitoring failed', {
      error,
      executionId: errorResult.executionId,
      duration: errorResult.duration
    });

    return createErrorResponse('SERVICE_INITIALIZING', 503, {
      executionId: errorResult.executionId,
      duration: errorResult.duration
    });
  }
}

/**
 * Phase 1: Check active tickers for new filings via RSS
 */
async function checkForNewFilings(cronLogger: ReturnType<typeof import('../../../../lib/logging').logger.child>): Promise<void> {
  // Dynamic imports for build-time safety
  const { 
    getActiveTickersForMonitoring, 
    checkTickerForNewFilings 
  } = await import('../../../../lib/sec-edgar/ticker-monitoring');
  const stats: ProcessingStats = {
    tickersChecked: 0,
    newFilingsFound: 0,
    filingsProcessed: 0,
    emailsSent: 0,
    errors: 0,
    startTime: new Date()
  };
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
async function processUnprocessedFilings(cronLogger: ReturnType<typeof import('../../../../lib/logging').logger.child>): Promise<void> {
  // Dynamic imports for build-time safety
  const { 
    getUnprocessedFilings,
    markFilingAsProcessed 
  } = await import('../../../../lib/sec-edgar/ticker-monitoring');
  const stats: ProcessingStats = {
    tickersChecked: 0,
    newFilingsFound: 0,
    filingsProcessed: 0,
    emailsSent: 0,
    errors: 0,
    startTime: new Date()
  };
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
        await processSingleFiling(filing, stats, cronLogger);
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
async function processSingleFiling(filing: {
  id: string;
  accessionNumber: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  ticker: {
    symbol: string;
    companyName: string;
  };
}, stats: ProcessingStats, cronLogger: ReturnType<typeof import('../../../../lib/logging').logger.child>): Promise<void> {
  // Batch dynamic imports for build-time safety and performance
  const [
    { enhancedFetch },
    { parseFormContentEnhanced },
    { getPrismaClient },
    { sendFilingSummaryEmail },
    { getClaudeModel },
    { generateAISummaryWithRetry },
    { markFilingAsProcessed }
  ] = await Promise.all([
    import('../../../../lib/network/enhanced-fetch'),
    import('../../../../lib/parsers/enhanced-form-parser'),
    import('../../../../lib/db/prisma'),
    import('../../../../lib/email/summary-service'),
    import('../../../../lib/ai'),
    import('../../../../services/filing/summaryGenerationService'),
    import('../../../../lib/sec-edgar/ticker-monitoring')
  ]);
  
  const prisma = getPrismaClient();
  cronLogger.debug(`Processing filing ${filing.accessionNumber}`, {
    ticker: filing.ticker.symbol,
    filingType: filing.filingType,
    filingUrl: filing.filingUrl
  });

  // Step 1: Fetch filing content
  const content = await enhancedFetch(filing.filingUrl, {
    responseType: 'text',
    headers: {
      'User-Agent': 'tldrsec.app contact@tldrsec.app',
    },
    operationName: 'sec-filing-cron-fetch'
  });

  // Step 2: Parse filing content
  const parsedContent = await parseFormContentEnhanced(content, filing.filingType as string, filing.filingUrl);

  // Step 3: Generate AI summary
  const summaryResult = await generateAISummaryWithRetry(
    typeof parsedContent.sections === 'string' ? parsedContent.sections : JSON.stringify(parsedContent.sections),
    {
      formType: filing.filingType,
      filingDate: filing.filingDate.toISOString(),
      accessionNumber: filing.accessionNumber
    },
    {
      name: filing.ticker.companyName,
      ticker: filing.ticker.symbol
    }
  );

  const summary = {
    text: summaryResult.summary,
    cost: summaryResult.cost || 0
  };

  // Step 4: Find or create ticker in database
  const dbTicker = await findOrCreateTicker(filing.ticker, prisma);

  // Step 5: Store summary in database
  const savedSummary = await prisma.summary.create({
    data: {
      tickerId: dbTicker.id,
      filingType: filing.filingType,
      filingDate: filing.filingDate,
      filingUrl: filing.filingUrl,
      summaryText: typeof summary.text === 'string' ? summary.text : JSON.stringify(summary.text),
      summaryJSON: typeof summary.text === 'object' ? summary.text : undefined,
      cost: summary.cost || 0,
      tokensUsed: 0, // Token usage is not available in current generateSummary interface
      processingTimeMs: 0, // Duration is not available in current generateSummary interface  
      processingStatus: 'COMPLETED',
      processingCompletedAt: new Date(),
      model: getClaudeModel(),
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
async function findOrCreateTicker(tickerInfo: { symbol: string; companyName: string }, prisma: ReturnType<typeof import('../../../../lib/db/prisma').getPrismaClient>): Promise<{ id: string }> {
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