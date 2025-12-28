/**
 * Summary Audit Helper
 *
 * Utilities for detecting and fixing data inconsistencies in summary records.
 * Part of Phase 3: Test Data Integrity Improvements (2025-12-26)
 *
 * Key capabilities:
 * - Detect summaries with sentToUser=true but no delivery records
 * - Identify test-generated data via metadata markers
 * - Provide cleanup options for test data
 */

import { prisma } from '@/lib/db';

/**
 * Result of an audit operation
 */
export interface AuditResult {
  /** Total summaries with sentToUser flag set to true */
  totalSummariesWithSentFlag: number;
  /** Number of summaries with inconsistent delivery tracking */
  inconsistentCount: number;
  /** IDs of summaries with inconsistent delivery tracking */
  inconsistentIds: string[];
  /** Number of summaries marked as test data */
  testDataCount: number;
  /** IDs of summaries marked as test data */
  testDataIds: string[];
}

/**
 * Options for cleanup operations
 */
export interface CleanupOptions {
  /** If true, actually delete the records. If false, just report what would be deleted. */
  dryRun?: boolean;
  /** Only clean up test data from specific sources (e.g., 'e2e-test', 'unit-test') */
  testSources?: string[];
  /** Maximum number of records to clean up in one operation */
  limit?: number;
}

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Number of summaries that would be/were deleted */
  summariesDeleted: number;
  /** Number of delivery records that would be/were deleted */
  deliveryRecordsDeleted: number;
  /** IDs of affected summaries */
  affectedIds: string[];
  /** Any errors encountered */
  errors: string[];
}

/**
 * Audit summaries for delivery consistency.
 * Finds summaries where sentToUser=true but no SummaryEmailDelivery record exists.
 * Also identifies test-generated data via metadata markers.
 */
export async function auditSummaryDeliveryConsistency(): Promise<AuditResult> {
  // Find all summaries with sentToUser=true
  const sentSummaries = await prisma.summary.findMany({
    where: { sentToUser: true },
    select: {
      id: true,
      metadata: true
    }
  });

  // Find all delivery records
  const deliveryRecords = await prisma.summaryEmailDelivery.findMany({
    select: { summaryId: true }
  });

  // Create a set of summary IDs that have delivery records
  const summariesWithDelivery = new Set(deliveryRecords.map(r => r.summaryId));

  // Find inconsistent summaries (sentToUser=true but no delivery record)
  const inconsistentIds: string[] = [];
  const testDataIds: string[] = [];

  for (const summary of sentSummaries) {
    // Check for delivery consistency
    if (!summariesWithDelivery.has(summary.id)) {
      inconsistentIds.push(summary.id);
    }

    // Check for test data markers
    const metadata = summary.metadata as Record<string, unknown> | null;
    if (metadata && metadata.isTestData === true) {
      testDataIds.push(summary.id);
    }
  }

  return {
    totalSummariesWithSentFlag: sentSummaries.length,
    inconsistentCount: inconsistentIds.length,
    inconsistentIds,
    testDataCount: testDataIds.length,
    testDataIds
  };
}

/**
 * Find all test-generated summaries in the database.
 * This includes summaries marked with metadata.isTestData=true.
 */
export async function findTestData(options?: { testSources?: string[] }): Promise<{
  count: number;
  summaries: Array<{
    id: string;
    ticker: string;
    filingType: string;
    source: string;
    createdAt: Date;
  }>;
}> {
  // Query summaries with test data markers
  // Note: Prisma doesn't support JSON field querying in where clause easily,
  // so we fetch and filter in memory for flexibility
  const allSummaries = await prisma.summary.findMany({
    where: {
      metadata: {
        not: null
      }
    },
    select: {
      id: true,
      filingType: true,
      metadata: true,
      createdAt: true,
      ticker: {
        select: {
          symbol: true
        }
      }
    }
  });

  const testSummaries = allSummaries.filter(summary => {
    const metadata = summary.metadata as Record<string, unknown> | null;
    if (!metadata || metadata.isTestData !== true) {
      return false;
    }

    // Filter by source if specified
    if (options?.testSources && options.testSources.length > 0) {
      const source = metadata.source as string | undefined;
      return source && options.testSources.includes(source);
    }

    return true;
  });

  return {
    count: testSummaries.length,
    summaries: testSummaries.map(s => ({
      id: s.id,
      ticker: s.ticker.symbol,
      filingType: s.filingType,
      source: ((s.metadata as Record<string, unknown>)?.source as string) || 'unknown',
      createdAt: s.createdAt
    }))
  };
}

