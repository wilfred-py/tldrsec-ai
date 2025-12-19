/**
 * @jest-environment node
 *
 * Data Migration Integrity Tests
 *
 * These tests verify data was correctly migrated from Neon to Supabase.
 * They compare row counts and validate foreign key relationships.
 *
 * Run with: npm run test -- --testPathPattern="data-migration"
 */

// Unmock Prisma client for real DB connection tests
jest.unmock('@prisma/client');
jest.unmock('../../lib/db');
jest.unmock('../../lib/db/prisma');

import dotenv from 'dotenv';
dotenv.config();

const { PrismaClient } = require('@prisma/client');

// Expected counts from Neon (snapshot from 2025-12-19)
// These will be updated after fresh backup
const EXPECTED_NEON_COUNTS = {
  User: 2,
  Ticker: 14,
  Summary: 68,
  SecFiling: 1,
  CikMapping: 20,
  TickerMonitoring: 13,
  RssFilingCheck: 391,
  UserSubscription: 0,
  AuditLog: 151,
  NotificationSent: 0,
  SecCompanyCache: 1,
  JobQueue: 17982,
  JobProgress: 0,
  JobLock: 0,
  SecFetchAttempt: 0,
  FilingContentCache: 101,
  FilingUsage: 0,
  UsagePeriod: 0,
  CronJobExecution: 5827,
  CronJobMetrics: 0,
  CronJobAlert: 0,
  TierProcessingExecution: 0,
  CronExecutionContext: 0,
  SummaryCacheAccess: 0,
  SummaryEmailDelivery: 20,
  CacheInvalidation: 0,
  ErrorAlert: 0,
  MonitoringThreshold: 10,
  DailyWaitlistCache: 14,
  DailyPipelineVerification: 20,
};

// Check if we can connect to both databases
async function canConnectToDatabase(url: string): Promise<boolean> {
  if (!url) return false;

  const testPrisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    await testPrisma.$queryRaw`SELECT 1`;
    await testPrisma.$disconnect();
    return true;
  } catch {
    await testPrisma.$disconnect();
    return false;
  }
}

