import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
import { generateSecureExecutionId } from '@/lib/security/secure-random';
import { CronAuthService } from '@/lib/cron/auth-service';
import { getPrismaClient } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const trialLogger = logger.child('check-trial-expiration');

/**
 * GET /api/cron/check-trial-expiration
 * Daily cron job to check for expired trials and process them directly.
 * Marks expired users as not trialing and sends expiration notification emails.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const executionId =
    request.headers.get('x-execution-id') ||
    generateSecureExecutionId('trial');

  trialLogger.info(`[${executionId}] Trial expiration check triggered`);

  try {
    // Validate authentication
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      trialLogger.warn(`[${executionId}] Authentication failed`, {
        error: authResult.error,
        clientIP: authResult.clientIP,
      });

      return NextResponse.json(
        {
          success: false,
          error: authResult.error || 'Authentication failed',
          executionId,
          duration: Date.now() - startTime,
        },
        {
          status: authResult.error?.includes('Rate limit')
            ? 429
            : authResult.error?.includes('IP not allowed')
              ? 403
              : 401,
        }
      );
    }

    // Query for expired trials
    const prisma = getPrismaClient();
    const now = new Date();

    const expiredTrials = await prisma.user.findMany({
      where: {
        isTrialing: true,
        trialEndsAt: {
          lte: now,
        },
      },
      select: {
        id: true,
        email: true,
        trialEndsAt: true,
      },
    });

    trialLogger.info(
      `[${executionId}] Found ${expiredTrials.length} expired trials`
    );

    // Process each expired trial directly
    let processed = 0;
    let emailsSent = 0;
    const errors: string[] = [];

    for (const user of expiredTrials) {
      try {
        const { handleTrialExpiration } = await import(
          '@/lib/cron/handlers/trial-expiration-handler'
        );
        const result = await handleTrialExpiration({
          userId: user.id,
          userEmail: user.email,
          trialExpiresAt: user.trialEndsAt!.toISOString(),
          executionId,
        });

        if (result.success) {
          processed++;
          if (result.emailSent) emailsSent++;
        } else if (result.error) {
          errors.push(`${user.id}: ${result.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${user.id}: ${msg}`);
        trialLogger.error(
          `[${executionId}] Failed to process trial expiration for ${user.id}`,
          { error: msg }
        );
      }
    }

    const duration = Date.now() - startTime;

    trialLogger.info(`[${executionId}] Trial expiration check completed`, {
      expiredTrialsFound: expiredTrials.length,
      processed,
      emailsSent,
      errors: errors.length,
      duration,
    });

    return NextResponse.json(
      {
        success: true,
        executionId,
        duration,
        expiredTrials: expiredTrials.length,
        processed,
        emailsSent,
        errors: errors.length > 0 ? errors : undefined,
      },
      {
        headers: {
          'X-Execution-ID': executionId,
          'X-Processed': String(processed),
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    trialLogger.error(`[${executionId}] Trial expiration check failed`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal system error',
        executionId,
        duration,
      },
      { status: 500 }
    );
  }
}
