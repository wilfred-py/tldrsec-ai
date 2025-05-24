import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { getMockSummaries } from '@/lib/api/summary-service';
import { logger } from '@/lib/logging';

export async function GET(req: Request) {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get URL parameters for filtering
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const ticker = searchParams.get('ticker');
    const filingType = searchParams.get('filingType');

    // In a real implementation, we would fetch from the database with filtering
    // For the MVP, we're using mock data and filtering in memory
    let summaries = getMockSummaries();

    // Get user's tickers to filter by permission
    const userTickers = await prisma.ticker.findMany({
      where: { userId: user.id },
      select: { symbol: true }
    });

    const userTickerSymbols = userTickers.map(t => t.symbol);

    // Filter summaries to only show those for tickers the user is tracking
    summaries = summaries.filter(summary => 
      userTickerSymbols.includes(summary.ticker.symbol)
    );

    // Apply additional filters if provided
    if (ticker) {
      summaries = summaries.filter(s => 
        s.ticker.symbol.toLowerCase() === ticker.toLowerCase()
      );
    }

    if (filingType) {
      summaries = summaries.filter(s => 
        s.filingType.toLowerCase() === filingType.toLowerCase()
      );
    }

    // Apply limit (sort by filing date descending first)
    summaries = summaries
      .sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime())
      .slice(0, limit);

    // Log access for audit
    logger.info('User accessed summaries list', { 
      userId: user.id,
      count: summaries.length,
      filters: { ticker, filingType, limit }
    });

    return NextResponse.json({ summaries });
  } catch (error) {
    logger.error('Error fetching summaries list', { error });
    return NextResponse.json(
      { error: 'Failed to fetch summaries' },
      { status: 500 }
    );
  }
} 