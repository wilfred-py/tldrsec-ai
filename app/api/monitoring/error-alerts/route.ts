import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { getAuth } from '@clerk/nextjs/server';

/**
 * Error Alerts Management API
 * Handles creation, retrieval, and management of system alerts
 */

interface CreateAlertRequest {
  alertType: 'critical' | 'warning' | 'info';
  source: 'pipeline' | 'api' | 'database' | 'external';
  message: string;
  errorCode?: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
}

interface AlertUpdateRequest {
  resolved?: boolean;
  acknowledgedBy?: string;
}

/**
 * GET /api/monitoring/error-alerts
 * Retrieves error alerts with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    const user = await getPrismaClient().user.findUnique({
      where: { authProviderId: userId },
      select: { subscriptionTier: true }
    });

    if (!user || !['ENTERPRISE', 'INSTITUTION'].includes(user.subscriptionTier)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const alertType = url.searchParams.get('alertType');
    const source = url.searchParams.get('source');
    const resolved = url.searchParams.get('resolved');
    const _severity = url.searchParams.get('severity');

    // Build filter conditions
    const where: Record<string, unknown> = {};
    if (alertType) where.alertType = alertType;
    if (source) where.source = source;
    if (resolved !== null) where.resolved = resolved === 'true';

    // Get total count for pagination
    const totalCount = await getPrismaClient().errorAlert.count({ where });

    // Get alerts with pagination
    const alerts = await getPrismaClient().errorAlert.findMany({
      where,
      orderBy: [
        { resolved: 'asc' }, // Unresolved first
        { createdAt: 'desc' }
      ],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        alertType: true,
        source: true,
        message: true,
        errorCode: true,
        context: true,
        resolved: true,
        resolvedAt: true,
        notifiedAt: true,
        escalatedAt: true,
        acknowledgedAt: true,
        acknowledgedBy: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Get summary statistics
    const stats = await getAlertStatistics();

    return NextResponse.json({
      alerts,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      },
      statistics: stats
    });

  } catch (error) {
    console.error('Failed to retrieve alerts:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve alerts' }, 
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/error-alerts
 * Creates a new error alert
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateAlertRequest = await request.json();

    // Validate required fields
    if (!body.alertType || !body.source || !body.message) {
      return NextResponse.json(
        { error: 'Missing required fields: alertType, source, message' }, 
        { status: 400 }
      );
    }

    // Check for duplicate alerts (prevent spam)
    const recentSimilarAlert = await getPrismaClient().errorAlert.findFirst({
      where: {
        source: body.source,
        message: body.message,
        resolved: false,
        createdAt: {
          gte: new Date(Date.now() - 15 * 60 * 1000) // Last 15 minutes
        }
      }
    });

    if (recentSimilarAlert) {
      return NextResponse.json({
        message: 'Similar alert already exists',
        alertId: recentSimilarAlert.id,
        deduplication: true
      });
    }

    // Create the alert
    const alert = await getPrismaClient().errorAlert.create({
      data: {
        alertType: body.alertType,
        source: body.source,
        message: body.message,
        errorCode: body.errorCode,
        stackTrace: body.stackTrace,
        context: body.context
      }
    });

    // Trigger notification for critical alerts
    if (body.alertType === 'critical') {
      await triggerImmediateNotification(alert);
    }

    return NextResponse.json({
      success: true,
      alertId: alert.id,
      createdAt: alert.createdAt
    }, { status: 201 });

  } catch (error) {
    console.error('Failed to create alert:', error);
    return NextResponse.json(
      { error: 'Failed to create alert' }, 
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/monitoring/error-alerts/[id]
 * Updates an existing alert (acknowledge, resolve, etc.)
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const alertId = url.pathname.split('/').pop();
    
    if (!alertId) {
      return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
    }

    const body: AlertUpdateRequest = await request.json();

    // Get user info for acknowledgment
    const user = await getPrismaClient().user.findUnique({
      where: { authProviderId: userId },
      select: { email: true, name: true }
    });

    const updateData: Record<string, unknown> = {};
    
    if (body.resolved !== undefined) {
      updateData.resolved = body.resolved;
      if (body.resolved) {
        updateData.resolvedAt = new Date();
      }
    }

    if (body.acknowledgedBy || updateData.resolved) {
      updateData.acknowledgedAt = new Date();
      updateData.acknowledgedBy = body.acknowledgedBy || user?.email || userId;
    }

    const updatedAlert = await getPrismaClient().errorAlert.update({
      where: { id: alertId },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      alert: updatedAlert
    });

  } catch (error) {
    console.error('Failed to update alert:', error);
    return NextResponse.json(
      { error: 'Failed to update alert' }, 
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/monitoring/error-alerts/[id]
 * Deletes an alert (admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    const user = await getPrismaClient().user.findUnique({
      where: { authProviderId: userId },
      select: { subscriptionTier: true }
    });

    if (!user || user.subscriptionTier !== 'ENTERPRISE') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const alertId = url.pathname.split('/').pop();
    
    if (!alertId) {
      return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
    }

    await getPrismaClient().errorAlert.delete({
      where: { id: alertId }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to delete alert:', error);
    return NextResponse.json(
      { error: 'Failed to delete alert' }, 
      { status: 500 }
    );
  }
}

async function getAlertStatistics() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    unresolvedCount,
    last24hCount,
    criticalCount,
    sourceBreakdown,
    typeBreakdown
  ] = await Promise.all([
    getPrismaClient().errorAlert.count({
      where: { resolved: false }
    }),
    getPrismaClient().errorAlert.count({
      where: { 
        createdAt: { gte: twentyFourHoursAgo }
      }
    }),
    getPrismaClient().errorAlert.count({
      where: { 
        alertType: 'critical',
        resolved: false
      }
    }),
    getPrismaClient().errorAlert.groupBy({
      by: ['source'],
      where: { 
        createdAt: { gte: twentyFourHoursAgo }
      },
      _count: { id: true }
    }),
    getPrismaClient().errorAlert.groupBy({
      by: ['alertType'],
      where: { 
        createdAt: { gte: twentyFourHoursAgo }
      },
      _count: { id: true }
    })
  ]);

  return {
    unresolved: unresolvedCount,
    last24Hours: last24hCount,
    criticalActive: criticalCount,
    bySource: Object.fromEntries(
      sourceBreakdown.map(item => [item.source, item._count.id])
    ),
    byType: Object.fromEntries(
      typeBreakdown.map(item => [item.alertType, item._count.id])
    )
  };
}

async function triggerImmediateNotification(alert: { id: string; source: string; message: string; createdAt: Date }) {
  try {
    // This would integrate with the existing email system
    // For now, we'll just log it - actual implementation would use the email service
    console.warn('CRITICAL ALERT TRIGGERED:', {
      id: alert.id,
      source: alert.source,
      message: alert.message,
      timestamp: alert.createdAt
    });

    // Update notification timestamp
    await getPrismaClient().errorAlert.update({
      where: { id: alert.id },
      data: { notifiedAt: new Date() }
    });

    // TODO: Integrate with existing email notification system
    // This could call the email service to send alerts to administrators

  } catch (error) {
    console.error('Failed to send alert notification:', error);
  }
}