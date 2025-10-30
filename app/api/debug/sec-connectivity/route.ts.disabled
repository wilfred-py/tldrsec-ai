import { NextRequest, NextResponse } from 'next/server';

/**
 * Debug endpoint to test SEC.gov connectivity from Railway production
 * This helps diagnose why the cron job can't fetch SEC filings
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cik = searchParams.get('cik') || '1318605'; // Default to Tesla
  
  const tests = [];
  
  // Test 1: Basic ticker.txt access
  try {
    const response = await fetch('https://www.sec.gov/include/ticker.txt', {
      method: 'HEAD',
      headers: {
        'User-Agent': 'tldrSEC Research Tool (wilfredchen1@gmail.com)',
        'Accept': 'text/plain',
        'Connection': 'keep-alive'
      }
    });
    
    tests.push({
      test: 'SEC ticker.txt access',
      status: response.ok ? 'PASS' : 'FAIL',
      httpStatus: response.status,
      headers: Object.fromEntries(response.headers.entries())
    });
  } catch (error) {
    tests.push({
      test: 'SEC ticker.txt access',
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  
  // Test 2: Company filings API
  try {
    const response = await fetch(`https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'tldrSEC Research Tool (wilfredchen1@gmail.com)',
        'Accept': 'application/json',
        'Host': 'data.sec.gov'
      }
    });
    
    tests.push({
      test: 'SEC Data API access',
      status: response.ok ? 'PASS' : 'FAIL',
      httpStatus: response.status,
      url: `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`
    });
  } catch (error) {
    tests.push({
      test: 'SEC Data API access',
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  
  // Test 3: RSS Feed access
  try {
    const response = await fetch('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=10-k&company=&dateb=&owner=include&start=0&count=10&output=atom', {
      method: 'HEAD',
      headers: {
        'User-Agent': 'tldrSEC Research Tool (wilfredchen1@gmail.com)',
        'Accept': 'application/atom+xml'
      }
    });
    
    tests.push({
      test: 'SEC RSS Feed access',
      status: response.ok ? 'PASS' : 'FAIL',
      httpStatus: response.status
    });
  } catch (error) {
    tests.push({
      test: 'SEC RSS Feed access', 
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  
  // Test 4: Check deployment environment
  const deploymentInfo = {
    platform: 'VERCEL',
    nodeEnv: process.env.NODE_ENV,
    vercelUrl: process.env.VERCEL_URL
  };
  
  const summary = {
    timestamp: new Date().toISOString(),
    deploymentEnvironment: deploymentInfo,
    testResults: tests,
    overallStatus: tests.every(t => t.status === 'PASS') ? 'HEALTHY' : 'BLOCKED',
    diagnosis: tests.some(t => t.httpStatus === 403) ? 
      'SEC.gov is blocking IP addresses - this is the root cause of filing fetch failures' :
      'Further investigation needed'
  };
  
  return NextResponse.json(summary, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json'
    }
  });
}