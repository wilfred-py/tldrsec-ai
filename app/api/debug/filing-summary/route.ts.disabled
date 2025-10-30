import { NextRequest, NextResponse } from 'next/server';
import filingService from '../../../../services/filingService';
import { findCompanyByTicker, getLatestFilings } from '../../../../services/secService';
import { FilingType } from '../../../../lib/sec-edgar/types';

// Define interfaces for the data we're working with
interface Filing {
  form: string;
  filingDate: string;
  accessionNumber: string;
  reportDate?: string;
  filingUrl: string;
}

interface SummaryResult {
  formType: string;
  success: boolean;
  error: string | null;
  summary: {
    filingType: string;
    filingDate: string;
    summaryText: string;
    keyPointsCount: number;
  } | null;
}

export async function POST(request: NextRequest) {
  try {
    const { ticker } = await request.json();
    
    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }
    
    console.log(`[DEBUG API] Starting debug for ticker: ${ticker}`);
    
    // Step 1: Find company by ticker
    console.log(`[DEBUG API] Step 1: Finding company for ${ticker}`);
    const company = await findCompanyByTicker(ticker);
    
    if (!company) {
      return NextResponse.json(
        { error: `Company with ticker ${ticker} not found` },
        { status: 404 }
      );
    }
    
    // Step 2: Get latest filings
    console.log(`[DEBUG API] Step 2: Getting latest filings for ${ticker}`);
    const filings = await getLatestFilings(ticker, 5);
    
    const simplifiedFilings = filings.map((filing: Filing) => ({
      form: filing.form,
      filingDate: filing.filingDate,
      accessionNumber: filing.accessionNumber,
      hasReportDate: !!filing.reportDate,
      reportDate: filing.reportDate || 'N/A',
      filingUrl: filing.filingUrl
    }));
    
    // Step 3: Try to get summaries for the first two filings
    console.log(`[DEBUG API] Step 3: Getting summaries for the first two filings`);
    const summaryResults: SummaryResult[] = [];
    
    for (const filing of simplifiedFilings.slice(0, 2)) {
      console.log(`[DEBUG API] Processing filing ${filing.form} from ${filing.filingDate}`);
      try {
        // Cast the form string to FilingType
        const result = await filingService.getFilingSummary(ticker, filing.form as FilingType);
        
        const summaryResult: SummaryResult = {
          formType: filing.form,
          success: !!result.data,
          error: result.error || null,
          summary: result.data ? {
            filingType: result.data.filingType,
            filingDate: result.data.filingDate,
            summaryText: result.data.summaryText,
            keyPointsCount: result.data.keyPoints?.length || 0
          } : null
        };
        
        summaryResults.push(summaryResult);
      } catch (summaryError) {
        console.error(`[DEBUG API] Error getting summary for ${filing.form}:`, summaryError);
        summaryResults.push({
          formType: filing.form,
          success: false,
          error: summaryError instanceof Error ? summaryError.message : String(summaryError),
          summary: null
        });
      }
    }
    
    // Return all debug information
    return NextResponse.json({
      ticker,
      company: {
        name: company.name,
        cik: company.cik,
        // Only include properties that exist on the company object
        tickers: company.tickers || [ticker.toUpperCase()]
      },
      filings: simplifiedFilings,
      summaryResults
    });
  } catch (error) {
    console.error('[DEBUG API] Unhandled error:', error);
    return NextResponse.json(
      { 
        error: 'An error occurred during debugging',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
