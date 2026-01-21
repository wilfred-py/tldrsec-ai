/**
 * Final Backup Cron Endpoint
 *
 * Phase 7 of the Eliminate Manual Pipeline Intervention plan.
 * This is the last-resort backup that runs via Vercel cron every 30 minutes.
 * It only executes the pipeline if NO executions have occurred in the last 25 minutes
 * (from either primary Cloudflare Worker, watchdog backup, or any other source).
 *
 * Execution flow:
 * 1. Check for recent executions in CronJobExecution table
 * 2. If found, skip execution (another source is handling it)
 * 3. If not found, this is an emergency - send alert and run pipeline
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 7
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

/**
 * Authentication check for cron endpoint
 */
function authenticateRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // Check Bearer authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Check query parameter (for Vercel cron)
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret === cronSecret) {
    return true;
  }

  return false;
}

/**
 * Check for any recent pipeline executions
 */
async function getRecentExecution() {
  const { getPrismaClient } = await import('@/lib/db/prisma');
  const prisma = getPrismaClient();

  const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000);

  return prisma.cronJobExecution.findFirst({
    where: {
      triggeredAt: { gte: twentyFiveMinutesAgo },
    },
    orderBy: { triggeredAt: 'desc' },
  });
}

/**
 * Send emergency Slack alert
 */
async function sendEmergencyAlert(): Promise<void> {
  const webhookUrl =
    process.env.SLACK_ALERTS_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text:
          `:sos: *EMERGENCY: Final Backup Triggered*\n\n` +
          `No pipeline executions detected in the last 25 minutes!\n` +
          `Both primary Cloudflare Worker and watchdog appear to have failed.\n\n` +
          `*Running emergency pipeline now...*`,
      }),
    });
  } catch (error) {
    console.error('[FinalBackup] Failed to send Slack alert:', error);
    // Continue execution - alert failure should not prevent pipeline execution
  }
}

/**
 * Trigger the tier-aware pipeline via HTTP
 */
async function triggerPipeline(): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
  const cronSecret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${baseUrl}/api/cron/tier-aware?source=final-backup`, {
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'x-final-backup-source': 'true',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Pipeline trigger failed: ${response.status} - ${(errorData as { error?: string }).error || 'Unknown error'}`,
      };
    }

    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: `Pipeline trigger error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Log execution to database
 */
async function logExecution(result: unknown): Promise<void> {
  const { getPrismaClient } = await import('@/lib/db/prisma');
  const prisma = getPrismaClient();

  await prisma.cronJobExecution.create({
    data: {
      jobType: 'sec-filing-monitor',
      source: 'final-backup',
      triggeredAt: new Date(),
      completedAt: new Date(),
      status: 'COMPLETED',
      metadata: { result },
    },
  });
}

/**
 * Final backup cron handler
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Authentication
  if (!authenticateRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check for any recent execution
    const recentExecution = await getRecentExecution();

    if (recentExecution) {
      // Recent execution found - skip this backup run
      console.log(
        `[FinalBackup] Skipping - recent execution found from ${recentExecution.source} at ${recentExecution.triggeredAt}`
      );

      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Recent execution found',
        lastExecution: recentExecution.triggeredAt,
        source: recentExecution.source,
      });
    }

    // No recent execution - this is an emergency!
    console.log(
      '[FinalBackup] No recent executions found - triggering emergency pipeline'
    );

    // Send emergency Slack alert (fire and forget - don't await)
    await sendEmergencyAlert();

    // Trigger the pipeline
    const pipelineResult = await triggerPipeline();

    if (!pipelineResult.success) {
      console.error('[FinalBackup] Pipeline trigger failed:', pipelineResult.error);
      return NextResponse.json(
        {
          success: false,
          error: pipelineResult.error,
        },
        { status: 500 }
      );
    }

    // Log execution to database
    await logExecution(pipelineResult.result);

    return NextResponse.json({
      success: true,
      source: 'final-backup',
      result: pipelineResult.result,
    });
  } catch (error) {
    console.error('[FinalBackup] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
