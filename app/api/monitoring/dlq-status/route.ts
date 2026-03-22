/**
 * Dead Letter Queue Status Monitoring Endpoint
 *
 * Provides health metrics for the Dead Letter Queue.
 *
 * Returns:
 * - Pending count (jobs waiting for reprocessing)
 * - Reprocessed count (jobs already handled)
 * - Error patterns (most common errors)
 * - Age distribution (how old are pending entries)
 *
 * Publicly accessible (no auth required) for dashboard integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/monitoring/dlq-status
 *
 * Returns Dead Letter Queue health metrics.
 */
export async function GET(_request: NextRequest) {
  try {
    const prisma = getPrismaClient();

    // Count pending and reprocessed entries
    const [pendingCount, reprocessedCount, allEntries] = await Promise.all([
      prisma.deadLetterQueue.count({
        where: { reprocessed: false }
      }),
      prisma.deadLetterQueue.count({
        where: { reprocessed: true }
      }),
      prisma.deadLetterQueue.findMany({
        where: { reprocessed: false },
        select: {
          id: true,
          jobType: true,
          lastError: true,
          createdAt: true,
          failedAt: true
        },
        orderBy: { failedAt: 'desc' }
      })
    ]);

    // Analyze error patterns
    const errorPatterns: Record<string, number> = {};
    for (const entry of allEntries) {
      if (entry.lastError) {
        // Extract first 60 characters or up to first newline
        const errorKey = entry.lastError.split('\n')[0].substring(0, 60);
        errorPatterns[errorKey] = (errorPatterns[errorKey] || 0) + 1;
      }
    }

    // Sort error patterns by frequency
    const sortedErrorPatterns = Object.entries(errorPatterns)
      .sort(([, a], [, b]) => b - a)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, number>);

    // Calculate age distribution
    const now = Date.now();
    const ageDistribution = {
      lessThan1Hour: 0,
      lessThan1Day: 0,
      lessThan1Week: 0,
      moreThan1Week: 0
    };

    for (const entry of allEntries) {
      const age = now - entry.createdAt.getTime();
      const hourMs = 60 * 60 * 1000;
      const dayMs = 24 * hourMs;
      const weekMs = 7 * dayMs;

      if (age < hourMs) {
        ageDistribution.lessThan1Hour++;
      } else if (age < dayMs) {
        ageDistribution.lessThan1Day++;
      } else if (age < weekMs) {
        ageDistribution.lessThan1Week++;
      } else {
        ageDistribution.moreThan1Week++;
      }
    }

    // Calculate job type distribution
    const jobTypeDistribution: Record<string, number> = {};
    for (const entry of allEntries) {
      jobTypeDistribution[entry.jobType] = (jobTypeDistribution[entry.jobType] || 0) + 1;
    }

    // Determine health status
    let healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    const recommendations: string[] = [];

    if (pendingCount >= 100) {
      healthStatus = 'CRITICAL';
      recommendations.push('DLQ has exceeded critical threshold (100+ entries)');
      recommendations.push('Immediate investigation required for systemic failures');
      recommendations.push('Check error patterns and consider manual reprocessing');
    } else if (pendingCount >= 50) {
      healthStatus = 'WARNING';
      recommendations.push('DLQ approaching warning threshold (50+ entries)');
      recommendations.push('Monitor error patterns and growth rate');
      recommendations.push('Consider investigating most common errors');
    }

    if (ageDistribution.moreThan1Week > 0) {
      recommendations.push(`${ageDistribution.moreThan1Week} entries older than 1 week`);
      recommendations.push('Consider manual investigation or archival');
    }

    const response = {
      status: healthStatus,
      timestamp: new Date().toISOString(),
      metrics: {
        pendingCount,
        reprocessedCount,
        totalHistorical: pendingCount + reprocessedCount,
        errorPatterns: sortedErrorPatterns,
        ageDistribution,
        jobTypeDistribution
      },
      recentEntries: allEntries.slice(0, 5).map(entry => ({
        id: entry.id,
        jobType: entry.jobType,
        error: entry.lastError ? entry.lastError.substring(0, 100) + '...' : null,
        failedAt: entry.failedAt,
        age: Math.floor((now - entry.createdAt.getTime()) / (60 * 1000)) // Age in minutes
      })),
      recommendations: recommendations.length > 0 ? recommendations : undefined
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    console.error('Error fetching DLQ status:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
