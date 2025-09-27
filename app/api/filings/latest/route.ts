import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * API endpoint to get the latest filing for each ticker
 * POST /api/filings/latest
 * Body: { tickers: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const authResult = await auth();
    const userId = authResult.userId;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get tickers from request body
    const body = await req.json();
    const { tickers } = body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request. Tickers array is required.' },
        { status: 400 }
      );
    }

    // Get the latest filing for each ticker
    const latestFilings = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          // Find the ticker in the database
          const tickerRecord = await prisma.ticker.findFirst({
            where: {
              symbol: ticker
            }
          });

          if (!tickerRecord) {
            return {
              ticker,
              filingDate: null,
              formType: null
            };
          }

          // Find the latest filing for this ticker
          const summary = await prisma.summary.findFirst({
            where: {
              tickerId: tickerRecord.id
            },
            orderBy: {
              filingDate: 'desc'
            },
            select: {
              id: true,
              filingType: true,
              filingDate: true,
              ticker: {
                select: {
                  symbol: true
                }
              }
            }
          });

          if (!summary) {
            return {
              ticker,
              filingDate: null,
              formType: null
            };
          }

          return {
            ticker: summary.ticker.symbol,
            filingDate: summary.filingDate.toISOString(),
            formType: summary.filingType
          };
        } catch (err) {
          console.error(`Error fetching filing for ticker ${ticker}:`, err);
          return {
            ticker,
            filingDate: null,
            formType: null,
            error: 'Failed to fetch filing'
          };
        }
      })
    );

    return NextResponse.json({
      filings: latestFilings
    });
  } catch (error) {
    console.error('Error fetching latest filings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch latest filings' },
      { status: 500 }
    );
  }
}
