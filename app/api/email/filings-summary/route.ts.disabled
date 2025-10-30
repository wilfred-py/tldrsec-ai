import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import filingService from '@/services/filingService';
import { logger } from '@/lib/logging';
// resendClient imported but not used - reserved for future email functionality
// import { resendClient } from '@/lib/email/resend-client';

/**
 * API endpoint to request the latest filing summaries via email
 * 
 * POST /api/email/filings-summary
 * 
 * Request body:
 * {
 *   tickers?: string[] // Optional array of tickers to include (defaults to user's tracked companies)
 * }
 * 
 * Response:
 * {
 *   success: boolean
 *   message: string
 *   requestId?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { tickers } = body;
    
    // Get the authenticated user
    const user = await currentUser();
    
    if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Use the user's primary email address
    const primaryEmail = user.emailAddresses[0].emailAddress;
    
    logger.info('Processing email summary request', {
      userId: user.id,
      email: primaryEmail,
      tickerCount: tickers?.length || 'default'
    });
    
    // Send email summary
    const result = await filingService.sendEmailSummary(primaryEmail, tickers);
    
    if (result.success) {
      logger.info('Filing summaries email sent successfully', {
        email: primaryEmail,
        tickerCount: tickers?.length || 'default'
      });
      
      return NextResponse.json({
        success: true,
        message: result.message || 'Filing summaries email sent successfully',
        summaryCount: result.summaries?.length || 0
      });
    } else {
      logger.error('Failed to send filing summaries email', {
        email: primaryEmail,
        error: result.error
      });
      
      return NextResponse.json(
        { success: false, message: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    logger.error('Error in filings-summary email endpoint', { error });
    
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}
