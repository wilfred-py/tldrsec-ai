/**
 * Admin API for Rate Limiting Management
 * 
 * Provides endpoints for monitoring and managing AI rate limits
 * Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { rateLimitMonitor } from '@/lib/ai/rate-limit-monitor';
import { costTracker } from '@/lib/ai/cost-tracker';
import { createDefaultRateLimitManager } from '@/lib/ai/rate-limiter';
import { rateLimitConfig } from '@/lib/ai/rate-limit-config';
import { logger } from '@/lib/logging';
import { prisma } from '@/lib/db/connection';

/**
 * Check if user is admin
 */
async function checkAdminAuth(): Promise<string | null> {
  try {
    const { userId } = auth();
    if (!userId) {
      return null;
    }

    // Check if user is admin (you may need to adjust this based on your admin system)
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      return null;
    }

    const user = await prisma.user.findFirst({
      where: { 
        authProviderId: userId,
        email: adminEmail
      }
    });

    return user ? userId : null;
  } catch (error) {
    logger.error('Admin auth check failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * GET /api/admin/rate-limits - Get rate limiting overview and metrics
 */
export async function GET(request: NextRequest) {
  try {
    const adminUserId = await checkAdminAuth();
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const timeWindow = (searchParams.get('timeWindow') || 'day') as 'hour' | 'day' | 'week';
    const userId = searchParams.get('userId');

    switch (action) {
      case 'metrics':
        const metrics = await rateLimitMonitor.getMetrics(timeWindow);
        return NextResponse.json({ metrics });

      case 'patterns':
        const patterns = await rateLimitMonitor.analyzeUsagePatterns();
        return NextResponse.json({ patterns });

      case 'health':
        const healthReport = await rateLimitMonitor.generateHealthReport();
        return NextResponse.json(healthReport);

      case 'config':
        const config = rateLimitConfig.getConfiguration();
        return NextResponse.json({ config });

      case 'user-status':
        if (!userId) {
          return NextResponse.json({ error: 'userId parameter required' }, { status: 400 });
        }
        
        const rateLimitManager = createDefaultRateLimitManager();
        const [rateLimitStatus, costSummary] = await Promise.all([
          rateLimitManager.getRateLimitStatus(userId),
          costTracker.getCostSummary(userId)
        ]);
        
        return NextResponse.json({
          userId,
          rateLimitStatus,
          costSummary
        });

      case 'violations':
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        
        const violations = await prisma.rateLimitViolation.findMany({
          where: userId ? { userId } : undefined,
          orderBy: { timestamp: 'desc' },
          skip: offset,
          take: limit,
          include: {
            userId: true
          }
        });

        const totalViolations = await prisma.rateLimitViolation.count({
          where: userId ? { userId } : undefined
        });

        return NextResponse.json({
          violations,
          pagination: {
            total: totalViolations,
            offset,
            limit,
            hasMore: offset + limit < totalViolations
          }
        });

      default:
        // Return overview by default
        const [overviewMetrics, overviewPatterns] = await Promise.all([
          rateLimitMonitor.getMetrics('day'),
          rateLimitMonitor.analyzeUsagePatterns()
        ]);

        return NextResponse.json({
          metrics: overviewMetrics,
          patterns: overviewPatterns,
          configuration: {
            enabled: rateLimitConfig.isRateLimitingEnabled(),
            costTracking: rateLimitConfig.isCostTrackingEnabled()
          }
        });
    }

  } catch (error) {
    logger.error('Rate limits API GET failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/rate-limits - Administrative actions
 */
export async function POST(request: NextRequest) {
  try {
    const adminUserId = await checkAdminAuth();
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, userId, config } = body;

    switch (action) {
      case 'reset-user-limits':
        if (!userId) {
          return NextResponse.json({ error: 'userId required' }, { status: 400 });
        }

        const rateLimitManager = createDefaultRateLimitManager();
        
        // Reset rate limits for user
        const userKey = `user:${userId}`;
        const limitTypes = ['requests_per_hour', 'tokens_per_hour', 'cost_per_hour'];
        
        for (const limitType of limitTypes) {
          await rateLimitManager.tokenBucket.resetRateLimit(`${userKey}:${limitType}`);
        }

        logger.info('User rate limits reset', {
          adminUserId,
          targetUserId: userId,
          action: 'reset-user-limits'
        });

        return NextResponse.json({ 
          success: true, 
          message: `Rate limits reset for user ${userId}` 
        });

      case 'reset-budget':
        if (!userId) {
          return NextResponse.json({ error: 'userId required' }, { status: 400 });
        }

        await costTracker.resetBudgetUsage(userId);

        logger.info('User budget reset', {
          adminUserId,
          targetUserId: userId,
          action: 'reset-budget'
        });

        return NextResponse.json({ 
          success: true, 
          message: `Budget reset for user ${userId}` 
        });

      case 'update-config':
        if (!config) {
          return NextResponse.json({ error: 'config required' }, { status: 400 });
        }

        rateLimitConfig.updateConfiguration(config);

        logger.info('Rate limit configuration updated', {
          adminUserId,
          updates: Object.keys(config),
          action: 'update-config'
        });

        return NextResponse.json({ 
          success: true, 
          message: 'Configuration updated successfully',
          newConfig: rateLimitConfig.getConfiguration()
        });

      case 'cleanup-violations':
        const retentionDays = body.retentionDays || 30;
        const deletedCount = await rateLimitMonitor.cleanupOldViolations(retentionDays);

        logger.info('Rate limit violations cleaned up', {
          adminUserId,
          deletedCount,
          retentionDays,
          action: 'cleanup-violations'
        });

        return NextResponse.json({
          success: true,
          message: `Cleaned up ${deletedCount} old violation records`,
          deletedCount
        });

      case 'emergency-shutdown':
        // Emergency shutdown of AI operations (updates config to disable)
        rateLimitConfig.updateConfiguration({
          behavior: {
            ...rateLimitConfig.getBehaviorConfig(),
            enableRateLimiting: true,
            enableCostTracking: true,
            // Set very restrictive limits
            alertThreshold: 0.01
          }
        });

        logger.warn('Emergency AI rate limiting activated', {
          adminUserId,
          action: 'emergency-shutdown',
          timestamp: new Date().toISOString()
        });

        return NextResponse.json({
          success: true,
          message: 'Emergency rate limiting activated - AI operations severely restricted'
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    logger.error('Rate limits API POST failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/rate-limits - Delete specific violation records
 */
export async function DELETE(request: NextRequest) {
  try {
    const adminUserId = await checkAdminAuth();
    if (!adminUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const violationId = searchParams.get('violationId');
    const userId = searchParams.get('userId');

    if (violationId) {
      // Delete specific violation
      await prisma.rateLimitViolation.delete({
        where: { id: violationId }
      });

      logger.info('Rate limit violation deleted', {
        adminUserId,
        violationId,
        action: 'delete-violation'
      });

      return NextResponse.json({
        success: true,
        message: 'Violation record deleted'
      });
    } else if (userId) {
      // Delete all violations for a user
      const result = await prisma.rateLimitViolation.deleteMany({
        where: { userId }
      });

      logger.info('User rate limit violations deleted', {
        adminUserId,
        targetUserId: userId,
        deletedCount: result.count,
        action: 'delete-user-violations'
      });

      return NextResponse.json({
        success: true,
        message: `Deleted ${result.count} violation records for user`,
        deletedCount: result.count
      });
    } else {
      return NextResponse.json({ error: 'violationId or userId required' }, { status: 400 });
    }

  } catch (error) {
    logger.error('Rate limits API DELETE failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}