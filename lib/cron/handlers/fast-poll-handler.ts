/**
 * Fast-Poll Discovery Handler
 *
 * Replaces RSS-based discovery with the SEC EDGAR Submissions API for
 * near-real-time filing detection. Polls data.sec.gov/submissions/
 * per-CIK with sub-second update latency (vs 10-minute RSS lag).
 *
 * Data flow:
 *   CF Worker (every-1-min cron) -> GET /api/cron?action=fast-poll
 *     → shouldPollNow() adaptive gate
 *     → distributed lock (prevent concurrent polls)
 *     → poll Submissions API per tracked CIK
 *     → filter new filings via acceptanceDateTime watermark
 *     → queue ASYNC_FETCH_FILING jobs with composite priority
 *     → update watermarks + lastPollTime
 *
 * Designed to run within Vercel Hobby 60s timeout:
 *   13 tickers × ~100ms each = ~1.3s for discovery
 *   + DB queries for users/jobs = ~2-3s
 *   Total: <10s typical execution
 */

import { logger } from '../../logging';
import { shouldPollNow } from '../edgar-schedule';
import { getCompositePriority } from '../tier-priority';
import { enrichTickersWithCik, type EnrichedTicker, type UserForFiling } from './discovery-handler';
import { SECEdgarError, SECErrorCode } from '../../sec-edgar/types';

const fastPollLogger = logger.child('fast-poll-handler');

// Maximum unique CIKs to poll via Submissions API per cycle.
// At 10 req/s, 200 CIKs = 20s. Beyond this, overflow falls back to Atom feed.
const MAX_PER_CIK_POLLING = parseInt(process.env.MAX_PER_CIK_POLLING || '200', 10);

export interface FastPollResult {
  status: 'completed' | 'skipped';
  reason?: string;
  filingsDetected: number;
  fetchJobsQueued: number;
  tickersPolled: number;
  tickersSkipped: number;
  cacheHits: number;
  durationMs: number;
  latencyMetrics?: {
    /** Oldest detection latency among new filings (ms from EDGAR acceptance to detection) */
    maxDetectionLatencyMs: number;
    /** Newest detection latency among new filings */
    minDetectionLatencyMs: number;
  };
}

/**
 * Handle a fast-poll discovery cycle.
 *
 * Called by the cron route's `fast-poll` action handler.
 * Uses adaptive polling intervals to skip unnecessary cycles.
 */
