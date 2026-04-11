/**
 * Orphaned Filing Detector
 *
 * Detects and recovers RSS filing checks that have processed=false but no corresponding
 * JobQueue entries. This can happen when:
 * - Discovery creates a filing check but pipeline stalls before creating a job
 * - A job was deleted or failed without being recreated
 * - Database inconsistency between RssFilingCheck and JobQueue tables
 *
 * IMPORTANT: Uses RssFilingCheck table (which has the `processed` field), NOT SecFiling.
 * The SecFiling table does not have a `processed` field.
 *
 * Features:
 * - Detects orphaned filing checks older than configurable threshold
 * - Creates ASYNC_FETCH_FILING jobs to recover orphaned filings (re-enters at Phase 2)
 * - Rate-limited alerting to prevent duplicate notifications
 * - Configurable via environment variables
 *
 * Environment Variables:
 * - ORPHAN_AGE_THRESHOLD_MINUTES: How old a filing must be to be considered orphaned (default: 10)
 * - ORPHAN_RECOVERY_LIMIT: Maximum filings to recover per cycle (default: 50)
 * - ORPHAN_ALERT_COOLDOWN_MINUTES: Cooldown between alerts (default: 30)
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 3
 */

import { getPrismaClient } from '@/lib/db/prisma';

// In-memory cache for last alert time (rate limiting)
let lastAlertTime: Date | null = null;

/**
 * Represents an orphaned filing that needs recovery
 */
export interface OrphanedFiling {
  id: string;
  accessionNumber: string;
  formType: string;
  tickerId: string;
  createdAt: Date;
}

/**
 * Options for detecting orphaned filings
 */
interface DetectOptions {
  /** How old a filing must be to be considered orphaned (default: 10 minutes) */
  ageThresholdMinutes?: number;
  /** Maximum filings to check (default: 100) */
  limit?: number;
  /** Mock unprocessed filings for testing */
  mockUnprocessedFilings?: Array<{
    id: string;
    accessionNumber: string;
    formType?: string;
    tickerId?: string;
    createdAt?: Date;
  }>;
  /** Mock jobs for testing */
  mockJobsForFilings?: Array<{ payload: { filingId?: string } }>;
}

/**
 * Options for recovering orphaned filings
 */
interface RecoverOptions {
  /** Mock orphaned filings for testing */
  mockOrphanedFilings?: OrphanedFiling[];
  /** If true, don't actually create jobs */
  dryRun?: boolean;
}

/**
 * Options for checkAndRecover
 */
interface CheckAndRecoverOptions {
  /** Options to pass to detectOrphanedFilings */
  detectOptions?: DetectOptions;
  /** If true, don't actually create jobs */
  dryRun?: boolean;
}

/**
 * Result of checking and recovering orphaned filings
 */
interface CheckAndRecoverResult {
  recovered: number;
  filings: OrphanedFiling[];
  rateLimited?: boolean;
}

/**
 * Job data structure for creating recovery jobs
 * Uses ASYNC_FETCH_FILING (Phase 2) because orphaned filings never went through
 * the fetch phase, so there is no FilingContentCache entry. The fetch handler
 * will populate the cache and queue the summarize job itself.
 */
interface RecoveryJobData {
  jobType: string;
  status: string;
  priority: number;
  maxRetries: number;
  retryCount: number;
  scheduledFor: Date;
  idempotencyKey: string;
  payload: {
    userId: string;
    userEmail: string;
    userTier: string;
    ticker: {
      id: string;
      symbol: string;
      companyName?: string;
      cik?: string;
    };
    filing: {
      filingId: string;
      formType: string;
      filingDate: string;
      filingUrl: string;
      accessionNumber: string;
    };
    executionContext: {
      executionId: string;
      cronTriggerTime: string;
      sourceContext: string;
    };
  };
}

/**
 * Get configured values from environment or use defaults
 */
function getConfig() {
  return {
    ageThresholdMinutes: parseInt(process.env.ORPHAN_AGE_THRESHOLD_MINUTES || '10', 10),
    recoveryLimit: parseInt(process.env.ORPHAN_RECOVERY_LIMIT || '50', 10),
    alertCooldownMinutes: parseInt(process.env.ORPHAN_ALERT_COOLDOWN_MINUTES || '30', 10),
  };
}

/**
 * OrphanedFilingDetector
 *
 * Detects and recovers filings with processed=false but no corresponding jobs.
 */
