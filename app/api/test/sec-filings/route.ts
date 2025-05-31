/**
 * Test API route for SEC filing integration
 * 
 * This route fetches the latest SEC filings for Tesla (TSLA) and analyzes them
 * using our enhanced prompt templates.
 */

import { NextResponse } from 'next/server';
import { SECEdgarClient } from '@/lib/sec-edgar/client';
import { claudeClient } from '@/lib/ai/claude-client';
import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';
import { FilingType } from '@/lib/sec-edgar/types';

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
        
        // Analyze the filing with Claude AI
        console.log(`Analyzing ${filingType} filing with Claude AI...`);
        let analysis = null;
        
        try {
          // Prepare the prompt for Claude
          const prompt = `
            You are an expert financial analyst specializing in SEC filings.
            Please analyze the following ${filingType} filing from Tesla (TSLA) and provide:
            
            1. A concise summary (2-3 sentences)
            2. Key financial metrics mentioned
            3. Important disclosures or material changes
            4. Potential risks identified
            5. Overall sentiment (positive, neutral, negative)
            
            Filing content:
            ${documentContent.substring(0, 15000)} // Limit content to avoid token limits
            
            Format your response as structured JSON with the following fields:
            - summary
            - keyMetrics (array)
            - importantDisclosures (array)
            - risks (array)
            - sentiment
            
            IMPORTANT: Your response MUST be valid JSON. Do not include any text before or after the JSON.
          `;
          
          // Call Claude API
          const response = await claudeClient.completeChat({
            messages: [
              { role: 'user', content: prompt }
            ],
            model: 'claude-3-opus-20240229',
            temperature: 0.2,
            max_tokens: 2000,
            system: "You are an expert financial analyst specializing in SEC filings analysis. Provide concise, accurate analyses in valid JSON format."
          }, {
            timeout: 30000, // 30 second timeout
            requestType: 'premium' // Use premium request type for higher priority
          }).catch(error => {
            console.error('Claude API error:', error);
            throw new Error(`Claude API error: ${error.message || 'Unknown error'}`);
          });
          
          // Parse the response
          let responseText = '';
          if (response.content && response.content.length > 0) {
            if ('text' in response.content[0]) {
              responseText = response.content[0].text as string;
            }
          }
          
          try {
            // Try to extract JSON from the response if it's wrapped in text
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
            
            // Try to parse as JSON
            analysis = jsonStr ? JSON.parse(jsonStr) : null;
            console.log('Successfully parsed Claude response as JSON');
          } catch (parseError) {
            console.warn('Failed to parse Claude response as JSON:', parseError);
            // If not valid JSON, use the raw text but truncate if too long
            analysis = { 
              parseError: true,
              rawAnalysis: responseText.substring(0, 500),
              fullTextLength: responseText.length
            };
          }
          
          console.log('Claude analysis complete');
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
      usageStats = claudeClient.getUsage();
      console.log('Claude API usage statistics:', usageStats);
    } catch (statsError) {
      console.warn('Could not retrieve Claude usage statistics:', statsError);
    }
    
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
        aiModel: 'claude-3-opus-20240229'
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
