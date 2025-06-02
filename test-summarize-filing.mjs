// Test script for SEC filing summarization
import { claudeClient } from './lib/ai/claude-client.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Mock the summarizeFiling function to test the core functionality
async function testSummarizeFiling(filingContent, formType) {
  console.log(`Testing summarization for ${formType} filing...`);
  
  try {
    // Create a prompt for the filing
    const prompt = `Summarize the following ${formType} SEC filing in a concise way. 
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
    ${filingContent.substring(0, 3000)}...`;
    
    // Log the Claude client to check its structure
    console.log('Claude client initialized:', !!claudeClient);
    
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
    console.log('Summary text:', summaryText.substring(0, 200) + '...');
    
    // Try to parse the JSON from the response
    try {
      const summaryJSON = JSON.parse(summaryText);
      console.log('Successfully parsed JSON from response');
      console.log('Summary JSON structure:', Object.keys(summaryJSON));
      
      // Create a FilingSummaryResult object
      const summaryResult = {
        ticker: 'TEST',
        companyName: 'Test Company',
        filingType: formType,
        filingDate: new Date().toISOString(),
        accessionNumber: 'TEST-20240602',
        summaryText,
        keyPoints: summaryJSON.keyPoints || [],
        url: 'https://www.sec.gov/Archives/edgar/data/TEST/000000000000000000/index.htm',
        rawData: { content: filingContent.substring(0, 100) + '...' }
      };
      
      console.log('Summary result created:', summaryResult);
      return { data: summaryResult };
    } catch (parseError) {
      console.error('Error parsing JSON from response:', parseError);
      return { 
        data: null, 
        error: `Failed to parse JSON from Claude response: ${parseError.message}` 
      };
    }
  } catch (error) {
    console.error('Error in testSummarizeFiling:', error);
    return { 
      data: null, 
      error: `Failed to summarize filing: ${error.message || 'Unknown error'}` 
    };
  }
}

// Sample 10-K filing content (truncated)
const sample10KContent = `
UNITED STATES
SECURITIES AND EXCHANGE COMMISSION
Washington, D.C. 20549

FORM 10-K

(Mark One)
☒ ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934
For the fiscal year ended December 31, 2024
OR
☐ TRANSITION REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934
For the transition period from to
Commission File Number: 001-12345

TEST COMPANY, INC.
(Exact name of registrant as specified in its charter)

Delaware 12-3456789
(State or other jurisdiction of (I.R.S. Employer
incorporation or organization) Identification No.)

123 Main Street, Suite 100
San Francisco, CA 94105
(Address of principal executive offices) (Zip Code)

Registrant's telephone number, including area code: (415) 555-1234

Securities registered pursuant to Section 12(b) of the Act:
Title of each class Trading Symbol(s) Name of each exchange on which registered
Common Stock, $0.001 par value TEST Nasdaq Global Select Market

ITEM 1. BUSINESS
Test Company, Inc. ("Test Company," the "Company," "we," "us," or "our") is a leading provider of cloud-based software solutions for businesses of all sizes. Our platform helps organizations manage customer relationships, streamline operations, and drive growth through data-driven insights.

Founded in 2010, we have grown to serve over 10,000 customers across various industries including technology, healthcare, financial services, and retail. Our headquarters are in San Francisco, California, with additional offices in New York, London, and Tokyo.

ITEM 7. MANAGEMENT'S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS
Revenue increased by 25% to $500 million for the fiscal year ended December 31, 2024, compared to $400 million for the fiscal year ended December 31, 2023. This growth was primarily driven by a 30% increase in our enterprise customer segment and the successful launch of our new analytics product suite.

Gross margin improved to 75% from 70% in the prior year, reflecting our continued focus on operational efficiency and economies of scale.

ITEM 1A. RISK FACTORS
Our business faces significant risks and uncertainties, including:
- Intense competition in the software industry
- Rapid technological changes requiring continuous innovation
- Cybersecurity threats and data privacy concerns
- Dependence on key personnel and ability to attract and retain talent
- Global economic conditions affecting customer spending
`;

// Run the test
async function runTest() {
  try {
    const result = await testSummarizeFiling(sample10KContent, '10-K');
    console.log('Test result:', result.data ? 'Success' : 'Failed', result.error || '');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runTest();