export async function handleFastPoll(): Promise<FastPollResult> {
  const startTime = Date.now();

  const { getPrismaClient } = await import('../../db/prisma');
  const prisma = getPrismaClient();

  // ── Step 1: Adaptive interval gate ──────────────────────────────
  // Read last poll time from TickerMonitoring (use any record's lastPollTime)
  const lastPollRecord = await prisma.tickerMonitoring.findFirst({
    where: { isActive: true, lastPollTime: { not: null } },
    select: { lastPollTime: true },
    orderBy: { lastPollTime: 'desc' },
  });

  if (!shouldPollNow(lastPollRecord?.lastPollTime ?? null)) {
    return {
      status: 'skipped',
      reason: 'adaptive-interval',
      filingsDetected: 0,
      fetchJobsQueued: 0,
      tickersPolled: 0,
      tickersSkipped: 0,
      cacheHits: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // ── Step 2: Distributed lock ────────────────────────────────────
  const { LockService } = await import('../../job-queue/lock-service');
  const lockName = `fast-poll-execution-${process.env.NODE_ENV || 'development'}`;
  const lockId = `fast-poll-${Date.now()}`;
  let lock: boolean;

  try {
    lock = await LockService.acquireLock(lockName, lockId, 1); // 1-minute TTL
  } catch {
    lock = false;
  }

  if (!lock) {
    fastPollLogger.info('Fast-poll skipped: concurrent execution detected');
    return {
      status: 'skipped',
      reason: 'lock-contention',
      filingsDetected: 0,
      fetchJobsQueued: 0,
      tickersPolled: 0,
      tickersSkipped: 0,
      cacheHits: 0,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // ── Step 3: Get active tickers with CIK mappings ────────────────
    const { getActiveTickersForMonitoring } = await import('../../sec-edgar/ticker-monitoring');
    const activeTickers = await getActiveTickersForMonitoring();

    const uniqueSymbols = [...new Set(activeTickers.map(t => t.symbol))];
    const tickersWithCik = await enrichTickersWithCik(uniqueSymbols);

    // Filter to tickers that have CIK mappings (required for Submissions API)
    const pollableTickers = tickersWithCik.filter(t => t.cik !== null);
    const tickersSkipped = tickersWithCik.length - pollableTickers.length;

    if (tickersSkipped > 0) {
      fastPollLogger.warn(`${tickersSkipped} tickers skipped (no CIK mapping)`, {
        skipped: tickersWithCik.filter(t => !t.cik).map(t => t.symbol),
      });
    }

    // Cap at MAX_PER_CIK_POLLING
    const tickersToProcess = pollableTickers.slice(0, MAX_PER_CIK_POLLING);
    if (pollableTickers.length > MAX_PER_CIK_POLLING) {
      fastPollLogger.warn(`CIK cap reached: polling ${MAX_PER_CIK_POLLING} of ${pollableTickers.length} tickers`);
    }

    // ── Step 4: Poll Submissions API for each ticker ──────────────
    const { SECEdgarClient } = await import('../../sec-edgar/client');
    const client = new SECEdgarClient();

    // Load existing watermarks and ETags
    const monitoringRecords = await prisma.tickerMonitoring.findMany({
      where: { cik: { in: tickersToProcess.map(t => t.cik!) } },
      select: {
        id: true,
        cik: true,
        symbol: true,
        lastSeenAcceptanceDateTime: true,
        lastEtag: true,
        lastAccessionSeen: true,
      },
    });
    const monitoringMap = new Map(monitoringRecords.map(r => [r.cik, r]));

    interface DetectedFiling {
      ticker: EnrichedTicker;
      accessionNumber: string;
      form: string;
      filingDate: string;
      primaryDocument: string;
      acceptanceDateTime: Date;
    }

    const allDetectedFilings: DetectedFiling[] = [];
    let cacheHits = 0;
    let tickersPolled = 0;

    for (const ticker of tickersToProcess) {
      const monitoring = monitoringMap.get(ticker.cik!);
      let watermark = monitoring?.lastSeenAcceptanceDateTime ?? null;

      // ── Cold start seeding (Phase 7) ──────────────────────────
      if (!watermark) {
        watermark = await seedWatermark(prisma, ticker);
      }

      try {
        const result = await client.fetchSubmissions(
          ticker.cik!,
          watermark,
          monitoring?.lastEtag ?? null
        );
        tickersPolled++;

        if (result.notModified) {
          cacheHits++;
          continue;
        }

        for (const filing of result.newFilings) {
          allDetectedFilings.push({
            ticker,
            accessionNumber: filing.accessionNumber,
            form: filing.form,
            filingDate: filing.filingDate,
            primaryDocument: filing.primaryDocument,
            acceptanceDateTime: filing.acceptanceDateTime,
          });
        }

        // Update ETag and watermark for this ticker (upsert to handle new tickers)
        if (monitoring) {
          await prisma.tickerMonitoring.update({
            where: { id: monitoring.id },
            data: {
              lastEtag: result.etag,
              lastSeenAcceptanceDateTime: result.latestAcceptanceDateTime ?? monitoring.lastSeenAcceptanceDateTime,
              lastPollTime: new Date(),
              lastChecked: new Date(),
            },
          });
        } else {
          // Create monitoring record for new tickers so watermarks persist
          await prisma.tickerMonitoring.upsert({
            where: { cik: ticker.cik! },
            update: {
              lastEtag: result.etag,
              lastSeenAcceptanceDateTime: result.latestAcceptanceDateTime,
              lastPollTime: new Date(),
              lastChecked: new Date(),
            },
            create: {
              cik: ticker.cik!,
              symbol: ticker.symbol,
              companyName: ticker.companyName || ticker.symbol,
              rssUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker.cik}&type=&dateb=&owner=include&count=40&search_text=&action=getcompany&output=atom`,
              lastEtag: result.etag,
              lastSeenAcceptanceDateTime: result.latestAcceptanceDateTime,
              lastPollTime: new Date(),
              lastChecked: new Date(),
            },
          });
        }
      } catch (error) {
        // Break the loop on SEC rate limiting to avoid hammering the API
        if (error instanceof SECEdgarError && error.code === SECErrorCode.RATE_LIMIT_EXCEEDED) {
          fastPollLogger.error(`SEC rate limit hit at CIK ${ticker.cik} (${ticker.symbol}), stopping poll cycle`, {
            tickersPolled,
            tickersRemaining: tickersToProcess.length - tickersToProcess.indexOf(ticker) - 1,
          });
          break;
        }
        fastPollLogger.error(`Failed to poll CIK ${ticker.cik} (${ticker.symbol})`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next ticker — don't let one failure block others
      }
    }

    // Update lastPollTime for tickers that weren't individually updated (cache hits)
    if (cacheHits > 0) {
      const cacheHitCiks = tickersToProcess
        .filter(t => {
          const m = monitoringMap.get(t.cik!);
          return m && !allDetectedFilings.some(f => f.ticker.cik === t.cik);
        })
        .map(t => t.cik!);

      if (cacheHitCiks.length > 0) {
        await prisma.tickerMonitoring.updateMany({
          where: { cik: { in: cacheHitCiks } },
          data: { lastPollTime: new Date() },
        });
      }
    }

    if (allDetectedFilings.length === 0) {
      fastPollLogger.info('No new filings detected', {
        tickersPolled,
        cacheHits,
        durationMs: Date.now() - startTime,
      });

      return {
        status: 'completed',
        filingsDetected: 0,
        fetchJobsQueued: 0,
        tickersPolled,
        tickersSkipped,
        cacheHits,
        durationMs: Date.now() - startTime,
      };
    }

    // ── Step 5: Get users for detected tickers ────────────────────
    const detectedSymbols = [...new Set(allDetectedFilings.map(f => f.ticker.symbol))];

    const usersForTickers = await prisma.user.findMany({
      where: {
        tickers: { some: { symbol: { in: detectedSymbols } } },
      },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        isTrialing: true,
        trialEndsAt: true,
        tickers: {
          where: { symbol: { in: detectedSymbols } },
          select: { id: true, symbol: true, companyName: true },
        },
      },
    });

    // Build user map: symbol → users
    const usersBySymbol = new Map<string, UserForFiling[]>();
    for (const user of usersForTickers) {
      for (const ticker of user.tickers) {
        const existing = usersBySymbol.get(ticker.symbol) || [];
        existing.push({
          id: user.id,
          email: user.email || '',
          subscriptionTier: user.subscriptionTier,
          isTrialing: user.isTrialing,
          trialEndsAt: user.trialEndsAt,
          tickers: [{ id: ticker.id, companyName: ticker.companyName }],
        });
        usersBySymbol.set(ticker.symbol, existing);
      }
    }

    // ── Step 6: Queue ASYNC_FETCH_FILING jobs ─────────────────────
    const now = new Date();
    const executionId = `fast-poll-${now.toISOString()}`;
    let fetchJobsQueued = 0;

    // Build all job records, sorted by composite priority (highest first)
    const jobRecords: Array<{
      jobType: string;
      status: 'PENDING';
      priority: number;
      maxRetries: number;
      retryCount: number;
      scheduledFor: Date;
      idempotencyKey: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const filing of allDetectedFilings) {
      const users = usersBySymbol.get(filing.ticker.symbol) || [];
      if (users.length === 0) continue;

      // Build the filing URL from accession number
      const accessionNoDashes = filing.accessionNumber.replace(/-/g, '');
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${filing.ticker.cik}/${accessionNoDashes}/${filing.primaryDocument}`;

      for (const user of users) {
        const priority = getCompositePriority(
          user.subscriptionTier,
          filing.form,
          user.isTrialing,
          user.trialEndsAt
        );

        jobRecords.push({
          jobType: 'ASYNC_FETCH_FILING',
          status: 'PENDING',
          priority,
          maxRetries: 3,
          retryCount: 0,
          scheduledFor: now,
          idempotencyKey: `ASYNC_FETCH_FILING:${user.id}:${filing.accessionNumber}`,
          payload: {
            userId: user.id,
            userEmail: user.email,
            userTier: user.subscriptionTier || 'FREE',
            ticker: {
              id: user.tickers[0]?.id,
              symbol: filing.ticker.symbol,
              companyName: filing.ticker.companyName,
              cik: filing.ticker.cik,
            },
            filing: {
              formType: filing.form,
              filingDate: filing.filingDate,
              filingUrl,
              accessionNumber: filing.accessionNumber,
            },
            executionContext: {
              executionId,
              cronTriggerTime: now.toISOString(),
              sourceContext: 'fast-poll',
              edgarAcceptedAt: filing.acceptanceDateTime.toISOString(),
            },
          },
        });
      }
    }

    // Sort by priority descending (highest priority first)
    jobRecords.sort((a, b) => b.priority - a.priority);

    // Bulk insert with dedup
    if (jobRecords.length > 0) {
      const result = await prisma.jobQueue.createMany({
        data: jobRecords,
        skipDuplicates: true,
      });
      fetchJobsQueued = result.count;
    }

    // ── Latency metrics ───────────────────────────────────────────
    const detectionTime = new Date();
    const latencies = allDetectedFilings.map(
      f => detectionTime.getTime() - f.acceptanceDateTime.getTime()
    );

    fastPollLogger.info('Fast-poll completed', {
      filingsDetected: allDetectedFilings.length,
      fetchJobsQueued,
      tickersPolled,
      cacheHits,
      durationMs: Date.now() - startTime,
      filings: allDetectedFilings.map(f => ({
        ticker: f.ticker.symbol,
        form: f.form,
        accession: f.accessionNumber,
        detectionLatencyMs: detectionTime.getTime() - f.acceptanceDateTime.getTime(),
      })),
    });

    return {
      status: 'completed',
      filingsDetected: allDetectedFilings.length,
      fetchJobsQueued,
      tickersPolled,
      tickersSkipped,
      cacheHits,
      durationMs: Date.now() - startTime,
      latencyMetrics: latencies.length > 0 ? {
        maxDetectionLatencyMs: Math.max(...latencies),
        minDetectionLatencyMs: Math.min(...latencies),
      } : undefined,
    };
  } finally {
    // Always release the lock
    try {
      await LockService.releaseLock(lockName, lockId);
    } catch {
      // Lock release failure is non-critical — TTL will expire
    }
  }
}

// ── Watermark Cold Start Seeding (Phase 7) ───────────────────────────

/**
 * Seed the watermark for a ticker on first run.
 *
 * Prevents re-detecting hundreds of old filings by looking up the most
 * recent Summary for this ticker's CIK and using its createdAt as an
 * approximate watermark. If no Summary exists, seeds as "now" to skip
 * all historical filings.
 *
 * @returns A watermark string suitable for acceptanceDateTime comparison,
 *          or null if seeding isn't needed
 */
async function seedWatermark(
  prisma: ReturnType<typeof import('../../db/prisma').getPrismaClient>,
  ticker: EnrichedTicker
): Promise<string | null> {
  // Find the most recent summary for any ticker with this symbol
  const latestSummary = await prisma.summary.findFirst({
    where: {
      ticker: { symbol: ticker.symbol },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (latestSummary) {
    // Use the summary's creation time as approximate watermark
    // Format as compact YYYYMMDDHHMMSS for consistency
    const d = latestSummary.createdAt;
    const watermark = [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, '0'),
      String(d.getUTCDate()).padStart(2, '0'),
      String(d.getUTCHours()).padStart(2, '0'),
      String(d.getUTCMinutes()).padStart(2, '0'),
      String(d.getUTCSeconds()).padStart(2, '0'),
    ].join('');

    fastPollLogger.info(`Seeded watermark for ${ticker.symbol} from existing summary`, {
      watermark,
      summaryCreatedAt: latestSummary.createdAt.toISOString(),
    });
    return watermark;
  }

  // No existing summary — seed as now (skip all historical filings)
  const now = new Date();
  const watermark = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');

  fastPollLogger.info(`Seeded watermark for ${ticker.symbol} as now (no existing summaries)`, {
    watermark,
  });
  return watermark;
}
