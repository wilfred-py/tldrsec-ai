import { NextResponse } from 'next/server';
import filingService from '../../../../services/filingService';
import * as secService from '../../../../services/secService';
import { FilingType } from '../../../../lib/sec-edgar/types';

/**
 * Test API endpoint to verify SEC filing summary functionality
 * This endpoint will fetch a filing for a given ticker, generate a summary,
 * and return the results to verify our fixes are working correctly.
 */
export async function GET(request: Request) {
  // Get ticker from URL params, default to AAPL
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker') || 'AAPL';
  
  try {
    // 1. Get latest filing for the ticker
    console.log(`Fetching latest filing for ${ticker}...`);
    const latestFilings = await secService.getLatestFilings(ticker, 1);
    
    if (!latestFilings || latestFilings.length === 0) {
      return NextResponse.json({ error: `No filings found for ${ticker}` }, { status: 404 });
    }
    
    const latestFiling = latestFilings[0];
    console.log(`Latest filing found: ${latestFiling.form} filed on ${latestFiling.filingDate}`);
    
    // 2. Generate a summary for the filing
    console.log(`Generating summary for ${ticker} - ${latestFiling.form}...`);
    const result = await filingService.getFilingSummary(ticker, latestFiling.form as FilingType);
    
    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error || 'Failed to generate summary' }, { status: 500 });
    }
    
    // 3. Verify the filing URL is using the HTML viewer format
    const filingUrl = result.data.filingUrl;
    const urlVerification = {
      isRawTextUrl: filingUrl.endsWith('.txt'),
      isHtmlViewerUrl: filingUrl.includes('/Archives/edgar/data/') && !filingUrl.endsWith('.txt'),
      url: filingUrl
    };
    
    // 4. Generate email content to verify
    const emailHtml = filingService.generateEmailHtml([result.data], []);
    const plainTextEmail = filingService.generatePlainTextEmail([result.data], []);
    
    // 5. Return the test results
    return NextResponse.json({
      success: true,
      filing: {
        ticker: result.data.ticker,
        companyName: result.data.companyName,
        filingType: result.data.filingType,
        filingDate: result.data.filingDate,
        accessionNumber: result.data.accessionNumber,
      },
      urlVerification,
      summary: {
        summaryTextLength: result.data.summaryText.length,
        summaryTextPreview: result.data.summaryText.substring(0, 200) + '...',
        keyPointsCount: result.data.keyPoints.length,
        keyPointsPreview: result.data.keyPoints.slice(0, 3)
      },
      emailVerification: {
        htmlEmailLength: emailHtml.length,
        plainTextEmailLength: plainTextEmail.length,
        htmlContainsCorrectUrl: emailHtml.includes(filingUrl),
        plainTextContainsCorrectUrl: plainTextEmail.includes(filingUrl)
      }
    });
    
  } catch (error) {
    console.error('Test failed with error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
}
