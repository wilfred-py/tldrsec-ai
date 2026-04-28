/**
 * Enrichment Ledger Retention Cron
 *
 * Deletes EnrichmentSpendEntry + EnrichmentSpend rows older than 90 days
 * (Decision 14A — see tasks/x-sentiment-budget-implementation.md).
 *
 * Cap unbounded ledger growth: ~10 entries/day × 365 = 3.6k rows/year worst
 * case is fine for raw size, but we still bound disk + index sprawl. The
 * circuit-breaker table is unaffected (no date column, persistent state).
 *
 * Idempotent: re-running deletes nothing more once cutoff is enforced.
 * Authentication: HMAC signature validation (same pattern as weekly-digest).
 *
 * Schedule: dispatched daily at 00:00 UTC by `cloudflare-cron/index.js`'s
 * `handleDailyTasks` fan-out.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { CronAuthService } from '../../../../lib/cron/auth-service';
import { getPrismaClient } from '../../../../lib/db/prisma';
import { monitoring } from '../../../../lib/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cronLogger = logger.child('enrichment-ledger-cleanup-cron');

const RETENTION_DAYS = 90;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const executionId =
    request.headers.get('x-execution-id') || `enrichment-cleanup-${Date.now()}`;

  const authResult = await CronAuthService.validateCronRequest(request);
  if (!authResult.isValid) {
    cronLogger.warn(`[${executionId}] Authentication failed`, {
      error: authResult.error,
      clientIP: authResult.clientIP,
    });
    return NextResponse.json(
      { error: 'Unauthorized', message: authResult.error },
      { status: 401 },
    );
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString().split('T')[0];

  cronLogger.info(`[${executionId}] Pruning enrichment ledger`, { cutoffIso, retentionDays: RETENTION_DAYS });

  try {
    const prisma = getPrismaClient();

    // Delete child entries first; FK has onDelete: Cascade so deleting parents
    // would also work, but the explicit two-step makes the counter accurate.
    const entriesDeleted = await prisma.enrichmentSpendEntry.deleteMany({
      where: { dateIso: { lt: cutoffIso } },
    });
    const spendDeleted = await prisma.enrichmentSpend.deleteMany({
      where: { dateIso: { lt: cutoffIso } },
    });

    monitoring.incrementCounter('ai.enrichment_ledger_pruned', entriesDeleted.count, {
      table: 'EnrichmentSpendEntry',
    });
    monitoring.incrementCounter('ai.enrichment_ledger_pruned', spendDeleted.count, {
      table: 'EnrichmentSpend',
    });

    const durationMs = Date.now() - startTime;
    cronLogger.info(`[${executionId}] Prune complete`, {
      cutoffIso,
      entriesDeleted: entriesDeleted.count,
      spendDeleted: spendDeleted.count,
      durationMs,
    });

    return NextResponse.json(
      {
        success: true,
        executionId,
        cutoffIso,
        entriesDeleted: entriesDeleted.count,
        spendDeleted: spendDeleted.count,
        durationMs,
      },
      { status: 200 },
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    cronLogger.error(`[${executionId}] Prune failed`, {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
    });

    return NextResponse.json(
      { success: false, executionId, error: message, durationMs },
      { status: 500 },
    );
  }
}
