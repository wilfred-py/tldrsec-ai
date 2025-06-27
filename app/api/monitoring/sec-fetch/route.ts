/**
 * SEC Fetch Monitoring API
 * 
 * Provides endpoints to access SEC fetch monitoring data and generate reports
 */

import { NextRequest, NextResponse } from 'next/server';
import secFetchMonitor from '@/services/monitoring/secFetchMonitor';
import { logger } from '@/lib/logging';

/**
 * GET /api/monitoring/sec-fetch
 * 
 * Returns analysis of SEC fetch attempts
 */
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7', 10);
    const format = searchParams.get('format') || 'json';
    
    if (format === 'text') {
      // Generate a text report
      const report = await secFetchMonitor.generateFetchReport(days);
      return new NextResponse(report, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        }
      });
    } else {
      // Return JSON analysis
      const analysis = await secFetchMonitor.analyzeFetchAttempts(days);
      return NextResponse.json(analysis);
    }
  } catch (error) {
    logger.error(`Error in SEC fetch monitoring API: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: 'Failed to generate SEC fetch monitoring report' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/sec-fetch/test
 * 
 * Test endpoint to trigger a fetch attempt for a specific filing
 * This is useful for testing the monitoring system
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessionNumber, cik } = body;
    
    if (!accessionNumber) {
      return NextResponse.json(
        { error: 'Missing required parameter: accessionNumber' },
        { status: 400 }
      );
    }
    
    // Import dynamically to avoid circular dependencies
    const { getFilingById } = await import('@/services/filing/getFilingById');
    
    // Attempt to fetch the filing
    const result = await getFilingById(accessionNumber, cik);
    
    // Return a simplified response
    return NextResponse.json({
      success: true,
      accessionNumber,
      cik: cik || result.data.cik,
      formType: result.data.metadata?.formType || 'unknown',
      urlAttempts: result.data.urlAttempts?.length || 0,
      successfulAttempts: result.data.urlAttempts?.filter((a: any) => a.success).length || 0
    });
  } catch (error) {
    logger.error(`Error in SEC fetch test API: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { 
        error: 'Failed to test SEC fetch monitoring',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
