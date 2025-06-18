import { NextRequest, NextResponse } from 'next/server';
import filingService from '@/services/filingService';
import { logger } from '@/lib/logging';

/**
 * Test API endpoint to send filing summaries via email
 * This endpoint bypasses authentication for testing purposes only
 * 
 * POST /api/test/email-summary
 * 
 * Request body:
 * {
 *   email: string    // Email address to send to
 *   tickers?: string[] // Optional array of tickers to include
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { email, tickers = ['AAPL', 'MSFT', 'GOOGL'] } = body;
    
    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email address is required' },
        { status: 400 }
      );
    }
    
    logger.info('Testing email summary functionality', {
      email,
      tickers,
      isTest: true
    });
    
    // Send email summary
    const result = await filingService.sendEmailSummary(email, tickers, true);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message || 'Filing summaries email sent successfully',
        summaryCount: result.summaries?.length || 0
      });
    } else {
      logger.error('Failed to send test filing summaries email', {
        errors: result.errors || []
      });
      
      return NextResponse.json(
        { 
          success: false, 
          message: result.message || 'Failed to send email',
          errors: result.errors || [] 
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Error in test email-summary endpoint', { error: errorMessage });
    
    return NextResponse.json(
      { 
        success: false, 
        message: errorMessage,
        stack: errorStack
      },
      { status: 500 }
    );
  }
}