/**
 * Clean up test-generated data from the database.
 * By default runs in dry-run mode to preview what would be deleted.
 */
export async function cleanupTestData(options: CleanupOptions = { dryRun: true }): Promise<CleanupResult> {
  const result: CleanupResult = {
    dryRun: options.dryRun ?? true,
    summariesDeleted: 0,
    deliveryRecordsDeleted: 0,
    affectedIds: [],
    errors: []
  };

  try {
    // Find test data
    const testData = await findTestData({ testSources: options.testSources });

    // Apply limit if specified
    const summariesToProcess = options.limit
      ? testData.summaries.slice(0, options.limit)
      : testData.summaries;

    result.affectedIds = summariesToProcess.map(s => s.id);

    if (result.dryRun) {
      // Dry run: just count what would be deleted
      result.summariesDeleted = summariesToProcess.length;

      // Count associated delivery records
      const deliveryCount = await prisma.summaryEmailDelivery.count({
        where: {
          summaryId: { in: result.affectedIds }
        }
      });
      result.deliveryRecordsDeleted = deliveryCount;
    } else {
      // Actually delete the records
      // First delete delivery records (foreign key constraint)
      const deliveryDeleteResult = await prisma.summaryEmailDelivery.deleteMany({
        where: {
          summaryId: { in: result.affectedIds }
        }
      });
      result.deliveryRecordsDeleted = deliveryDeleteResult.count;

      // Then delete the summaries
      const summaryDeleteResult = await prisma.summary.deleteMany({
        where: {
          id: { in: result.affectedIds }
        }
      });
      result.summariesDeleted = summaryDeleteResult.count;
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

/**
 * Fix inconsistent delivery tracking by creating missing delivery records
 * or clearing the sentToUser flag for summaries without delivery records.
 */
export async function fixInconsistentDeliveryTracking(options: {
  dryRun?: boolean;
  strategy: 'clear_flag' | 'create_records';
}): Promise<{
  dryRun: boolean;
  fixed: number;
  errors: string[];
}> {
  const result = {
    dryRun: options.dryRun ?? true,
    fixed: 0,
    errors: [] as string[]
  };

  try {
    const audit = await auditSummaryDeliveryConsistency();

    if (audit.inconsistentCount === 0) {
      return result;
    }

    if (result.dryRun) {
      result.fixed = audit.inconsistentCount;
      return result;
    }

    if (options.strategy === 'clear_flag') {
      // Clear the sentToUser flag for inconsistent summaries
      const updateResult = await prisma.summary.updateMany({
        where: {
          id: { in: audit.inconsistentIds }
        },
        data: {
          sentToUser: false
        }
      });
      result.fixed = updateResult.count;
    } else {
      // Note: 'create_records' strategy would require knowing the email address
      // which we don't have for historical data. Log this as an error.
      result.errors.push(
        'create_records strategy not implemented: cannot determine email addresses for historical summaries'
      );
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

/**
 * Generate a comprehensive audit report
 */
export async function generateAuditReport(): Promise<{
  timestamp: string;
  deliveryConsistency: AuditResult;
  testDataSummary: {
    total: number;
    bySource: Record<string, number>;
  };
  recommendations: string[];
}> {
  const consistency = await auditSummaryDeliveryConsistency();
  const testData = await findTestData();

  // Group test data by source
  const bySource: Record<string, number> = {};
  for (const summary of testData.summaries) {
    bySource[summary.source] = (bySource[summary.source] || 0) + 1;
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (consistency.inconsistentCount > 0) {
    recommendations.push(
      `Found ${consistency.inconsistentCount} summaries with sentToUser=true but no delivery records. ` +
      `Consider running fixInconsistentDeliveryTracking({ strategy: 'clear_flag' }) to fix.`
    );
  }

  if (testData.count > 0) {
    recommendations.push(
      `Found ${testData.count} test-generated summaries. ` +
      `Consider running cleanupTestData() to remove them from production database.`
    );
  }

  if (consistency.inconsistentCount === 0 && testData.count === 0) {
    recommendations.push('No issues found. Database is in a consistent state.');
  }

  return {
    timestamp: new Date().toISOString(),
    deliveryConsistency: consistency,
    testDataSummary: {
      total: testData.count,
      bySource
    },
    recommendations
  };
}
