import { currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { logger } from '@/lib/logging';
import type { Summary, Ticker } from '@prisma/client';

// Access level enum for permission checking
export enum AccessLevel {
  NONE = 'none',
  VIEW = 'view',
  EDIT = 'edit',
  ADMIN = 'admin'
}

export type SummaryWithTicker = Summary & { ticker: Ticker };

// Error types for access control
export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

export class ResourceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceNotFoundError';
  }
}

// Audit event names emitted from this module. Inlined from the deleted
// audit-logger module: only Summary access events were ever emitted, so the
// 9-member AuditEventType enum that lived alongside them was dead surface.
const AUDIT_EVENT_SUMMARY_VIEW = 'summary_view';
const AUDIT_EVENT_SUMMARY_ACCESS_DENIED = 'summary_access_denied';

function logSummaryAccess(
  userId: string | null,
  summaryId: string,
  wasSuccessful: boolean,
  metadata: Record<string, unknown> = {}
): void {
  const eventType = wasSuccessful
    ? AUDIT_EVENT_SUMMARY_VIEW
    : AUDIT_EVENT_SUMMARY_ACCESS_DENIED;
  const payload = {
    eventType,
    timestamp: new Date().toISOString(),
    userId: userId || 'anonymous',
    resourceId: summaryId,
    ...metadata,
  };
  if (wasSuccessful) {
    logger.info('Audit event', payload);
  } else {
    logger.warn('Security audit event', payload);
  }
}

/**
 * Check if a user has access to a specific summary and return the summary data.
 * Any authenticated user can view any summary — SEC filings are public data.
 * Returns the summary with ticker to avoid redundant DB queries in the caller.
 */
export async function checkSummaryAccess(
  summaryId: string,
  requiredLevel: AccessLevel = AccessLevel.VIEW
): Promise<SummaryWithTicker> {
  const prisma = getPrismaClient();

  try {
    const user = await currentUser();

    if (!user) {
      logger.warn('Unauthenticated access attempt to summary', { summaryId });
      logSummaryAccess(null, summaryId, false, { reason: 'unauthenticated' });
      throw new AccessDeniedError('Authentication required');
    }

    const summary = await prisma.summary.findUnique({
      where: { id: summaryId },
      include: { ticker: true }
    });

    if (!summary) {
      logger.warn('Summary not found', { summaryId });
      logSummaryAccess(user.id, summaryId, false, { reason: 'not_found' });
      throw new ResourceNotFoundError('Summary not found');
    }

    if (!summary.ticker) {
      logger.error('Summary has orphaned ticker reference', { summaryId, tickerId: summary.tickerId });
      logSummaryAccess(user.id, summaryId, false, { reason: 'orphaned_ticker' });
      throw new ResourceNotFoundError('Summary data is incomplete');
    }

    logSummaryAccess(user.id, summaryId, true, {
      tickerSymbol: summary.ticker.symbol,
      filingType: summary.filingType,
      accessLevel: requiredLevel
    });

    return summary;
  } catch (error) {
    if (error instanceof AccessDeniedError || error instanceof ResourceNotFoundError) {
      throw error;
    }

    logger.error('Error checking summary access', { error });
    throw new AccessDeniedError('Error checking permissions');
  }
}
