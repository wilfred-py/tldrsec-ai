import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';
import { TickerResolver } from '@/lib/sec-edgar/ticker-service';
import { logger } from '@/lib/logging';

const prisma = new PrismaClient();
const tickerResolver = new TickerResolver({ prisma });

// Define the ticker interface based on what's in the database - currently unused
/*
interface TickerData {
  id: string;
  symbol: string;
  companyName: string;
  cik: string;
  exchangeCodes: string[];
  aliases?: string[];
}
*/

/**
 * GET /api/tickers/search
 * Search for tickers by symbol or company name
 * Query parameters:
 * - q: Search query (required)
 * - limit: Maximum number of results (default: 10)
 */
export async function GET(request: NextRequest) {
  try {
    // Get current user
    const user = await currentUser();
    
    // If no user, return unauthorized
    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }
    
    // Get search query from URL
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    // If no query, return error
    if (!query || query.length < 2) {
      return NextResponse.json({
        success: false,
        message: 'Search query must be at least 2 characters'
      }, { status: 400 });
    }
    
    // Search for tickers in database
    const tickers = await prisma.ticker.findMany({
      where: {
        OR: [
          // Search by ticker symbol
          { symbol: { contains: query.toUpperCase(), mode: 'insensitive' } },
          // Search by company name
          { companyName: { contains: query, mode: 'insensitive' } },
          // Search by aliases
          { aliases: { has: query.toUpperCase() } }
        ]
      },
      take: limit,
      orderBy: [
        // Exact matches first
        { symbol: { sort: 'asc', mode: 'insensitive' } },
        // Then by company name
        { companyName: { sort: 'asc', mode: 'insensitive' } }
      ]
    });
    
    // If no results and query is a valid ticker format, try to resolve it
    if (tickers.length === 0 && /^[A-Za-z]{1,5}$/.test(query)) {
      try {
        const resolution = await tickerResolver.resolveTicker(query, {
          createIfNotExists: true,
          fuzzyMatch: true
        });
        
        if (resolution.success && resolution.cik) {
          // Return the resolved ticker
          return NextResponse.json({
            success: true,
            results: [{
              symbol: resolution.normalizedTicker,
              companyName: resolution.companyName || 'Unknown Company',
              cik: resolution.cik,
              isResolved: true
            }]
          });
        }
      } catch (error) {
        logger.warn('Error resolving ticker during search', { error });
        // Continue with empty results
      }
    }
    
    // Format results
    const results = tickers.map((ticker: { id: string; symbol: string; companyName: string; cik: string; exchangeCodes: string[] }) => ({
      id: ticker.id,
      symbol: ticker.symbol,
      companyName: ticker.companyName,
      cik: ticker.cik,
      exchangeCodes: ticker.exchangeCodes
    }));
    
    // Return results
    return NextResponse.json({
      success: true,
      results
    });
  } catch (error) {
    // Log error
    logger.error('Error searching tickers', error);
    
    // Return error response
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error searching tickers'
    }, { status: 500 });
  }
} 