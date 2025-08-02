import { NextRequest, NextResponse } from 'next/server';
import filingService from '@/services/filingService';
import { FilingType } from '@/lib/sec-edgar/types';
import { getFormsByCategory, getHighImportanceForms } from '@/lib/sec-edgar/form-registry';

/**
 * Test endpoint for demonstrating multi-form support
 * This endpoint fetches summaries for different form types for a given ticker
 */
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker') || 'AAPL';
    
    // Get high importance forms
    const highImportanceForms = getHighImportanceForms();
    
    // Get forms by category for demonstration
    const financialReportForms = getFormsByCategory('annual').slice(0, 2);
    const eventForms = getFormsByCategory('current').slice(0, 2);
    const ownershipForms = getFormsByCategory('insider').slice(0, 2);
    
    // Collect results
    const results = {
      ticker,
      summaries: [] as Array<{ formType: string; summary: unknown }>,
      errors: [] as Array<{ formType: string; error: string }>
    };
    
    // Try to get a summary for each form type
    const formTypes = [
      ...financialReportForms.map(form => form.id),
      ...eventForms.map(form => form.id),
      ...ownershipForms.map(form => form.id)
    ];
    
    // Limit to 3 form types for the test
    const testFormTypes = formTypes.slice(0, 3);
    
    // Get summaries for each form type
    for (const formType of testFormTypes) {
      try {
        console.log(`Fetching ${formType} for ${ticker}...`);
        const result = await filingService.getFilingSummary(ticker, formType as FilingType);
        
        if (result.data) {
          results.summaries.push({
            formType,
            summary: result.data
          });
        } else {
          results.errors.push({
            formType,
            error: result.error || `No ${formType} filing found for ${ticker}`
          });
        }
      } catch (error) {
        console.error(`Error fetching ${formType} for ${ticker}:`, error);
        results.errors.push({
          formType,
          error: error instanceof Error ? error.message : `Error fetching ${formType}`
        });
      }
    }
    
    // Return the results
    return NextResponse.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error in multi-form test API:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }, { status: 500 });
  }
}
