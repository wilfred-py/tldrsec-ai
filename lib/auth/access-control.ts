import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
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
 * Check if a user has access to a specific summary
 * @param summaryId The ID of the summary to check
 * @param requiredLevel The required access level (defaults to VIEW)
 * @returns Promise resolving to true if access is allowed, throws error otherwise
 */
export async function checkSummaryAccess(
  summaryId: string,
  requiredLevel: AccessLevel = AccessLevel.VIEW
): Promise<boolean> {
  try {
    // Get the current user from clerk
    const user = await currentUser();
    
    if (!user) {
      logger.warn('Unauthenticated access attempt to summary', { summaryId });
      logSummaryAccess(null, summaryId, false, { reason: 'unauthenticated' });
      throw new AccessDeniedError('Authentication required');
    }
    
    // Find the summary with its ticker
    const summary = await prisma.summary.findUnique({
      where: { id: summaryId },
      include: { ticker: true }
    });
    
    if (!summary) {
      logger.warn('Summary not found', { summaryId });
      logSummaryAccess(user.id, summaryId, false, { reason: 'not_found' });
      throw new ResourceNotFoundError('Summary not found');
    }
    
    // Check if user has access to this ticker
    const userTicker = await prisma.ticker.findFirst({
      where: {
        userId: user.id,
        symbol: summary.ticker.symbol
      }
    });
    
    // User doesn't track this ticker, deny access
    if (!userTicker) {
      logger.warn('User accessing summary for untracked ticker', { 
        userId: user.id, 
        summaryId, 
        tickerSymbol: summary.ticker.symbol 
      });
      logSummaryAccess(user.id, summaryId, false, {
        reason: 'untracked_ticker',
        tickerSymbol: summary.ticker.symbol,
        filingType: summary.filingType
      });
      throw new AccessDeniedError('You do not have access to this summary');
    }
    
    // For now, if a user tracks a ticker, they have full access to its summaries
    // More granular permissions can be added here in the future
    
    // For audit logging
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
    
    // Log unexpected errors
    logger.error('Error checking summary access', { error });
    throw new AccessDeniedError('Error checking permissions');
  }
}

/**
 * Create a redacted version of a summary for unauthorized users
 * Shows basic metadata but hides sensitive content
 * @param summary The original summary
 * @returns A redacted version of the summary
 */
export function createRedactedSummary(summary: any) {
  return {
    id: summary.id,
    filingType: summary.filingType,
    filingDate: summary.filingDate,
    ticker: {
      symbol: summary.ticker.symbol,
      companyName: summary.ticker.companyName
    },
    // Redact sensitive content
    summaryText: 'You do not have permission to view this summary.',
    summaryJSON: null,
    // Add message about how to gain access
    accessDeniedReason: 'To view this summary, add this ticker to your watchlist.',
    isRedacted: true
  };
} 