describe('Data Migration Integrity', () => {
  let supabasePrisma: InstanceType<typeof PrismaClient> | null = null;
  let canConnectSupabase = false;

  beforeAll(async () => {
    if (!process.env.SUPABASE_DATABASE_URL) {
      console.warn('SUPABASE_DATABASE_URL not set, skipping tests');
      return;
    }

    canConnectSupabase = await canConnectToDatabase(
      process.env.SUPABASE_DATABASE_URL
    );

    if (!canConnectSupabase) {
      console.warn('Cannot connect to Supabase, skipping tests');
      return;
    }

    supabasePrisma = new PrismaClient({
      datasources: { db: { url: process.env.SUPABASE_DATABASE_URL } },
    });
  });

  afterAll(async () => {
    if (supabasePrisma) {
      await supabasePrisma.$disconnect();
    }
  });

  // Helper to get count from Supabase with schema-qualified table name
  async function getSupabaseCount(
    schema: 'app' | 'pipeline',
    table: string
  ): Promise<number> {
    if (!supabasePrisma) return -1;
    const result = await supabasePrisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM ${schema}."${table}"`
    );
    return result[0].count;
  }

  describe('App Schema Tables', () => {
    it('should have matching User count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('app', 'User');
      expect(count).toBe(EXPECTED_NEON_COUNTS.User);
    });

    it('should have matching Ticker count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('app', 'Ticker');
      expect(count).toBe(EXPECTED_NEON_COUNTS.Ticker);
    });

    it('should have matching Summary count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('app', 'Summary');
      expect(count).toBe(EXPECTED_NEON_COUNTS.Summary);
    });

    it('should have matching SecFiling count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('app', 'SecFiling');
      expect(count).toBe(EXPECTED_NEON_COUNTS.SecFiling);
    });

    it('should have matching CikMapping count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('app', 'CikMapping');
      expect(count).toBe(EXPECTED_NEON_COUNTS.CikMapping);
    });

    it('should have matching TickerMonitoring count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('app', 'TickerMonitoring');
      expect(count).toBe(EXPECTED_NEON_COUNTS.TickerMonitoring);
    });

    it('should have matching RssFilingCheck count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('app', 'RssFilingCheck');
      expect(count).toBe(EXPECTED_NEON_COUNTS.RssFilingCheck);
    });

    it('should have matching AuditLog count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('app', 'AuditLog');
      expect(count).toBe(EXPECTED_NEON_COUNTS.AuditLog);
    });

    it('should have matching SecCompanyCache count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('app', 'SecCompanyCache');
      expect(count).toBe(EXPECTED_NEON_COUNTS.SecCompanyCache);
    });
  });

  describe('Pipeline Schema Tables', () => {
    it('should have matching JobQueue count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('pipeline', 'JobQueue');
      expect(count).toBe(EXPECTED_NEON_COUNTS.JobQueue);
    });

    it('should have matching FilingContentCache count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('pipeline', 'FilingContentCache');
      expect(count).toBe(EXPECTED_NEON_COUNTS.FilingContentCache);
    });

    it('should have matching CronJobExecution count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('pipeline', 'CronJobExecution');
      expect(count).toBe(EXPECTED_NEON_COUNTS.CronJobExecution);
    });

    it('should have matching SummaryEmailDelivery count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('pipeline', 'SummaryEmailDelivery');
      expect(count).toBe(EXPECTED_NEON_COUNTS.SummaryEmailDelivery);
    });

    it('should have matching MonitoringThreshold count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('pipeline', 'MonitoringThreshold');
      expect(count).toBe(EXPECTED_NEON_COUNTS.MonitoringThreshold);
    });

    it('should have matching DailyWaitlistCache count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount('pipeline', 'DailyWaitlistCache');
      expect(count).toBe(EXPECTED_NEON_COUNTS.DailyWaitlistCache);
    });

    it('should have matching DailyPipelineVerification count', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await getSupabaseCount(
        'pipeline',
        'DailyPipelineVerification'
      );
      expect(count).toBe(EXPECTED_NEON_COUNTS.DailyPipelineVerification);
    });
  });

  describe('Foreign Key Relationships', () => {
    it('should preserve user-ticker relationships', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      // Verify all tickers have valid user references
      const orphanedTickers = await supabasePrisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM app."Ticker" t
        LEFT JOIN app."User" u ON t."userId" = u.id
        WHERE u.id IS NULL
      `;
      expect(orphanedTickers[0].count).toBe(0);
    });

    it('should preserve ticker-summary relationships', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      // Verify all summaries have valid ticker references
      const orphanedSummaries = await supabasePrisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM app."Summary" s
        LEFT JOIN app."Ticker" t ON s."tickerId" = t.id
        WHERE t.id IS NULL
      `;
      expect(orphanedSummaries[0].count).toBe(0);
    });

    it('should preserve tickerMonitoring-rssFilingCheck relationships', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      // Verify all RSS checks have valid ticker monitoring references
      const orphanedChecks = await supabasePrisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM app."RssFilingCheck" r
        LEFT JOIN app."TickerMonitoring" tm ON r."tickerMonitoringId" = tm.id
        WHERE tm.id IS NULL
      `;
      expect(orphanedChecks[0].count).toBe(0);
    });
  });

  describe('Public Schema Preservation', () => {
    it('should preserve newsletter_subscribers table with data', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      const count = await supabasePrisma.$queryRaw`
        SELECT COUNT(*)::int as count FROM public.newsletter_subscribers
      `;
      expect(count[0].count).toBeGreaterThanOrEqual(121);
    });

    it('should preserve newsletter_deliveries table', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      // Table should exist (count can be 0)
      const result = await supabasePrisma.$queryRaw`
        SELECT COUNT(*)::int as count FROM public.newsletter_deliveries
      `;
      expect(result[0].count).toBeGreaterThanOrEqual(0);
    });

    it('should preserve page_analytics table', async () => {
      if (!canConnectSupabase || !supabasePrisma) {
        console.warn('Skipping: Supabase not available');
        return;
      }

      // Table should exist (count can be 0)
      const result = await supabasePrisma.$queryRaw`
        SELECT COUNT(*)::int as count FROM public.page_analytics
      `;
      expect(result[0].count).toBeGreaterThanOrEqual(0);
    });
  });
});

/**
 * Migration Summary:
 *
 * App Schema (11 tables):
 * - User: 2 records
 * - Ticker: 14 records
 * - Summary: 68 records
 * - SecFiling: 1 record
 * - CikMapping: 20 records
 * - TickerMonitoring: 13 records
 * - RssFilingCheck: 391 records
 * - UserSubscription: 0 records
 * - AuditLog: 151 records
 * - NotificationSent: 0 records
 * - SecCompanyCache: 1 record
 *
 * Pipeline Schema (19 tables):
 * - JobQueue: 17,982 records
 * - JobProgress: 0 records
 * - JobLock: 0 records
 * - SecFetchAttempt: 0 records
 * - FilingContentCache: 101 records
 * - FilingUsage: 0 records
 * - UsagePeriod: 0 records
 * - CronJobExecution: 5,827 records
 * - CronJobMetrics: 0 records
 * - CronJobAlert: 0 records
 * - TierProcessingExecution: 0 records
 * - CronExecutionContext: 0 records
 * - SummaryCacheAccess: 0 records
 * - SummaryEmailDelivery: 20 records
 * - CacheInvalidation: 0 records
 * - ErrorAlert: 0 records
 * - MonitoringThreshold: 10 records
 * - DailyWaitlistCache: 14 records
 * - DailyPipelineVerification: 20 records
 *
 * Total records to migrate: ~24,600+
 */
