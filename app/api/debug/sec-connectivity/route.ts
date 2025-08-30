import { NextRequest, NextResponse } from 'next/server';
import { fetchSecCompanyRSS, generateSecRssUrl } from '../../../../lib/sec-edgar/rss-parser';
import { logger } from '../../../../lib/logging';

const diagLogger = logger.child('sec-connectivity-diagnostic');

/**
 * SEC Connectivity Diagnostic Endpoint for Railway Debugging
 * Tests direct SEC.gov RSS feed access from Railway infrastructure
 * 
 * Usage: GET /api/debug/sec-connectivity?cik=0000320193 (Apple)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Get test CIK from query params (default to Tesla)
    const { searchParams } = new URL(request.url);
    const testCik = searchParams.get('cik') || '0001318605'; // Tesla
    
    diagLogger.info('Starting SEC connectivity diagnostic', {
      testCik,
      environment: process.env.NODE_ENV,
      railwayDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
      timestamp: new Date().toISOString()
    });

    // Test 1: Generate RSS URL
    const rssUrl = generateSecRssUrl(testCik);
    diagLogger.info('Generated RSS URL', { rssUrl });

    // Test 2: Basic network connectivity test
    const connectivityTest = await testBasicConnectivity(rssUrl);
    
    // Test 3: Full RSS fetch test
    const rssFetchTest = await testRssFetch(testCik);
    
    // Test 4: Environment analysis
    const envAnalysis = analyzeEnvironment();
    
    const duration = Date.now() - startTime;
    
    const diagnostics = {
      success: true,
      duration,
      testCik,
      rssUrl,
      tests: {
        connectivity: connectivityTest,
        rssFetch: rssFetchTest
      },
      environment: envAnalysis,
      timestamp: new Date().toISOString()
    };

    diagLogger.info('SEC connectivity diagnostic completed', diagnostics);
    
    return NextResponse.json(diagnostics);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    diagLogger.error('SEC connectivity diagnostic failed', {
      error: error instanceof Error ? error.message : String(error),
      duration,
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * Test basic HTTP connectivity to SEC.gov
 */
async function testBasicConnectivity(rssUrl: string) {
  const startTime = Date.now();
  
  try {
    diagLogger.info('Testing basic connectivity to SEC.gov', { rssUrl });
    
    const response = await fetch(rssUrl, {
      method: 'HEAD', // Just test connectivity, don't download content
      headers: {
        'User-Agent': 'tldrSEC-AI Railway Connectivity Test (contact@tldrsec.com)',
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    const duration = Date.now() - startTime;

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      duration,
      url: rssUrl
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
      url: rssUrl,
      errorType: error instanceof TypeError ? 'NetworkError' : 'UnknownError'
    };
  }
}

/**
 * Test full RSS feed fetch and parsing
 */
async function testRssFetch(cik: string) {
  const startTime = Date.now();
  
  try {
    diagLogger.info('Testing full RSS fetch and parse', { cik });
    
    const rssFeed = await fetchSecCompanyRSS(cik);
    const duration = Date.now() - startTime;

    return {
      success: true,
      cik: rssFeed.cik,
      companyName: rssFeed.companyName,
      entriesCount: rssFeed.entries.length,
      firstEntries: rssFeed.entries.slice(0, 3).map(entry => ({
        accessionNumber: entry.accessionNumber,
        filingType: entry.filingType,
        filingDate: entry.filingDate,
        title: entry.title
      })),
      lastUpdated: rssFeed.lastUpdated,
      duration
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
      errorType: error instanceof TypeError ? 'NetworkError' : 
                 error instanceof SyntaxError ? 'ParseError' : 'UnknownError'
    };
  }
}

/**
 * Analyze current environment for networking issues
 */
function analyzeEnvironment() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    environment: process.env.NODE_ENV,
    isRailway: !!process.env.RAILWAY_PUBLIC_DOMAIN,
    railwayDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
    dnsResolvers: process.env.DNS_SERVERS,
    userAgent: 'tldrSEC-AI Railway Connectivity Test (contact@tldrsec.com)',
    timeout: 10000,
    timestamp: new Date().toISOString()
  };
}