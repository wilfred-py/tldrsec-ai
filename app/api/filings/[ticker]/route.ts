/**
 * Dynamic API route for SEC filing retrieval and analysis by ticker
 * 
 * This route fetches the latest SEC filings for the specified ticker and analyzes them
 * using Claude AI with enhanced prompt templates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SECEdgarClient } from '@/lib/sec-edgar/client';
import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';
import { TickerResolver } from '@/lib/sec-edgar/ticker-service/ticker-resolver';
import { SECDataClient } from '@/lib/sec-edgar/ticker-service/sec-client';
import { filingAnalyzer } from '@/lib/ai/filing-analyzer';
import { createHash } from 'crypto';

// Initialize SEC Edgar client
const secClient = new SECEdgarClient({
  userAgent: process.env.SEC_USER_AGENT || 'TLDRSEC-AI-App contact@example.com',
  maxRequestsPerSecond: 2 // Be conservative with rate limits
});

// Initialize Ticker Resolver
const tickerResolver = new TickerResolver({
  secClient: new SECDataClient({
    userAgent: process.env.SEC_USER_AGENT || 'TLDRSEC-AI-App contact@example.com',
  }),
});

/**
 * GET handler for the API route
 */
export async function GET(
  request: NextRequest,
  context: { params: { ticker: string } }
) {
  const { params } = context;
  try {
    // Get ticker from route params
    const ticker = params.ticker.toUpperCase();
    
    // Get limit from query params (default to 3)
    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 3;
    
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker parameter is required' }, { status: 400 });
    }
    
    console.log(`Processing request for ticker: ${ticker}, limit: ${limit}`);
    
    // Resolve ticker to CIK
    console.log(`Resolving ticker ${ticker} to CIK...`);
    const tickerInfo = await tickerResolver.resolveTicker(ticker, { 
      createIfNotExists: true 
    });
    
    if (!tickerInfo.success || !tickerInfo.cik) {
      console.error(`Failed to resolve ticker ${ticker}:`, tickerInfo.error);
      return NextResponse.json({ 
        error: `Failed to resolve ticker ${ticker}: ${tickerInfo.error || 'Unknown error'}` 
      }, { status: 404 });
    }
    
    console.log(`Resolved ${ticker} to CIK: ${tickerInfo.cik}, Company: ${tickerInfo.companyName}`);
    
    // Fetch filings for the CIK
    console.log(`Fetching recent filings for ${ticker}...`);
    let filingsResponse;
    try {
      filingsResponse = await secClient.getRecentFilings({
        cik: tickerInfo.cik,
        count: limit
      });
      console.log('SEC API response received for recent filings');
    } catch (error) {
      console.error('Error fetching recent filings:', error);
      return NextResponse.json({ 
        error: `Failed to fetch SEC filings for ${ticker}` 
      }, { status: 500 });
    }
    
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
    
    if (!entries || entries.length === 0) {
      return NextResponse.json({ 
        error: `No filings found for ${ticker}` 
      }, { status: 404 });
    }
    
    // Process filings up to the limit
    const filingsToProcess = entries.slice(0, limit);
    const results = [];
    
    for (const entry of filingsToProcess) {
      try {
        // Extract data from XML nodes using XPath
        const title = xpath.select1('string(./*[local-name()="title"])', entry) as string;
        const link = xpath.select1('string(./*[local-name()="link"]/@href)', entry) as string;
        const updated = xpath.select1('string(./*[local-name()="updated"])', entry) as string;
        const category = xpath.select1('string(./*[local-name()="category"]/@term)', entry) as string;
        
        // Extract filing type from the title or category
        const titleMatch = title.match(/- ([\w-]+) -/) || [];
        const filingType = (titleMatch[1] || category || 'Unknown') as string;
        
        console.log(`Processing ${filingType} filing from ${updated}...`);
        
        // Fetch the filing document if we have a valid link
        if (!link) {
          throw new Error('No document link found for filing');
        }
        
        const documentContent = await secClient.getFilingDocument(link);
        
        // Generate a document hash for caching
        const documentHash = createHash('sha256')
          .update(`${ticker}-${filingType}-${updated}-${documentContent.length}`)
          .digest('hex');
        
        // Analyze the filing with Claude AI using our optimized service
        console.log(`Analyzing ${filingType} filing with Claude AI...`);
        let analysis = null;
        
        try {
          // Use the filing analyzer service with caching
          analysis = await filingAnalyzer.analyzeFilingWithClaude(
            filingType,
            ticker,
            tickerInfo.companyName || '',
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
        ticker: ticker,
        cik: tickerInfo.cik,
        company: tickerInfo.companyName || ticker,
        requestTimestamp: new Date().toISOString(),
        filingCount: results.length,
        processedCount: results.filter(r => !r.error).length,
        aiProvider: 'Claude',
        aiModel: 'claude-sonnet-4-20250514',
        cacheInfo: {
          size: cacheStats.size,
          maxSize: cacheStats.maxSize,
          cacheHits: cacheStats.entries.filter((entry: {key: string}) => 
            entry.key.startsWith(ticker)).length
        }
      },
      usage: usageStats,
      results
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
