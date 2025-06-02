/**
 * Test script for fetching and analyzing SEC filings for Tesla (TSLA)
 * 
 * This script demonstrates:
 * 1. Fetching the latest SEC filings for a specific ticker (TSLA)
 * 2. Using the enhanced SEC filing prompt templates to analyze the filings
 * 3. Displaying the structured analysis results
 */

import { SECEdgarClient } from '../lib/sec-edgar/client';
import { TickerResolver } from '../lib/sec-edgar/ticker-service/ticker-resolver';
import { getPromptForFilingType } from '../lib/ai/sec-prompts';
import { FilingType } from '../lib/sec-edgar/types';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
async function fetchLatestFilings(ticker: string, limit: number = 10) {
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
    const filings = await secClient.getRecentFilings({
      cik: tickerInfo.cik,
      limit
    });
    
    console.log(`Found ${filings.filings?.length || 0} filings for ${ticker}`);
    return { filings, tickerInfo };
  } catch (error) {
    console.error('Error fetching filings:', error);
    throw error;
  }
}

/**
 * Analyze a filing using OpenAI and our enhanced prompt templates
 */
async function analyzeFilingWithAI(filingType: FilingType, content: string) {
  try {
    console.log(`Analyzing ${filingType} filing...`);
    
    // Get the appropriate prompt for this filing type
    const prompt = getPromptForFilingType(filingType, content);
    
    // Call OpenAI to analyze the filing
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
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
      temperature: 0.2,
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error analyzing filing:', error);
    return `Error analyzing filing: ${(error as Error).message}`;
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
        const analysis = await analyzeFilingWithAI(filing.formType as FilingType, truncatedContent);
        
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
