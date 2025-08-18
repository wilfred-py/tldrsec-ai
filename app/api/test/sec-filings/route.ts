/**
 * Test API route for SEC filing integration
 * 
 * This route fetches the latest SEC filings for Tesla (TSLA) and analyzes them
 * using our enhanced prompt templates.
 */

import { NextResponse } from 'next/server';
import { SECEdgarClient } from '@/lib/sec-edgar/client';
import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';
import { FilingType } from '@/lib/sec-edgar/types';
import { filingAnalyzer } from '@/lib/ai/filing-analyzer';
// Web Crypto API for Edge Runtime compatibility

// Initialize SEC Edgar client
const secClient = new SECEdgarClient({
  userAgent: process.env.SEC_USER_AGENT || 'TLDRSEC-AI-App contact@example.com',
  maxRequestsPerSecond: 2 // Be more conservative with rate limits
});

// Log environment variables for debugging
console.log('Environment variables:');
console.log('- SEC_USER_AGENT:', process.env.SEC_USER_AGENT || 'Using default');

/**
 * GET handler for the API route
 */
export async function GET() {
  try {
    // Tesla's CIK number and ticker
    const teslaCIK = '0001318605';
    const teslaTicker = 'TSLA';
    
    // Fetch recent filings for Tesla
    console.log('Fetching recent filings for Tesla...');
    console.log('Using CIK:', teslaCIK);
    
    // Get recent filings
    console.log('Making SEC API request for recent filings...');
    let filingsResponse;
    try {
      filingsResponse = await secClient.getRecentFilings({
        cik: teslaCIK,
        count: 5
      });
      console.log('SEC API response received for recent filings');
    } catch (error) {
      console.error('Error fetching recent filings:', error);
      return NextResponse.json({ error: 'Failed to fetch SEC filings' }, { status: 500 });
    }
    
    console.log('Filings response type:', typeof filingsResponse);
    
    // Parse XML response
    const parser = new DOMParser();
    const filingsXml = typeof filingsResponse === 'string' 
      ? filingsResponse 
      : JSON.stringify(filingsResponse);
    const doc = parser.parseFromString(filingsXml, 'text/xml');
    
    // Extract feed title
    const feedTitle = xpath.select1('string(//*[local-name()="feed"]/*[local-name()="title"])', doc as unknown as Node);
    console.log('Feed title:', feedTitle);
    
    // Extract entries
    const entries = xpath.select('//*[local-name()="entry"]', doc as unknown as Node) as Node[];
    console.log(`Found ${entries?.length || 0} filings`);
    
    console.log(`Found ${entries.length} filings`);
    
    if (entries.length === 0) {
      return NextResponse.json({ error: 'No filings found' }, { status: 404 });
    }
    
    // Process up to 3 filings
    const filingsToProcess = entries.slice(0, 3);
    const results = [];
    
    for (const entry of filingsToProcess) {
      try {
        // Extract data from XML nodes using XPath
        const title = xpath.select1('string(./*[local-name()="title"])', entry) as string;
        const link = xpath.select1('string(./*[local-name()="link"]/@href)', entry) as string;
        const updated = xpath.select1('string(./*[local-name()="updated"])', entry) as string;
        const category = xpath.select1('string(./*[local-name()="category"]/@term)', entry) as string;
        
        // Extract filing type from the title or category
        // Format is typically "TSLA (0001318605) - 10-K - Annual report [Section 13 or 15(d)]..."
        const titleMatch = title.match(/- ([\w-]+) -/) || [];
        const filingType = (titleMatch[1] || category || 'Unknown') as string;
        
        console.log(`Processing ${filingType} filing from ${updated}...`);
        
        // Fetch the filing document if we have a valid link
        if (!link) {
          throw new Error('No document link found for filing');
        }
        
        const documentContent = await secClient.getFilingDocument(link);
        
        // Generate a document hash for caching using Web Crypto API
        const encoder = new TextEncoder();
        const data = encoder.encode(`TSLA-${filingType}-${updated}-${documentContent.length}`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const documentHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        // Analyze the filing with Claude AI using our optimized service
        console.log(`Analyzing ${filingType} filing with Claude AI...`);
        let analysis = null;
        
        try {
          // Use the filing analyzer service with caching
          analysis = await filingAnalyzer.analyzeFilingWithClaude(
            filingType as FilingType,
            'TSLA',
            'Tesla, Inc.',
            documentContent,
            {
              maxContentLength: 15000, // Limit content to avoid token limits
              useCaching: true,
              documentHash,
              temperature: 0.2,
              timeout: 30000, // 30 second timeout
              maxTokens: 2000,
              model: 'claude-sonnet-4-20250514'
            }
          );
          
          console.log('Filing analysis complete');
        } catch (aiError) {
          console.error('Error analyzing with Claude:', aiError);
          analysis = { error: `AI analysis failed: ${(aiError as Error).message}` };
        }
        
        // Add to results with AI analysis
        results.push({
          filingType,
          filingDate: updated,
          title,
          documentUrl: link,
          contentLength: documentContent.length,
          analysis
        });
      } catch (error) {
        console.error('Error processing filing:', error);
        results.push({
          error: `Error processing filing: ${(error as Error).message}`
        });
      }
    }
    
    // Calculate usage statistics if available
    let usageStats;
    try {
      usageStats = filingAnalyzer.getUsageStats();
      console.log('Claude API usage statistics:', usageStats);
    } catch (statsError) {
      console.warn('Could not retrieve Claude usage statistics:', statsError);
    }
    
    // Get cache statistics for debugging
    const cacheStats = filingAnalyzer.getCacheStats();
    console.log('Filing analyzer cache stats:', cacheStats);
    
    // Return the results with enhanced metadata
    return NextResponse.json({
      success: true,
      metadata: {
        ticker: 'TSLA',
        cik: teslaCIK,
        company: 'Tesla, Inc.',
        requestTimestamp: new Date().toISOString(),
        filingCount: results.length,
        processedCount: results.filter(r => !r.error).length,
        aiProvider: 'Claude',
        aiModel: 'claude-sonnet-4-20250514'
      },
      usage: usageStats,
      results
    });
  } catch (error) {
    console.error('Test failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
