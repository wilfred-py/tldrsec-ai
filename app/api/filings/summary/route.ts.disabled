import { NextRequest, NextResponse } from 'next/server';
import filingService from '@/services/filingService';
import { FilingType } from '@/lib/sec-edgar/types';
import { getFormMetadata } from '@/lib/sec-edgar/form-registry';

/**
 * API endpoint for getting a summary of a specific SEC filing
 * 
 * @param request - The incoming request
 * @returns A response with the filing summary or an error
 */
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker');
    const formType = searchParams.get('formType') as FilingType;
    const skipAuth = searchParams.get('skipAuth') === 'true';
    
    // Validate required parameters
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker parameter is required' }, { status: 400 });
    }
    
    if (!formType) {
      return NextResponse.json({ error: 'Form type parameter is required' }, { status: 400 });
    }
    
    // Validate form type
    const formMetadata = getFormMetadata(formType);
    if (!formMetadata) {
      return NextResponse.json({ error: `Invalid form type: ${formType}` }, { status: 400 });
    }
    
    // Check authentication unless bypassed for development
    if (!skipAuth && process.env.NODE_ENV !== 'development') {
      // In a production environment, we would implement proper authentication here
      // For now, we're allowing all requests to proceed in development mode
      console.log('Authentication check would happen here in production');
    }
    
    // Get the filing summary
    const result = await filingService.getFilingSummary(ticker.toUpperCase(), formType);
    
    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error || 'Failed to get filing summary' }, { status: 404 });
    }
    
    return NextResponse.json({ 
      success: true, 
      data: result.data 
    });
  } catch (error) {
    console.error('Error in filing summary API:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }, { status: 500 });
  }
}

/**
 * API endpoint for sending an email with filing summaries
 * 
 * @param request - The incoming request
 * @returns A response indicating success or failure
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { email, tickers } = body;
    const skipAuth = body.skipAuth === true;
    
    // Validate required parameters
    if (!email) {
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
    }
    
    // Check authentication unless bypassed for development
    if (!skipAuth && process.env.NODE_ENV !== 'development') {
      // In a production environment, we would implement proper authentication here
      // For now, we're allowing all requests to proceed in development mode
      console.log('Authentication check would happen here in production');
    }
    
    // Send email summary
    const result = await filingService.sendEmailSummary(email, tickers);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send email summary' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Email summary sent successfully',
      summaries: result.summaries?.length || 0,
      errors: result.errors?.length || 0
    });
  } catch (error) {
    console.error('Error in filing summary email API:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }, { status: 500 });
  }
}
