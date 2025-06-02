/**
 * API route for testing SEC filing AI summarization
 * 
 * This endpoint allows testing the AI summarization functionality for SEC filings
 * by fetching a filing for a specific ticker and generating a summary.
 * 
 * Usage:
 * GET /api/test/ai-summary?ticker=AAPL&formType=10-K
 */

import { NextRequest, NextResponse } from 'next/server';
import filingService from '@/services/filingService';
import { FilingType } from '@/lib/sec-edgar/types';

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker') || 'AAPL';
    const formType = searchParams.get('formType') || '10-K';
    
    console.log(`[API] Testing AI summarization for ${ticker} ${formType} filing...`);
    
    // Get the filing summary
    const result = await filingService.getFilingSummary(ticker, formType as FilingType);
    
    if (result.error) {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 400 });
    }
    
    if (!result.data) {
      return NextResponse.json({
        success: false,
        error: 'No summary data returned'
      }, { status: 404 });
    }
    
    // Return the summary data
    return NextResponse.json({
      success: true,
      data: {
        ticker: result.data.ticker,
        companyName: result.data.companyName,
        filingType: result.data.filingType,
        filingDate: result.data.filingDate,
        filingUrl: result.data.filingUrl,
        accessionNumber: result.data.accessionNumber,
        summaryText: result.data.summaryText,
        keyPoints: result.data.keyPoints,
        // Include metadata about the summary
        metadata: {
          summaryLength: result.data.summaryText?.length || 0,
          keyPointsCount: result.data.keyPoints?.length || 0,
          generatedAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('[API] Error in AI summary test:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
