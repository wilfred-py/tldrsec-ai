import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { testEnvironmentFilingFetch, isRailwayEnvironment } from '../../../../lib/sec-edgar/environment-aware-fetcher';
import { resolveTicker } from '../../../../lib/sec-edgar/cik-resolver';

const healthLogger = logger.child('sec-edgar-health');

/**
 * SEC EDGAR health check endpoint
 * Tests both environment detection and filing fetch capabilities
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    healthLogger.info('Starting SEC EDGAR health check');

    // Basic environment detection
    const environment = {
      isRailway: isRailwayEnvironment(),
      nodeEnv: process.env.NODE_ENV,
      hasRailwayDomain: !!process.env.RAILWAY_PUBLIC_DOMAIN,
      hasRailwayEnv: !!process.env.RAILWAY_ENVIRONMENT
    };

    // Test ticker-to-CIK resolution
    const tickerTest = await resolveTicker('TSLA');
    
    // Test environment-aware filing fetch
    const filingTest = await testEnvironmentFilingFetch();
    
    const duration = Date.now() - startTime;
    
    const result = {
      success: tickerTest.success && filingTest.success,
      environment,
      tests: {
        tickerResolution: {
          success: tickerTest.success,
          ticker: 'TSLA',
          cik: tickerTest.cik,
          companyName: tickerTest.companyName,
          source: tickerTest.source,
          error: tickerTest.error
        },
        filingFetch: filingTest
      },
      duration,
      timestamp: new Date().toISOString()
    };

    healthLogger.info('SEC EDGAR health check completed', {
      success: result.success,
      duration,
      environment: result.environment.isRailway ? 'Railway' : 'Local',
      method: filingTest.method
    });

    return NextResponse.json(result);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    healthLogger.error('SEC EDGAR health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}