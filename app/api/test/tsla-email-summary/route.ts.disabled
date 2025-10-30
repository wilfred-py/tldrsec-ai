import { NextResponse } from 'next/server';
import filingService from '@/services/filingService';

/**
 * Test endpoint to generate and send an email summary for TSLA filings
 * This bypasses authentication for testing purposes
 */
export async function GET() {
  try {
    // Use a test email and only TSLA ticker
    const testEmail = 'test@example.com';
    const tickers = ['TSLA'];
    const debug = false; // Set to false to test actual AI summarization and email sending
    
    console.log(`[TEST] Generating email summary for TSLA...`);
    const result = await filingService.sendEmailSummary(testEmail, tickers, debug);
    
    return NextResponse.json({
      success: true,
      message: 'Email summary test completed',
      result
    });
  } catch (error) {
    console.error(`[TEST] Error testing TSLA email summary:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
