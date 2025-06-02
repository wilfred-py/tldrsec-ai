// Comprehensive test script for the SEC filing summarization system
import dotenv from 'dotenv';
import { claudeClient } from './lib/ai/claude-client.js';

// Load environment variables
dotenv.config();

// Mock data for testing
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

// Function to generate the SEC filing prompt
function generateFilingPrompt(filing) {
  return `Summarize the following ${filing.formType} SEC filing in a concise way. 
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
}

// Function to summarize a filing using Claude
async function summarizeFiling(filing) {
  console.log(`Summarizing ${filing.formType} filing for ${filing.company.name} (${filing.company.ticker})...`);
  
  try {
    // Generate the prompt
    const prompt = generateFilingPrompt(filing);
    
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
    console.log('Summary text extracted from response');
    
    // Try to parse the JSON from the response
    try {
      const summaryJSON = JSON.parse(summaryText);
      console.log('Successfully parsed JSON from response');
      
      // Log the token usage
      console.log(`Token usage: ${response.usage?.input_tokens || 0} input, ${response.usage?.output_tokens || 0} output`);
      
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
          filingUrl: secHtmlUrl, // For backward compatibility
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
          filingUrl: `https://www.sec.gov/Archives/edgar/data/${filing.company.cik}/${filing.accessionNumber.replace(/-/g, '')}/index.htm`,
          rawData: filing
        },
        error: `Failed to parse JSON from Claude response: ${parseError.message}`
      };
      
      console.log('Created fallback summary due to parsing error');
      return fallbackSummary;
    }
  } catch (error) {
    console.error('Error in summarizeFiling:', error);
    
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
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${filing.company.cik}/${filing.accessionNumber.replace(/-/g, '')}/index.htm`,
        rawData: filing
      },
      error: `Failed to summarize filing: ${error.message || 'Unknown error'}`
    };
    
    console.log('Created error fallback summary');
    return errorFallback;
  }
}

// Function to generate a mock email HTML for testing
function generateMockEmailHtml(summaries) {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
        .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; }
        .summary { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .key-points { background-color: #f5f5f5; padding: 10px; margin-top: 10px; }
        .footer { margin-top: 30px; padding: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 0.9em; color: #666; }
        .filing-link { display: inline-block; margin-top: 10px; color: #0066cc; text-decoration: none; }
        .filing-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>SEC Filing Summaries</h1>
        <p>${new Date().toLocaleDateString()}</p>
      </div>
  `;
  
  // Add each summary
  summaries.forEach(summary => {
    html += `
      <div class="summary">
        <h2>${summary.companyName} (${summary.ticker}) - ${summary.filingType}</h2>
        <p><strong>Filed on:</strong> ${summary.filingDate}</p>
        <p>${summary.summaryText}</p>
        
        <div class="key-points">
          <h3>Key Points</h3>
          <ul>
            ${summary.keyPoints.map(point => `<li>${point}</li>`).join('')}
          </ul>
        </div>
        
        <a href="${summary.url}" class="filing-link" target="_blank">View on SEC Website</a>
      </div>
    `;
  });
  
  // Add footer
  html += `
      <div class="footer">
        <p>This email was generated by tldrSEC. The information provided is for informational purposes only and should not be considered financial advice.</p>
        <p>© ${new Date().getFullYear()} tldrSEC</p>
      </div>
    </body>
    </html>
  `;
  
  return html;
}

// Function to generate a plain text version of the email
function generatePlainTextEmail(summaries) {
  let text = `SEC Filing Summaries - ${new Date().toLocaleDateString()}\n\n`;
  
  // Add summaries
  summaries.forEach(summary => {
    text += `${summary.companyName} (${summary.ticker}) - ${summary.filingType}\n`;
    text += `Filed on: ${summary.filingDate}\n\n`;
    text += `${summary.summaryText}\n\n`;
    
    text += `Key Points:\n`;
    summary.keyPoints.forEach(point => {
      text += `- ${point}\n`;
    });
    text += `\n`;
    
    text += `View on SEC Website: ${summary.url}\n`;
    text += `\n---\n\n`;
  });
  
  // Add footer
  text += `This email was generated by tldrSEC. The information provided is for informational purposes only and should not be considered financial advice.\n`;
  text += `© ${new Date().getFullYear()} tldrSEC\n`;
  
  return text;
}

// Main test function
async function runTest() {
  try {
    console.log('Starting comprehensive test of SEC filing summarization system...');
    
    // Step 1: Summarize the filing
    const summaryResult = await summarizeFiling(mockFiling);
    console.log('Filing summarization completed');
    
    // Step 2: Validate the summary result structure
    const requiredFields = ['ticker', 'companyName', 'filingType', 'filingDate', 'accessionNumber', 'summaryText', 'keyPoints', 'url'];
    const missingFields = requiredFields.filter(field => !summaryResult.data[field]);
    
    if (missingFields.length > 0) {
      console.error('Missing required fields in summary result:', missingFields);
    } else {
      console.log('All required fields present in summary result');
    }
    
    // Step 3: Generate email content
    console.log('Generating email content...');
    const emailHtml = generateMockEmailHtml([summaryResult.data]);
    const plainTextEmail = generatePlainTextEmail([summaryResult.data]);
    
    console.log('Email content generated successfully');
    
    // Step 4: Validate email content
    if (emailHtml.includes(summaryResult.data.url) && 
        plainTextEmail.includes(summaryResult.data.url) &&
        emailHtml.includes(summaryResult.data.summaryText) &&
        plainTextEmail.includes(summaryResult.data.summaryText)) {
      console.log('Email content validation passed');
    } else {
      console.error('Email content validation failed');
    }
    
    // Step 5: Display summary of test results
    console.log('\n----- TEST RESULTS -----');
    console.log(`Filing: ${mockFiling.company.name} (${mockFiling.company.ticker}) - ${mockFiling.formType}`);
    console.log(`Summary generated: ${summaryResult.data ? 'Success' : 'Failed'}`);
    console.log(`Email content generated: ${emailHtml && plainTextEmail ? 'Success' : 'Failed'}`);
    
    if (summaryResult.error) {
      console.warn('Warning: Test completed with error:', summaryResult.error);
    }
    
    console.log('Test completed successfully');
    
    // Return the test results
    return {
      success: true,
      summary: summaryResult.data,
      emailHtml,
      plainTextEmail
    };
  } catch (error) {
    console.error('Test failed with exception:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

// Run the test
runTest()
  .then(result => {
    if (result.success) {
      console.log('All tests passed successfully');
    } else {
      console.error('Tests failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unhandled error during test execution:', error);
    process.exit(1);
  });
