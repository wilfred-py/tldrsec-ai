import { NextRequest, NextResponse } from 'next/server';
import filingService from '../../../../services/filingService';

/**
 * Debug endpoint for testing email summaries
 * This endpoint is for development/testing only and should be protected in production
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Extract from query parameters
    const email = searchParams.get('email');
    const tickersParam = searchParams.get('tickers');
    const tickers = tickersParam?.split(',') || [];
    
    // Validate input
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!tickers || tickers.length === 0) {
      return NextResponse.json(
        { error: 'Tickers array is required' },
        { status: 400 }
      );
    }

    console.log(`[DEBUG] Testing email summary for ${email} with tickers: ${tickers.join(', ')}`);
    
    // Call the sendEmailSummary function
    const result = await filingService.sendEmailSummary(email, tickers);
    
    // Return the result
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in debug/email-summary API route:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Extract from request body
    const { email, tickers } = await request.json();
    
    // Validate input
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { error: 'Tickers array is required' },
        { status: 400 }
      );
    }

    console.log(`[DEBUG] Testing email summary for ${email} with tickers: ${tickers.join(', ')}`);
    
    // Call the sendEmailSummary function
    const result = await filingService.sendEmailSummary(email, tickers);
    
    // Return the result
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in debug/email-summary API route:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
