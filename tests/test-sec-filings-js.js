/**
 * Test script for fetching and analyzing SEC filings using Claude AI
 * 
 * This script demonstrates the complete integration flow:
 * 1. Resolve a ticker symbol to a CIK
 * 2. Fetch recent SEC filings for that company
 * 3. Analyze the filings using Claude AI
 */

import axios from 'axios';
import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';
import dotenv from 'dotenv';
import { claudeClient } from '../lib/ai/claude-client.js';

// Load environment variables
dotenv.config();

// Configuration
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'TLDRSEC-AI-App contact@example.com';
const TICKER = 'TSLA'; // Tesla
const FILING_LIMIT = 5;

/**
 * Main function to run the test
 */
async function main() {
  try {
    console.log('Starting SEC filings test with Claude AI integration...');
    
    // Step 1: Resolve ticker to CIK
    const tickerInfo = await resolveTicker(TICKER);
    console.log(`Resolved ${TICKER} to CIK: ${tickerInfo.cik}, Company: ${tickerInfo.name}`);
    
    // Step 2: Fetch recent filings
    const filings = await fetchRecentFilings(tickerInfo.cik, FILING_LIMIT);
    console.log(`Found ${filings.length} filings for ${TICKER}`);
    
    // Step 3: Analyze the most recent filing
    if (filings.length > 0) {
      const mostRecentFiling = filings[0];
      console.log(`\nAnalyzing most recent filing: ${mostRecentFiling.formType} from ${mostRecentFiling.filingDate}`);
      
      // Fetch the filing document
      const filingContent = await fetchFilingDocument(mostRecentFiling.htmlUrl);
      
      // Analyze with Claude AI
      const analysis = await analyzeFilingWithAI(mostRecentFiling.formType, filingContent);
      
      console.log('\n--- Claude AI Analysis ---');
      console.log(analysis);
      console.log('------------------------\n');
    } else {
      console.log('No filings found to analyze.');
    }
    
    console.log('SEC filings test completed successfully.');
  } catch (error) {
    console.error('Error in SEC filings test:', error);
  }
}

/**
 * Resolve a ticker symbol to a CIK
 */
async function resolveTicker(ticker) {
  try {
    console.log(`Resolving ticker ${ticker} to CIK...`);
    
    // Call SEC API to get company info by ticker
    const url = `https://www.sec.gov/files/company_tickers.json`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': SEC_USER_AGENT
      }
    });
    
    // Find the ticker in the response
    const companies = Object.values(response.data);
    const company = companies.find(c => c.ticker === ticker);
    
    if (!company) {
      throw new Error(`Ticker ${ticker} not found in SEC database`);
    }
    
    // Format CIK with leading zeros to 10 digits
    const cik = company.cik_str.toString().padStart(10, '0');
    
    return {
      ticker,
      cik,
      name: company.title
    };
  } catch (error) {
    console.error('Error resolving ticker:', error);
    throw error;
  }
}

/**
 * Fetch recent SEC filings for a company by CIK
 */
async function fetchRecentFilings(cik, limit = 10) {
  try {
    console.log(`Fetching recent SEC filings for CIK ${cik}...`);
    
    // Call SEC EDGAR API to get recent filings
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': SEC_USER_AGENT
      }
    });
    
    // Extract filing information
    const filings = [];
    const recentFilings = response.data.filings.recent;
    
    // Get the minimum of available filings and the requested limit
    const count = Math.min(recentFilings.accessionNumber.length, limit);
    
    for (let i = 0; i < count; i++) {
      const accessionNumber = recentFilings.accessionNumber[i].replace(/-/g, '');
      const formType = recentFilings.form[i];
      const filingDate = recentFilings.filingDate[i];
      const htmlUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber}/${recentFilings.primaryDocument[i]}`;
      
      filings.push({
        formType,
        filingDate,
        accessionNumber,
        htmlUrl,
        description: `${formType} filing from ${filingDate}`
      });
    }
    
    return filings;
  } catch (error) {
    console.error('Error fetching recent filings:', error);
    throw error;
  }
}

/**
 * Fetch the content of a filing document
 */
async function fetchFilingDocument(url) {
  try {
    console.log(`Fetching filing document from ${url}...`);
    
    // Call SEC EDGAR to get the filing document
    const response = await axios.get(url, {
      headers: {
        'User-Agent': SEC_USER_AGENT
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching filing document:', error);
    throw error;
  }
}

/**
 * Analyze a filing using Claude AI
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
 * Get the appropriate prompt template for a specific filing type
 */
function getPromptForFilingType(filingType, content) {
  // Base prompt that works for any filing type
  const basePrompt = `
    You are an expert financial analyst specializing in SEC filings analysis.
    
    Please analyze the following ${filingType} filing and provide:
    
    1. A concise summary (2-3 sentences)
    2. Key financial metrics mentioned
    3. Important disclosures or material changes
    4. Potential risks identified
    5. Overall sentiment (positive, neutral, negative)
    
    Format your response as structured JSON with the following fields:
    - summary
    - keyMetrics (array)
    - importantDisclosures (array)
    - risks (array)
    - sentiment
    
    Filing content:
    ${content.substring(0, 15000)} // Limit content to avoid token limits
  `;
  
  // Filing-specific prompts
  switch (filingType) {
    case '10-K':
      return `
        ${basePrompt}
        
        For 10-K annual reports, also include:
        - Year-over-year revenue and profit changes
        - Major business segment performance
        - Changes in long-term strategy
        - Executive compensation highlights
        - Audit findings
      `;
      
    case '10-Q':
      return `
        ${basePrompt}
        
        For 10-Q quarterly reports, also include:
        - Quarter-over-quarter changes
        - Seasonal factors affecting results
        - Progress on previously announced initiatives
        - Updated guidance if provided
      `;
      
    case '8-K':
      return `
        ${basePrompt}
        
        For 8-K current reports, focus on:
        - The specific material event being reported
        - Immediate financial impact
        - Management's explanation of the event
        - Market reaction if mentioned
      `;
      
    default:
      return basePrompt;
  }
}

// Run the test
main().catch(console.error);
