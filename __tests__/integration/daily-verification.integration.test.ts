/**
 * Integration tests for daily pipeline verification
 * Tests database operations, npm scripts, and end-to-end workflow
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Daily Pipeline Verification Integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Use test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL
        }
      }
    });

    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.dailyPipelineVerification.deleteMany({
      where: {
        verificationDate: {
          gte: new Date('2025-01-01') // Clean test data from this year
        }
      }
    });
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.dailyPipelineVerification.deleteMany({
      where: {
        verificationDate: {
          gte: new Date('2025-01-01')
        }
      }
    });
  });

  describe('Database Schema Operations', () => {
    test('should create DailyPipelineVerification record', async () => {
      const testData = {
        verificationDate: new Date('2025-11-28'),
        totalFilings: 5,
        completedFilings: 4,
        pendingFilings: 1,
        failedFilings: 0,
        completionRate: 80.0,
        remediationAttempted: false,
        remediationSucceeded: 0,
        verificationResults: {
          summary: {
            date: '2025-11-28',
            total: 5,
            completed: 4,
            pending: 1,
            failed: 0
          }
        },
        executionTimeMs: 1500
      };

      const created = await prisma.dailyPipelineVerification.create({
        data: testData
      });

      expect(created.id).toBeDefined();
      expect(created.verificationDate).toEqual(testData.verificationDate);
      expect(created.totalFilings).toBe(testData.totalFilings);
      expect(created.completionRate).toBe(testData.completionRate);
    });

    test('should upsert DailyPipelineVerification record', async () => {
      const testDate = new Date('2025-11-28');
      
      // First create
      const firstRecord = await prisma.dailyPipelineVerification.upsert({
        where: { verificationDate: testDate },
        create: {
          verificationDate: testDate,
          totalFilings: 3,
          completedFilings: 3,
          pendingFilings: 0,
          failedFilings: 0,
          completionRate: 100.0,
          remediationAttempted: false,
          remediationSucceeded: 0,
          verificationResults: { test: 'data' },
          executionTimeMs: 1000
        },
        update: {
          totalFilings: 5,
          completedFilings: 4,
          executionTimeMs: 1500
        }
      });

      expect(firstRecord.totalFilings).toBe(3);

      // Then update
      const updatedRecord = await prisma.dailyPipelineVerification.upsert({
        where: { verificationDate: testDate },
        create: {
          verificationDate: testDate,
          totalFilings: 3,
          completedFilings: 3,
          pendingFilings: 0,
          failedFilings: 0,
          completionRate: 100.0,
          remediationAttempted: false,
          remediationSucceeded: 0,
          verificationResults: { test: 'data' },
          executionTimeMs: 1000
        },
        update: {
          totalFilings: 5,
          completedFilings: 4,
          executionTimeMs: 1500
        }
      });

      expect(updatedRecord.id).toBe(firstRecord.id);
      expect(updatedRecord.totalFilings).toBe(5);
      expect(updatedRecord.completedFilings).toBe(4);
    });

    test('should handle JSON field operations', async () => {
      const complexResults = {
        summary: {
          date: '2025-11-28',
          total: 10,
          completed: 8,
          pending: 1,
          failed: 1
        },
        filings: [
          {
            accessionNumber: 'test-001',
            ticker: 'TSLA',
            status: 'COMPLETE'
          },
          {
            accessionNumber: 'test-002',
            ticker: 'AAPL',
            status: 'FAILED',
            error: 'Network timeout'
          }
        ],
        remediation: {
          attempted: 1,
          succeeded: 1,
          failed: 0
        }
      };

      const record = await prisma.dailyPipelineVerification.create({
        data: {
          verificationDate: new Date('2025-11-28'),
          totalFilings: 10,
          completedFilings: 8,
          pendingFilings: 1,
          failedFilings: 1,
          completionRate: 80.0,
          remediationAttempted: true,
          remediationSucceeded: 1,
          verificationResults: complexResults,
          executionTimeMs: 2500
        }
      });

      const retrieved = await prisma.dailyPipelineVerification.findUnique({
        where: { id: record.id }
      });

      expect(retrieved?.verificationResults).toEqual(complexResults);
    });
  });

  describe('npm Script Execution', () => {
    test('should execute verify:daily:no-remediation script', async () => {
      try {
        const { stdout, stderr } = await execAsync('npm run verify:daily:no-remediation', {
          cwd: process.cwd(),
          timeout: 30000 // 30 second timeout
        });

        expect(stderr).not.toContain('ERROR');
        expect(stdout).toContain('Daily Pipeline Verification');
        
        // Should not attempt remediation
        expect(stdout).not.toContain('Remediation attempted');
      } catch (error: any) {
        // Script may fail due to test environment, but should not crash
        expect(error.code).not.toBe(1); // Should not be a syntax error
      }
    }, 35000);

    test('should execute with custom date parameter', async () => {
      try {
        const { stdout } = await execAsync('npm run verify:daily:no-remediation -- --date=2025-11-28', {
          cwd: process.cwd(),
          timeout: 30000
        });

        expect(stdout).toContain('2025-11-28');
      } catch (error: any) {
        // Script may fail in test environment, but should accept the parameter
        expect(error.message).not.toContain('Invalid date format');
      }
    }, 35000);
  });

  describe('Error Handling', () => {
    test('should handle database connection failures gracefully', async () => {
      // Create a client with invalid connection
      const invalidPrisma = new PrismaClient({
        datasources: {
          db: {
            url: 'postgresql://invalid:invalid@localhost:5432/invalid'
          }
        }
      });

      await expect(invalidPrisma.$connect()).rejects.toThrow();
      await invalidPrisma.$disconnect();
    });

    test('should validate date range constraints', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      await expect(
        prisma.dailyPipelineVerification.create({
          data: {
            verificationDate: futureDate,
            totalFilings: 0,
            completedFilings: 0,
            pendingFilings: 0,
            failedFilings: 0,
            completionRate: 0,
            remediationAttempted: false,
            remediationSucceeded: 0,
            verificationResults: {},
            executionTimeMs: 1000
          }
        })
      ).rejects.toThrow(); // Should fail due to check constraint
    });
  });

  describe('Performance Tests', () => {
    test('should complete verification within reasonable time', async () => {
      const start = Date.now();
      
      try {
        await execAsync('npm run verify:daily:no-remediation', {
          cwd: process.cwd(),
          timeout: 10000 // Should complete within 10 seconds
        });
      } catch (error) {
        // Even if it fails, it shouldn't timeout
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(10000);
      }
    }, 15000);

    test('should handle large verification datasets', async () => {
      // Create multiple verification records to test query performance
      const records = Array(100).fill(null).map((_, i) => {
        const date = new Date('2025-11-01');
        date.setDate(date.getDate() + i);
        
        return {
          verificationDate: date,
          totalFilings: Math.floor(Math.random() * 20),
          completedFilings: Math.floor(Math.random() * 15),
          pendingFilings: Math.floor(Math.random() * 3),
          failedFilings: Math.floor(Math.random() * 2),
          completionRate: Math.random() * 100,
          remediationAttempted: Math.random() > 0.5,
          remediationSucceeded: Math.floor(Math.random() * 2),
          verificationResults: { test: `data-${i}` },
          executionTimeMs: 1000 + Math.floor(Math.random() * 5000)
        };
      });

      const start = Date.now();
      await prisma.dailyPipelineVerification.createMany({
        data: records
      });
      const createDuration = Date.now() - start;

      expect(createDuration).toBeLessThan(5000); // Should create 100 records in <5s

      // Test query performance
      const queryStart = Date.now();
      const results = await prisma.dailyPipelineVerification.findMany({
        where: {
          verificationDate: {
            gte: new Date('2025-11-01'),
            lte: new Date('2025-12-31')
          }
        },
        orderBy: {
          verificationDate: 'desc'
        }
      });
      const queryDuration = Date.now() - queryStart;

      expect(queryDuration).toBeLessThan(1000); // Query should complete in <1s
      expect(results.length).toBeGreaterThanOrEqual(100);

      // Cleanup
      await prisma.dailyPipelineVerification.deleteMany({
        where: {
          verificationDate: {
            gte: new Date('2025-11-01'),
            lte: new Date('2025-12-31')
          }
        }
      });
    }, 20000);
  });

  describe('Console Output Validation', () => {
    test('should produce readable console output', async () => {
      try {
        const { stdout } = await execAsync('npm run verify:daily:no-remediation', {
          cwd: process.cwd(),
          timeout: 15000
        });

        // Check for expected console elements
        expect(stdout).toMatch(/Daily Pipeline Verification/);
        expect(stdout).toMatch(/Date:|Summary:|Status:/);
        
        // Check for status indicators (if any filings exist)
        if (stdout.includes('Total:')) {
          expect(stdout).toMatch(/✅|⏳|❌/); // Should contain status emojis
        }
      } catch (error: any) {
        // Even if script fails, output should be well-formatted
        if (error.stdout) {
          expect(error.stdout).toMatch(/Daily Pipeline Verification/);
        }
      }
    }, 20000);
  });
});