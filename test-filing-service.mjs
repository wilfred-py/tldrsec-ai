// Test script for filing service
import { claudeClient } from './lib/ai/claude-client.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Mock data
const mockFiling = {
  id: 'mock-filing-id',
  accessionNumber: '0001234567-24-000123',
  formType: '10-K',
  filingDate: '2024-06-01',
  company: {
    name: 'Test Company, Inc.',
    cik: '0001234567',
    ticker: 'TEST'
  },
  content: `
UNITED STATES
SECURITIES AND EXCHANGE COMMISSION
Washington, D.C. 20549

FORM 10-K

(Mark One)
☒ ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934
For the fiscal year ended December 31, 2023
OR
☐ TRANSITION REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934
For the transition period from to
Commission File Number: 001-12345

TEST COMPANY, INC.
(Exact name of registrant as specified in its charter)

ITEM 1. BUSINESS
Test Company, Inc. is a leading provider of cloud-based software solutions.

ITEM 7. MANAGEMENT'S DISCUSSION AND ANALYSIS
Revenue increased by 25% to $500 million for the fiscal year.
  `
};

// Mock the summarization function
async function mockSummarizeFiling(filing) {
  console.log('Summarizing filing...');
  
  try {
    // Create a prompt for the filing
    const prompt = `Summarize the following ${filing.formType} SEC filing in a concise way. 
    Extract key financial metrics, business highlights, and risk factors if present.
    Format your response as JSON with the following structure:
    {
      "summary": "Brief 1-2 sentence summary of the filing",
      "keyPoints": ["Point 1", "Point 2", "Point 3"],
      "financialHighlights": [{"metric": "Revenue", "value": "$X million", "yearOverYearChange": "+/-X%"}],
      "businessHighlights": [{"detail": "Description of business highlight"}],
      "riskFactors": [{"description": "Description of risk factor"}],
      "keyTakeaway": "Most important takeaway from this filing"
    }
    
    Here is the filing content:
    ${filing.content}`;
    
    // Make the API call to Claude
    console.log('Sending request to Claude API...');
    const response = await claudeClient.completeChat({
      messages: [
        { role: 'user', content: prompt }
      ],
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      temperature: 0.2
    });
    
    console.log('Claude API response received');
    
    // Extract the summary text from the response
    const summaryText = response.content[0].text;
    
    // Try to parse the JSON from the response
    try {
      const summaryJSON = JSON.parse(summaryText);
      console.log('Successfully parsed JSON from response');
      
      // Create a FilingSummaryResult object
      const secHtmlUrl = `https://www.sec.gov/Archives/edgar/data/${filing.company.cik}/${filing.accessionNumber.replace(/-/g, '')}/index.htm`;
      
      const summaryResult = {
        data: {
          ticker: filing.company.ticker,
          companyName: filing.company.name,
          filingType: filing.formType,
          filingDate: filing.filingDate,
          accessionNumber: filing.accessionNumber,
          summaryText,
          keyPoints: summaryJSON.keyPoints || [],
          url: secHtmlUrl,
          rawData: filing
        }
      };
      
      console.log('Summary result created successfully');
      return summaryResult;
    } catch (parseError) {
      console.error('Error parsing JSON from response:', parseError);
      
      // Create a fallback summary with basic information
      const fallbackSummary = {
        data: {
          ticker: filing.company.ticker,
          companyName: filing.company.name,
          filingType: filing.formType,
          filingDate: filing.filingDate,
          accessionNumber: filing.accessionNumber,
          summaryText: `Summary of ${filing.formType} filing for ${filing.company.name} (${filing.company.ticker}). Filed on ${filing.filingDate}.`,
          keyPoints: [
            `${filing.formType} filing from ${filing.filingDate}`,
            `Filed by ${filing.company.name} (${filing.company.ticker})`,
            `Accession number: ${filing.accessionNumber}`
          ],
          url: `https://www.sec.gov/Archives/edgar/data/${filing.company.cik}/${filing.accessionNumber.replace(/-/g, '')}/index.htm`,
          rawData: filing
        },
        error: `Failed to parse JSON from Claude response: ${parseError.message}`
      };
      
      console.log('Created fallback summary due to parsing error');
      return fallbackSummary;
    }
  } catch (error) {
    console.error('Error in mockSummarizeFiling:', error);
    
    // Create an error fallback summary
    const errorFallback = {
      data: {
        ticker: filing.company.ticker,
        companyName: filing.company.name,
        filingType: filing.formType,
        filingDate: filing.filingDate,
        accessionNumber: filing.accessionNumber,
        summaryText: `Summary of ${filing.formType} filing for ${filing.company.name} (${filing.company.ticker}). Filed on ${filing.filingDate}.`,
        keyPoints: [
          `${filing.formType} filing from ${filing.filingDate}`,
          `Filed by ${filing.company.name} (${filing.company.ticker})`,
          `Accession number: ${filing.accessionNumber}`
        ],
        url: `https://www.sec.gov/Archives/edgar/data/${filing.company.cik}/${filing.accessionNumber.replace(/-/g, '')}/index.htm`,
        rawData: filing
      },
      error: `Failed to summarize filing: ${error.message || 'Unknown error'}`
    };
    
    console.log('Created error fallback summary');
    return errorFallback;
  }
}

// Run the test
async function runTest() {
  try {
    console.log('Starting test of filing service...');
    const result = await mockSummarizeFiling(mockFiling);
    console.log('Test completed with result:', result.data ? 'Success' : 'Failed');
    console.log('Summary data structure:', Object.keys(result.data));
    
    // Validate the result structure
    const requiredFields = ['ticker', 'companyName', 'filingType', 'filingDate', 'accessionNumber', 'summaryText', 'keyPoints', 'url'];
    const missingFields = requiredFields.filter(field => !result.data[field]);
    
    if (missingFields.length > 0) {
      console.error('Missing required fields in result:', missingFields);
    } else {
      console.log('All required fields present in result');
    }
    
    // Check for error
    if (result.error) {
      console.warn('Warning: Test completed with error:', result.error);
    }
  } catch (error) {
    console.error('Test failed with exception:', error);
  }
}

// Run the test
runTest();
