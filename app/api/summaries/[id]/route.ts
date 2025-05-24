import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { getMockSummaries } from '@/lib/api/summary-service';
import { checkSummaryAccess, AccessDeniedError, ResourceNotFoundError, createRedactedSummary } from '@/lib/auth/access-control';
import { logger } from '@/lib/logging';

interface Params {
  id: string;
}

export async function GET(
  req: Request,
  { params }: { params: Params }
) {
  try {
    const id = params.id;
    const user = await currentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // In a real implementation, we would fetch from the database
    // For the MVP, we're using mock data
    const summaries = getMockSummaries();
    const summary = summaries.find(s => s.id === id);

    if (!summary) {
      logger.warn('Summary not found', { summaryId: id });
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 404 }
      );
    }

    try {
      // Check if user has access to this summary
      await checkSummaryAccess(id);
      
      // User has access, return the full summary
      return NextResponse.json({ summary });
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        // Return a redacted version of the summary with limited information
        const redactedSummary = createRedactedSummary(summary);
        return NextResponse.json(
          { 
            summary: redactedSummary,
            error: 'Access denied',
            message: 'To view this summary, add this ticker to your watchlist.' 
          },
          { status: 403 }
        );
      }
      
      if (error instanceof ResourceNotFoundError) {
        return NextResponse.json(
          { error: 'Summary not found' },
          { status: 404 }
        );
      }
      
      // For other errors, return a generic error
      logger.error('Error checking summary access', { error, summaryId: id });
      return NextResponse.json(
        { error: 'Failed to access summary' },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('Error in summary API', { error, params });
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    );
  }
} 