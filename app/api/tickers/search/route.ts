import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';
import { TickerResolver } from '@/lib/sec-edgar/ticker-service';
import { logger } from '@/lib/logging';
import { z } from 'zod';

// Input validation schema
const searchQuerySchema = z.object({
  q: z.string().min(2).max(100).regex(/^[a-zA-Z0-9\s\-&.]+$/, 'Invalid characters in search query'),
  limit: z.coerce.number().min(1).max(50).default(10)
});

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
    
    // Get search query from URL and validate
    const { searchParams } = new URL(request.url);
    const rawParams = {
      q: searchParams.get('q'),
      limit: searchParams.get('limit')
    };
    
    // Validate input parameters
    const validationResult = searchQuerySchema.safeParse(rawParams);
    if (!validationResult.success) {
      return NextResponse.json({
        success: false,
        message: 'Invalid search parameters',
        errors: validationResult.error.issues.map(issue => issue.message)
      }, { status: 400 });
    }
    
    const { q: query, limit } = validationResult.data;
    
    // Sanitize input to prevent injection
    const sanitizedQuery = query.trim().replace(/[%_\\]/g, '\\$&');
    const normalizedSymbol = sanitizedQuery.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Search for tickers in database with parameterized queries
    const tickers = await prisma.ticker.findMany({
      where: {
        OR: [
          // Search by ticker symbol - only alphanumeric
          { 
            symbol: { 
              contains: normalizedSymbol.length > 0 ? normalizedSymbol : sanitizedQuery, 
              mode: 'insensitive' 
            } 
          },
          // Search by company name - sanitized input
          { companyName: { contains: sanitizedQuery, mode: 'insensitive' } },
          // Search by aliases - normalized
          { aliases: { has: normalizedSymbol.length > 0 ? normalizedSymbol : sanitizedQuery.toUpperCase() } }
        ]
      },
      take: Math.min(limit, 50), // Cap limit to prevent DoS
      orderBy: [
        // Exact matches first
        { symbol: 'asc' },
        // Then by company name
        { companyName: 'asc' }
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