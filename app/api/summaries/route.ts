import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { getMockSummaries } from '@/lib/api/summary-service';
import { logger } from '@/lib/logging';
import { 
  applySecurityMiddleware,
  createErrorResponse,
  createSuccessResponse,
  logSecurityEvent
} from '@/lib/validation/middleware';
import { SummarySchemas } from '@/lib/validation/schemas/api-schemas';
import { getSecureDatabase } from '@/lib/db/secure-prisma';

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Apply comprehensive security validation
    const securityResult = await applySecurityMiddleware(
      req,
      SummarySchemas.query,
      {
        logSecurityEvents: true,
        timeoutMs: 30000
      }
    );
    
    // Check if security validation failed
    if (securityResult.response) {
      return securityResult.response;
    }
    
    // Extract validated parameters
    const { limit, ticker, filingType } = securityResult.data;
    
    const user = await currentUser();

    if (!user) {
      // Log authentication failure
      logSecurityEvent({
        type: 'auth_failure',
        ip: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString(),
        details: { reason: 'No authenticated user' }
      });
      
      return createErrorResponse('Authentication required', 401);
    }
    
    // Get secure database instance
    const secureDb = await getSecureDatabase();

    // Get summaries using secure database operations
    const summaryFilters: any = {
      userId: user.id,
      limit,
      offset: 0
    };
    
    if (ticker) {
      summaryFilters.ticker = ticker;
    }
    
    if (filingType) {
      summaryFilters.filingType = filingType;
    }
    
    // Use secure database operations
    const summaries = await secureDb.getSummaries(summaryFilters);
    
    // For backward compatibility with mock data during MVP
    if (summaries.length === 0) {
      // Fallback to mock data with secure filtering
      let mockSummaries = getMockSummaries();
      
      // Get user's tickers securely
      const securePrisma = secureDb.getPrisma();
      const userTickers = await securePrisma.findMany('ticker', {
        where: { userId: user.id },
        select: { symbol: true }
      });

      const userTickerSymbols = userTickers.map((t: any) => t.symbol);

      // Filter summaries to only show those for tickers the user is tracking
      mockSummaries = mockSummaries.filter(summary => 
        userTickerSymbols.includes(summary.ticker.symbol)
      );

      // Apply additional filters if provided
      if (ticker) {
        mockSummaries = mockSummaries.filter(s => 
          s.ticker.symbol.toLowerCase() === ticker.toLowerCase()
        );
      }

      if (filingType) {
        mockSummaries = mockSummaries.filter(s => 
          s.filingType.toLowerCase() === filingType.toLowerCase()
        );
      }

      // Apply limit (sort by filing date descending first)
      mockSummaries = mockSummaries
        .sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime())
        .slice(0, limit);
        
      // Log access for audit
      logger.info('User accessed summaries list (mock data)', { 
        userId: user.id,
        count: mockSummaries.length,
        filters: { ticker, filingType, limit },
        requestDuration: Date.now() - startTime
      });

      return createSuccessResponse(
        { summaries: mockSummaries },
        200,
        { source: 'mock', requestDuration: Date.now() - startTime }
      );
    }

    // Log access for audit
    logger.info('User accessed summaries list', { 
      userId: user.id,
      count: summaries.length,
      filters: { ticker, filingType, limit },
      requestDuration: Date.now() - startTime
    });

    return createSuccessResponse(
      { summaries },
      200,
      { source: 'database', requestDuration: Date.now() - startTime }
    );
    
  } catch (error) {
    // Log security event for errors
    logSecurityEvent({
      type: 'invalid_request',
      ip: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
      details: { 
        error: error instanceof Error ? error.message : String(error),
        requestDuration: Date.now() - startTime
      }
    });
    
    logger.error('Error fetching summaries list', { 
      error,
      requestDuration: Date.now() - startTime
    });
    
    return createErrorResponse('Failed to fetch summaries', 500);
  }
} 