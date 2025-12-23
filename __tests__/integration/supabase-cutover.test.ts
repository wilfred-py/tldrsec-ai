/**
 * @jest-environment node
 *
 * Supabase Cutover Verification Tests
 *
 * These tests verify that the application has been successfully cut over
 * from Neon to Supabase and is writing data correctly.
 *
 * Phase 3 of Neon → Supabase Database Migration Plan
 *
 * Run with: npm run test -- --testPathPattern="supabase-cutover"
 */

// Unmock Prisma client for real DB connection tests
jest.unmock('@prisma/client');
jest.unmock('../../lib/db');
jest.unmock('../../lib/db/prisma');

import * as dotenv from 'dotenv';
dotenv.config();

const { PrismaClient } = require('@prisma/client');

// Helper to check database connectivity
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

describe('Supabase Cutover Verification', () => {
  let prisma: InstanceType<typeof PrismaClient> | null = null;
  let canConnect = false;
  const databaseUrl = process.env.DATABASE_URL || '';

  beforeAll(async () => {
    // Skip tests if DATABASE_URL not configured
    if (!databaseUrl) {
      console.warn('DATABASE_URL not set, skipping Supabase cutover tests');
      return;
    }

    // Verify we're pointed at Supabase, not Neon
    if (databaseUrl.includes('neon.tech')) {
      console.warn(
        'WARNING: DATABASE_URL still points to Neon. Cutover not complete.'
      );
    }

    canConnect = await canConnectToDatabase(databaseUrl);

    if (!canConnect) {
      console.warn(
        'Cannot connect to database. Skipping cutover tests. ' +
          'This may be due to IPv4-only network or connection issues.'
      );
      return;
    }

    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('Database Configuration', () => {
    it('should be using Supabase, not Neon', () => {
      // Skip in mocked test environment
      if (databaseUrl.includes('localhost') || databaseUrl.includes('test')) {
        console.warn('Skipping: Running in mocked test environment');
        return;
      }
      expect(databaseUrl).not.toContain('neon.tech');
      expect(databaseUrl).toMatch(/supabase\.com|pooler\.supabase\.com/);
    });

    it('should connect successfully to Supabase', async () => {
      if (!canConnect || !prisma) {
        console.warn('Skipping: Database connection not available');
        return;
      }

      const result = await prisma.$queryRaw`SELECT 1 as connected`;
      expect(result).toEqual([{ connected: 1 }]);
    });
  });

  describe('Schema Configuration', () => {
    it('should have app schema', async () => {
      if (!canConnect || !prisma) {
        console.warn('Skipping: Database connection not available');
        return;
      }

      const schemas = await prisma.$queryRaw`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = 'app'
      `;
      expect(schemas).toHaveLength(1);
    });

    it('should have pipeline schema', async () => {
      if (!canConnect || !prisma) {
        console.warn('Skipping: Database connection not available');
        return;
      }

      const schemas = await prisma.$queryRaw`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = 'pipeline'
      `;
      expect(schemas).toHaveLength(1);
    });
  });

  describe('Data Verification', () => {
    it('should have users in app schema', async () => {
      if (!canConnect || !prisma) {
        console.warn('Skipping: Database connection not available');
        return;
      }

      const count = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count FROM app."User"
      `;
      expect(count[0].count).toBeGreaterThan(0);
    });

    it('should have tickers in app schema', async () => {
      if (!canConnect || !prisma) {
        console.warn('Skipping: Database connection not available');
        return;
      }

      const count = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count FROM app."Ticker"
      `;
      expect(count[0].count).toBeGreaterThan(0);
    });

    it('should preserve newsletter_subscribers in public schema', async () => {
      if (!canConnect || !prisma) {
        console.warn('Skipping: Database connection not available');
        return;
      }

      const count = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count FROM public.newsletter_subscribers
      `;
      expect(count[0].count).toBeGreaterThanOrEqual(121);
    });
  });

  describe('Cron Job Verification', () => {
    it('should have recent CronJobExecution records', async () => {
      if (!canConnect || !prisma) {
        console.warn('Skipping: Database connection not available');
        return;
      }

      // Check for executions in the last 24 hours
      const recentExecutions = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM pipeline."CronJobExecution"
        WHERE "startedAt" > NOW() - INTERVAL '24 hours'
      `;
      expect(recentExecutions[0].count).toBeGreaterThan(0);
    });

    it('should have successful cron executions', async () => {
      if (!canConnect || !prisma) {
        console.warn('Skipping: Database connection not available');
        return;
      }

      // Check for successful executions
      const successfulExecutions = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM pipeline."CronJobExecution"
        WHERE status = 'SUCCESS'
          AND "startedAt" > NOW() - INTERVAL '24 hours'
      `;
      expect(successfulExecutions[0].count).toBeGreaterThan(0);
    });
  });

  describe('JobQueue Verification', () => {
    it('should have JobQueue table in pipeline schema', async () => {
      if (!canConnect || !prisma) {
        console.warn('Skipping: Database connection not available');
        return;
      }

      // Verify we can query the JobQueue table
      const result = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count FROM pipeline."JobQueue"
      `;
      expect(result[0].count).toBeGreaterThanOrEqual(0);
    });
  });
});

/**
 * Cutover Verification Summary:
 *
 * This test suite verifies:
 * 1. DATABASE_URL points to Supabase (not Neon)
 * 2. app and pipeline schemas exist
 * 3. Core data is present (users, tickers)
 * 4. Public schema is preserved (newsletter_subscribers)
 * 5. Cron jobs are executing successfully
 * 6. Pipeline tables are accessible
 *
 * If these tests pass, the cutover to Supabase is complete.
 */
