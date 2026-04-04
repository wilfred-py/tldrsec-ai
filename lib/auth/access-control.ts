import { currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { logger } from '@/lib/logging';
import { logSummaryAccess } from './audit-logger';

// Access level enum for permission checking
export enum AccessLevel {
  NONE = 'none',
  VIEW = 'view',
  EDIT = 'edit',
  ADMIN = 'admin'
}

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

/**
 * Check if a user has access to a specific summary.
 * Any authenticated user can view any summary — SEC filings are public data.
 * The value is in which summaries we surface, not in gating access.
 */
export async function checkSummaryAccess(
  summaryId: string,
  requiredLevel: AccessLevel = AccessLevel.VIEW
): Promise<boolean> {
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

    logSummaryAccess(user.id, summaryId, true, {
      tickerSymbol: summary.ticker.symbol,
      filingType: summary.filingType,
      accessLevel: requiredLevel
    });

    return true;
  } catch (error) {
    if (error instanceof AccessDeniedError || error instanceof ResourceNotFoundError) {
      throw error;
    }

    logger.error('Error checking summary access', { error });
    throw new AccessDeniedError('Error checking permissions');
  }
}
