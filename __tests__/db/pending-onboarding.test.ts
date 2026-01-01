/**
 * @jest-environment node
 *
 * Integration tests for the PendingOnboarding model
 * These tests run against the real database
 *
 * Note: This test explicitly unmocks Prisma to hit the real database
 */

// Unmock the database modules that are mocked in setup.js
jest.unmock('../../lib/db');
jest.unmock('@prisma/client');

import { PrismaClient } from '@prisma/client';

// Lazy-initialized Prisma client - created in beforeAll after env vars are loaded
let prisma: PrismaClient;

describe('PendingOnboarding Model', () => {
  // Test email addresses used in tests
  const testEmails = [
    'test@example.com',
    'unique@example.com',
    'findme@example.com',
    'nonexistent@example.com',
    'upsert@example.com'
  ];

  // Clean up any test records before running tests
  beforeAll(async () => {
    // Verify DATABASE_URL is loaded
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not found. Run with: npm run test:db:pending');
    }

    // Create Prisma client with explicit URL from environment
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });

    // Delete any existing test records
    await prisma.pendingOnboarding.deleteMany({
      where: {
        email: {
          in: testEmails
        }
      }
    });
  });

  afterAll(async () => {
    // Final cleanup
    await prisma.pendingOnboarding.deleteMany({
      where: {
        email: {
          in: testEmails
        }
      }
    });
    await prisma.$disconnect();
  });

  describe('create', () => {
    it('should create a pending onboarding record with valid data', async () => {
      const data = {
        email: 'test@example.com',
        sectors: ['technology', 'healthcare'],
        tickers: JSON.stringify([
          { symbol: 'AAPL', companyName: 'Apple Inc.' },
          { symbol: 'JNJ', companyName: 'Johnson & Johnson' }
        ]),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };

      const record = await prisma.pendingOnboarding.create({ data });

      expect(record.id).toBeDefined();
      expect(record.email).toBe('test@example.com');
      expect(record.sectors).toEqual(['technology', 'healthcare']);
      expect(JSON.parse(record.tickers as string)).toHaveLength(2);
      expect(record.expiresAt).toBeInstanceOf(Date);

      // Cleanup
      await prisma.pendingOnboarding.delete({ where: { id: record.id } });
    });

    it('should enforce email uniqueness', async () => {
      const data = {
        email: 'unique@example.com',
        sectors: ['technology'],
        tickers: '[]',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      await prisma.pendingOnboarding.create({ data });

      await expect(
        prisma.pendingOnboarding.create({ data })
      ).rejects.toThrow();

      // Cleanup
      await prisma.pendingOnboarding.delete({ where: { email: 'unique@example.com' } });
    });
  });

  describe('findByEmail', () => {
    it('should find pending record by email', async () => {
      const email = 'findme@example.com';
      await prisma.pendingOnboarding.create({
        data: {
          email,
          sectors: ['financial'],
          tickers: '[]',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      const found = await prisma.pendingOnboarding.findUnique({ where: { email } });

      expect(found).not.toBeNull();
      expect(found?.email).toBe(email);

      // Cleanup
      await prisma.pendingOnboarding.delete({ where: { email } });
    });

    it('should return null for non-existent email', async () => {
      const found = await prisma.pendingOnboarding.findUnique({
        where: { email: 'nonexistent@example.com' }
      });

      expect(found).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should update existing record with same email', async () => {
      const email = 'upsert@example.com';

      // Create initial
      await prisma.pendingOnboarding.create({
        data: {
          email,
          sectors: ['technology'],
          tickers: '[]',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      // Upsert with new data
      const updated = await prisma.pendingOnboarding.upsert({
        where: { email },
        create: {
          email,
          sectors: ['healthcare'],
          tickers: '[]',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        update: {
          sectors: ['healthcare', 'financial'],
          tickers: JSON.stringify([{ symbol: 'MSFT', companyName: 'Microsoft' }])
        }
      });

      expect(updated.sectors).toEqual(['healthcare', 'financial']);
      expect(JSON.parse(updated.tickers as string)).toHaveLength(1);

      // Cleanup
      await prisma.pendingOnboarding.delete({ where: { email } });
    });
  });
});
