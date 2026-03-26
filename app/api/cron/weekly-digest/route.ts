/**
 * Weekly Digest Cron Endpoint
 *
 * Sends a weekly SEC filing digest email to all active users.
 * Designed to be triggered every day by Cloudflare Worker or Vercel Cron,
 * but only executes on Sundays (UTC). Non-Sunday calls return early.
 *
 * Authentication: HMAC signature validation (same as tier-aware route).
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { CronAuthService } from '../../../../lib/cron/auth-service';
import { handleWeeklyDigest } from '../../../../lib/cron/handlers/weekly-digest-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cronLogger = logger.child('weekly-digest-cron');

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || `weekly-digest-${Date.now()}`;

  // Step 1: Authenticate
  const authResult = await CronAuthService.validateCronRequest(request);
  if (!authResult.isValid) {
    cronLogger.warn(`[${executionId}] Authentication failed`, {
      error: authResult.error,
      clientIP: authResult.clientIP,
    });
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 }
    );
  }

  // Step 2: Sunday gate (UTC)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  if (dayOfWeek !== 0) {
    cronLogger.debug(`[${executionId}] Not Sunday (UTC day=${dayOfWeek}), skipping`);
    return NextResponse.json(
      {
        skipped: true,
        reason: 'not Sunday',
        utcDay: dayOfWeek,
        executionId,
      },
      { status: 200 }
    );
  }

  // Step 3: Execute the digest handler
  cronLogger.info(`[${executionId}] Starting weekly digest (Sunday UTC)`);

  try {
    const result = await handleWeeklyDigest();

    const durationMs = Date.now() - startTime;

    cronLogger.info(`[${executionId}] Weekly digest complete`, {
      ...result,
      totalDurationMs: durationMs,
    });

    const status = result.success ? 200 : 207; // 207 Multi-Status if partial errors

    return NextResponse.json(
      {
        success: result.success,
        executionId,
        usersProcessed: result.usersProcessed,
        usersSkipped: result.usersSkipped,
        emailsSent: result.emailsSent,
        errorCount: result.errors.length,
        durationMs,
      },
      { status }
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    cronLogger.error(`[${executionId}] Weekly digest failed`, {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
    });

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: message,
        durationMs,
      },
      { status: 500 }
    );
  }
}
