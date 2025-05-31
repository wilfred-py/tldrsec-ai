/**
 * Test script for fetching and analyzing SEC filings for Tesla (TSLA)
 * 
 * This script demonstrates:
 * 1. Fetching the latest SEC filings for a specific ticker (TSLA)
 * 2. Using the enhanced SEC filing prompt templates to analyze the filings
 * 3. Displaying the structured analysis results
 */

import { SECEdgarClient } from '../lib/sec-edgar/client.js';
import { TickerResolver } from '../lib/sec-edgar/ticker-service/ticker-resolver.js';
import { getPromptForFilingType } from '../lib/ai/sec-prompts.js';
import { claudeClient } from '../lib/ai/claude-client.js';
import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize SEC Edgar client
const secClient = new SECEdgarClient({
  userAgent: process.env.SEC_USER_AGENT || 'TLDRSEC-AI-App contact@example.com',
});

// Initialize Ticker Resolver
const tickerResolver = new TickerResolver({
  secClient: new SECEdgarClient(),
});

/**
 * Fetch the latest SEC filings for a ticker
 */
async function fetchLatestFilings(ticker, limit = 10) {
  try {
    console.log(`Fetching latest SEC filings for ${ticker}...`);
    
    // Resolve ticker to CIK
    const tickerInfo = await tickerResolver.resolveTicker(ticker, { 
      createIfNotExists: true 
    });
    
    if (!tickerInfo.success || !tickerInfo.cik) {
      throw new Error(`Failed to resolve ticker ${ticker}: ${tickerInfo.error}`);
    }
    
    console.log(`Resolved ${ticker} to CIK: ${tickerInfo.cik}, Company: ${tickerInfo.companyName}`);
    
    // Fetch filings for the CIK
    const filingsResponse = await secClient.getRecentFilings({
      cik: tickerInfo.cik,
      count: limit
    });
    
    console.log('Filings response type:', typeof filingsResponse);
    
    // Parse XML response
    const parser = new DOMParser();
    const filingsXml = typeof filingsResponse === 'string' 
      ? filingsResponse 
      : JSON.stringify(filingsResponse);
    const doc = parser.parseFromString(filingsXml, 'text/xml');
    
    // Extract feed title
    const feedTitle = xpath.select1('string(//*[local-name()="feed"]/*[local-name()="title"])', doc);
    console.log('Feed title:', feedTitle);
    
    // Extract entries
    const entries = xpath.select('//*[local-name()="entry"]', doc);
    console.log(`Found ${entries?.length || 0} filings for ${ticker}`);
    
    // Convert entries to a more usable format
    const filings = [];
    for (const entry of entries) {
      const title = xpath.select1('string(./*[local-name()="title"])', entry);
      const link = xpath.select1('string(./*[local-name()="link"]/@href)', entry);
      const updated = xpath.select1('string(./*[local-name()="updated"])', entry);
      const category = xpath.select1('string(./*[local-name()="category"]/@term)', entry);
      
      // Extract filing type from title (e.g., "10-K", "8-K")
      const titleMatch = title?.match(/- ([\w-]+) -/) || [];
      const formType = titleMatch[1] || category || 'Unknown';
      
      filings.push({
        formType,
        filingDate: updated,
        title,
        htmlUrl: link,
        description: title
      });
    }
    
    return { 
      filings: { filings }, // Match the structure expected by the rest of the code
      tickerInfo 
    };
  } catch (error) {
    console.error('Error fetching filings:', error);
    throw error;
  }
}

/**
 * Analyze a filing using Claude AI and our enhanced prompt templates
 */
async function analyzeFilingWithAI(filingType, content) {
  try {
    console.log(`Analyzing ${filingType} filing with Claude AI...`);
    
    // Get the appropriate prompt for this filing type
    const prompt = getPromptForFilingType(filingType, content);
    
    // Call Claude AI to analyze the filing
    const response = await claudeClient.completeChat({
      messages: [
        {
          role: "system",
          content: "You are an expert financial analyst specializing in SEC filings analysis."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "claude-3-opus-20240229",
      temperature: 0.2,
      max_tokens: 4000
    }, {});
    
    // Extract text from Claude's response
    let responseText = '';
    if (response.content && response.content.length > 0) {
      if ('text' in response.content[0]) {
        responseText = response.content[0].text;
      }
    }
    
    return responseText;
  } catch (error) {
    console.error('Error analyzing filing with Claude:', error);
    return `Error analyzing filing: ${error.message}`;
  }
}

/**
 * Main function to test SEC filing fetching and analysis
 */
async function testSecFilings() {
  try {
    // Ticker to test (Tesla)
    const ticker = 'TSLA';
    
    // Fetch latest filings
    const { filings, tickerInfo } = await fetchLatestFilings(ticker);
    
    if (!filings.filings || filings.filings.length === 0) {
      console.log('No filings found.');
      return;
    }
    
    // Process each filing
    for (let i = 0; i < Math.min(3, filings.filings.length); i++) {
      const filing = filings.filings[i];
      console.log(`\n--- Processing filing ${i + 1}/${Math.min(3, filings.filings.length)} ---`);
      console.log(`Form Type: ${filing.formType}`);
      console.log(`Filing Date: ${filing.filingDate}`);
      console.log(`Description: ${filing.description || 'N/A'}`);
      
      // Fetch the filing document
      try {
        const filingContent = await secClient.getFilingDocument(filing.htmlUrl);
        
        // Truncate content to a reasonable size for the AI model
        const truncatedContent = filingContent.slice(0, 50000);
        
        // Analyze the filing
        const analysis = await analyzeFilingWithAI(filing.formType, truncatedContent);
        
        console.log('\nAnalysis:');
        console.log(analysis);
      } catch (error) {
        console.error(`Error processing filing: ${error}`);
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testSecFilings().then(() => {
  console.log('Test completed.');
}).catch(error => {
  console.error('Test failed with error:', error);
});
