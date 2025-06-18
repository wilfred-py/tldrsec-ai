/**
 * Test API route for debugging SEC API response structure
 * 
 * This route fetches the SEC API response for a given CIK and returns the raw structure
 * to help debug issues with the filing retrieval process.
 */

import { NextResponse } from 'next/server';
import axios from 'axios';
import { SEC_CONFIG } from '@/config/sec';
import { findCompanyByTicker } from '@/services/companyService';

// Define the expected structure of the SEC API response
interface SecApiResponse {
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      form?: string[];
      primaryDocument?: string[];
      primaryDocUrl?: string[];
      filingUrl?: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function GET(request: Request) {
  try {
    // Get ticker from query parameters
    const requestUrl = new URL(request.url);
    const ticker = requestUrl.searchParams.get('ticker') || 'AAPL';
    
    console.log(`[DEBUG] Testing SEC API response for ticker: ${ticker}`);
    
    // Find company by ticker
    const company = await findCompanyByTicker(ticker);
    
    if (!company) {
      return NextResponse.json({ 
        error: `Company with ticker ${ticker} not found` 
      }, { status: 404 });
    }
    
    console.log(`[DEBUG] Found company: ${company.name} (CIK: ${company.cik})`);
    
    // Construct the URL with zero-padded CIK
    const paddedCik = company.cik.padStart(10, '0');
    const secApiUrl = SEC_CONFIG.SUBMISSIONS_URL(paddedCik);
    
    console.log(`[DEBUG] Fetching SEC API response from: ${secApiUrl}`);
    
    // Make the request to SEC API
    const response = await axios.get<SecApiResponse>(secApiUrl, {
      headers: SEC_CONFIG.HEADERS
    });
    
    const data = response.data;
    
    console.log(`[DEBUG] SEC API response status: ${response.status}`);
    console.log(`[DEBUG] SEC API response keys: ${Object.keys(data).join(', ')}`);
    
    // Return the raw response structure
    return NextResponse.json({
      success: true,
      ticker,
      company: {
        name: company.name,
        cik: company.cik,
        paddedCik
      },
      secApiUrl,
      responseStructure: {
        keys: Object.keys(data),
        hasFilings: !!data.filings,
        hasRecentFilings: !!(data.filings && data.filings.recent),
        filingKeys: data.filings ? Object.keys(data.filings) : [],
        recentFilingKeys: (data.filings && data.filings.recent) 
          ? Object.keys(data.filings.recent) 
          : [],
        recentFilingCounts: (data.filings && data.filings.recent) 
          ? {
              accessionNumber: data.filings.recent.accessionNumber?.length || 0,
              filingDate: data.filings.recent.filingDate?.length || 0,
              form: data.filings.recent.form?.length || 0,
              primaryDocument: data.filings.recent.primaryDocument?.length || 0,
              primaryDocUrl: data.filings.recent.primaryDocUrl?.length || 0,
              filingUrl: data.filings.recent.filingUrl?.length || 0
            }
          : {}
      },
      // Include a sample of the first filing if available
      sampleFiling: (data.filings && 
                    data.filings.recent && 
                    data.filings.recent.accessionNumber && 
                    data.filings.recent.accessionNumber.length > 0) 
        ? {
            accessionNumber: data.filings.recent.accessionNumber[0],
            filingDate: data.filings.recent.filingDate?.[0],
            form: data.filings.recent.form?.[0],
            primaryDocument: data.filings.recent.primaryDocument?.[0],
            primaryDocUrl: data.filings.recent.primaryDocUrl?.[0],
            filingUrl: data.filings.recent.filingUrl?.[0]
          }
        : null
    });
  } catch (error) {
    console.error('[ERROR] SEC API test failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
