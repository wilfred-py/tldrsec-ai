import { NextRequest, NextResponse } from 'next/server';
import filingService from '@/services/filingService';
import { logger } from '@/lib/logging';

/**
 * Test endpoint to simulate the full /api/email/filings-summary endpoint
 * This bypasses authentication for testing purposes
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { tickers = ['TSLA'], email = 'test@example.com' } = body;
    
    logger.info('Processing test email summary request', {
      email,
      tickerCount: tickers?.length || 'default'
    });
    
    // Send email summary
    const result = await filingService.sendEmailSummary(email, tickers);
    
    if (result.success) {
      logger.info('Test filing summaries email sent successfully', {
        email,
        tickerCount: tickers?.length || 'default'
      });
      
      return NextResponse.json({
        success: true,
        message: result.message || 'Filing summaries email sent successfully',
        summaryCount: result.summaries?.length || 0
      });
    } else {
      logger.error('Failed to send test filing summaries email', {
        email,
        error: result.error
      });
      
      return NextResponse.json(
        { success: false, message: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    logger.error('Error in test filings-summary email endpoint', { error });
    
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}