export class OrphanedFilingDetector {
  /**
   * Detect orphaned filings in the database
   */
  static async detectOrphanedFilings(options: DetectOptions = {}): Promise<OrphanedFiling[]> {
    const config = getConfig();
    const {
      ageThresholdMinutes = config.ageThresholdMinutes,
      limit = 100,
      mockUnprocessedFilings,
      mockJobsForFilings,
    } = options;

    const now = new Date();
    const ageThreshold = new Date(now.getTime() - ageThresholdMinutes * 60 * 1000);

    // Get unprocessed filings older than threshold
    let unprocessedFilings: Array<{
      id: string;
      accessionNumber: string;
      formType?: string;
      tickerId?: string;
      createdAt?: Date;
    }>;

    if (mockUnprocessedFilings !== undefined) {
      // Use mock data for testing - filter by age threshold
      unprocessedFilings = mockUnprocessedFilings.filter(f =>
        f.createdAt && f.createdAt < ageThreshold
      );
    } else {
      const prisma = getPrismaClient();
      // CRITICAL FIX: Use RssFilingCheck table (which has the `processed` field)
      // NOT SecFiling (which does NOT have a `processed` field)
      const rssFilingChecks = await prisma.rssFilingCheck.findMany({
        where: {
          processed: false,
          createdAt: { lt: ageThreshold },
        },
        select: {
          id: true,
          accessionNumber: true,
          filingType: true,  // RssFilingCheck uses filingType, not formType
          tickerMonitoringId: true,  // Use tickerMonitoringId as tickerId equivalent
          createdAt: true,
        },
        take: limit,
      });

      // Map to the expected shape
      unprocessedFilings = rssFilingChecks.map(f => ({
        id: f.id,
        accessionNumber: f.accessionNumber,
        formType: f.filingType,
        tickerId: f.tickerMonitoringId,
        createdAt: f.createdAt,
      }));
    }

    if (unprocessedFilings.length === 0) {
      return [];
    }

    // Get all jobs that reference these filings
    const filingIds = unprocessedFilings.map(f => f.id);

    let existingJobs: Array<{ payload: { filingId?: string } }>;

    if (mockJobsForFilings !== undefined) {
      existingJobs = mockJobsForFilings;
    } else {
      const prisma = getPrismaClient();
      const jobs = await prisma.jobQueue.findMany({
        where: {
          status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] },
          OR: filingIds.map(id => ({
            payload: { path: ['filingId'], equals: id },
          })),
        },
        select: { payload: true },
      });
      existingJobs = jobs as Array<{ payload: { filingId?: string } }>;
    }

    // Find filings without jobs
    const filingIdsWithJobs = new Set(
      existingJobs
        .map(j => j.payload?.filingId)
        .filter((id): id is string => Boolean(id))
    );

    const orphaned = unprocessedFilings.filter(f => !filingIdsWithJobs.has(f.id));

    return orphaned.map(f => ({
      id: f.id,
      accessionNumber: f.accessionNumber,
      formType: f.formType || 'unknown',
      tickerId: f.tickerId || 'unknown',
      createdAt: f.createdAt || new Date(),
    }));
  }

  /**
   * Recover orphaned filings by creating ASYNC_FETCH_FILING jobs.
   *
   * Re-enters the pipeline at Phase 2 (fetch) because orphaned filings never
   * went through fetch, so there is no FilingContentCache. The fetch handler
   * will populate the cache and queue the summarize job itself.
   *
   * Creates one job per user per filing (matching the discovery handler pattern).
   * Skips filings where no real users track the ticker.
   */
  static async recoverOrphanedFilings(options: RecoverOptions = {}): Promise<RecoveryJobData[]> {
    const { mockOrphanedFilings, dryRun = false } = options;

    const orphanedFilings = mockOrphanedFilings ?? await this.detectOrphanedFilings();

    if (orphanedFilings.length === 0) {
      return [];
    }

    const prisma = getPrismaClient();
    const createdJobs: RecoveryJobData[] = [];
    const executionId = `orphan-recovery-${Date.now()}`;

    // Collect unique tickerMonitoringIds to batch-lookup ticker info
    const uniqueTickerIds = [...new Set(orphanedFilings.map(f => f.tickerId).filter(id => id !== 'unknown'))];

    // Batch lookup TickerMonitoring records
    const tickerMonitorings = uniqueTickerIds.length > 0
      ? await prisma.tickerMonitoring.findMany({
          where: { id: { in: uniqueTickerIds } },
          select: { id: true, symbol: true, companyName: true, cik: true },
        })
      : [];
    const tickerMap = new Map(tickerMonitorings.map(t => [t.id, t]));

    // Batch lookup RssFilingCheck records for filing URLs and dates
    const filingIds = orphanedFilings.map(f => f.id);
    const rssFilings = await prisma.rssFilingCheck.findMany({
      where: { id: { in: filingIds } },
      select: { id: true, filingUrl: true, filingDate: true, filingType: true, accessionNumber: true },
    });
    const rssMap = new Map(rssFilings.map(f => [f.id, f]));

    // Get unique ticker symbols and batch lookup users
    const uniqueSymbols = [...new Set(tickerMonitorings.map(t => t.symbol))];
    const usersForSymbols = uniqueSymbols.length > 0
      ? await prisma.user.findMany({
          where: { tickers: { some: { symbol: { in: uniqueSymbols } } } },
          select: {
            id: true,
            email: true,
            subscriptionTier: true,
            isTrialing: true,
            trialEndsAt: true,
            tickers: {
              where: { symbol: { in: uniqueSymbols } },
              select: { id: true, symbol: true, companyName: true },
            },
          },
        })
      : [];

    // Build symbol -> users map
    const usersBySymbol = new Map<string, typeof usersForSymbols>();
    for (const user of usersForSymbols) {
      for (const ticker of user.tickers) {
        const list = usersBySymbol.get(ticker.symbol) || [];
        list.push(user);
        usersBySymbol.set(ticker.symbol, list);
      }
    }

    for (const filing of orphanedFilings) {
      const tickerInfo = tickerMap.get(filing.tickerId);
      if (!tickerInfo) {
        continue; // Skip filings with unknown ticker monitoring records
      }

      const rssInfo = rssMap.get(filing.id);
      if (!rssInfo) {
        continue; // Skip filings we can't find details for
      }

      const users = usersBySymbol.get(tickerInfo.symbol) || [];
      if (users.length === 0) {
        // No real users track this ticker -- mark as processed to stop re-detection
        if (!dryRun) {
          await prisma.rssFilingCheck.update({
            where: { id: filing.id },
            data: { processed: true },
          });
        }
        continue;
      }

      // Create one job per user (matching discovery-handler pattern)
      for (const user of users) {
        const userTicker = user.tickers.find(t => t.symbol === tickerInfo.symbol);
        if (!userTicker) continue;

        const jobData: RecoveryJobData = {
          jobType: 'ASYNC_FETCH_FILING',
          status: 'PENDING',
          priority: 5,
          maxRetries: 3,
          retryCount: 0,
          scheduledFor: new Date(),
          // Deterministic key: prevents duplicate jobs across recovery cycles
          idempotencyKey: `orphan-recovery-${filing.id}-${user.id}`,
          payload: {
            userId: user.id,
            userEmail: user.email || '',
            userTier: user.subscriptionTier || 'FREE',
            ticker: {
              id: userTicker.id,
              symbol: tickerInfo.symbol,
              companyName: userTicker.companyName || tickerInfo.companyName || undefined,
              cik: tickerInfo.cik || undefined,
            },
            filing: {
              filingId: filing.id,
              formType: rssInfo.filingType,
              filingDate: rssInfo.filingDate.toISOString().split('T')[0],
              filingUrl: rssInfo.filingUrl,
              accessionNumber: rssInfo.accessionNumber,
            },
            executionContext: {
              executionId,
              cronTriggerTime: new Date().toISOString(),
              sourceContext: 'orphaned-filing-recovery',
            },
          },
        };

        if (!dryRun) {
          const { JobQueueService } = await import('@/lib/job-queue');
          await JobQueueService.addJob(jobData);
        }
        createdJobs.push(jobData);
      }

      // Mark the RssFilingCheck as processed after creating recovery jobs
      if (!dryRun) {
        await prisma.rssFilingCheck.update({
          where: { id: filing.id },
          data: { processed: true },
        });
      }
    }

    // Send Slack notification
    if (!dryRun && createdJobs.length > 0) {
      await this.sendSlackNotification(createdJobs.length);
    }

    return createdJobs;
  }

  /**
   * Get a formatted summary of orphaned filings
   */
  static getOrphanedSummary(orphaned: OrphanedFiling[]): string {
    if (orphaned.length === 0) {
      return '';
    }

    return orphaned.map(f =>
      `- ${f.id}: ${f.formType} (${f.accessionNumber}) created at ${f.createdAt.toISOString()}`
    ).join('\n');
  }

  /**
   * Check for orphaned filings and recover them (with rate limiting)
   */
  static async checkAndRecover(options: CheckAndRecoverOptions = {}): Promise<CheckAndRecoverResult> {
    const { detectOptions, dryRun = false } = options;
    const config = getConfig();

    const orphaned = await this.detectOrphanedFilings(detectOptions);

    if (orphaned.length === 0) {
      return { recovered: 0, filings: [] };
    }

    // Check rate limiting for alerts (but still recover)
    const shouldAlert = !this.isRateLimited(config.alertCooldownMinutes);

    // Recover orphaned filings
    const jobs = await this.recoverOrphanedFilings({
      mockOrphanedFilings: orphaned,
      dryRun,
    });

    // Update rate limit timestamp if we alerted
    if (shouldAlert && !dryRun) {
      lastAlertTime = new Date();
    }

    return {
      recovered: jobs.length,
      filings: orphaned,
      rateLimited: !shouldAlert,
    };
  }

  /**
   * Check if we're within the rate limit cooldown period
   */
  private static isRateLimited(cooldownMinutes: number): boolean {
    if (!lastAlertTime) {
      return false;
    }

    const timeSinceLastAlert = (Date.now() - lastAlertTime.getTime()) / (60 * 1000);
    return timeSinceLastAlert < cooldownMinutes;
  }

  /**
   * Clear the rate limit (for testing)
   */
  static clearRateLimit(): void {
    lastAlertTime = null;
  }

  /**
   * Send Slack notification for recovered filings
   */
  private static async sendSlackNotification(count: number): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:recycle: *Orphaned Filing Recovery*\n\nRecovered ${count} orphaned filing(s) by creating ASYNC_FETCH_FILING jobs.\n\nThese filings (from RssFilingCheck) had \`processed=false\` but no active jobs in the queue.`,
        }),
      });
    } catch (error) {
      console.error('[OrphanedFilingDetector] Failed to send Slack notification:', error);
    }
  }
}
