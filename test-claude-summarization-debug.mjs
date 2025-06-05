/**
 * Claude AI Summarization Debug Test Script
 * 
 * This script tests the Claude AI summarization pipeline with known good content
 * to identify why summarization is failing for SEC filings.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Check for required API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is not set');
  process.exit(1);
}

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create output directory for test results
const OUTPUT_DIR = path.join(__dirname, 'claude-test-results');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Helper function to write test results to file
function writeTestResult(filename, content) {
  const filePath = path.join(OUTPUT_DIR, filename);
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(filePath, contentStr);
  console.log(`Output written to ${filePath}`);
}

// Helper function to read sample filing content
function readSampleFiling(filingType) {
  try {
    // Check if we have test results from the SEC service test
    const testResultsDir = path.join(__dirname, 'test-results');
    if (fs.existsSync(testResultsDir)) {
      // Look for document content files
      const files = fs.readdirSync(testResultsDir);
      const contentFile = files.find(f => f.includes(`document-content-${filingType}-full.txt`));
      
      if (contentFile) {
        console.log(`Found sample ${filingType} filing from test results`);
        return fs.readFileSync(path.join(testResultsDir, contentFile), 'utf8');
      }
    }
    
    // Fallback to sample files
    const samplePath = path.join(__dirname, 'samples', `${filingType.replace('-', '')}_sample.txt`);
    if (fs.existsSync(samplePath)) {
      console.log(`Using sample ${filingType} filing from samples directory`);
      return fs.readFileSync(samplePath, 'utf8');
    }
    
    // If no sample is available, return a test string
    console.log(`No sample ${filingType} filing found, using test content`);
    return `This is a test ${filingType} filing for Tesla, Inc. (TSLA).
    
    ITEM 1. BUSINESS
    
    Tesla, Inc. designs, develops, manufactures, sells and leases high-performance fully electric vehicles and energy generation and storage systems, and offers services related to its products. We generally sell our products directly to customers, including through our website and retail locations. We also continue to grow our customer-facing infrastructure through a global network of vehicle service centers, Mobile Service technicians and Supercharger stations. We emphasize performance, attractive styling and the safety of our users and workforce in the design and manufacture of our products and are continuing to develop full self-driving technology for improved safety.
    
    ITEM 1A. RISK FACTORS
    
    We operate in a rapidly changing environment that involves numerous risks and uncertainties. These risks and uncertainties include those described below as well as those described elsewhere in this Annual Report on Form 10-K.
    
    ITEM 7. MANAGEMENT'S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS
    
    The following discussion and analysis should be read in conjunction with our consolidated financial statements and the related notes that appear elsewhere in this Annual Report on Form 10-K.
    `;
  } catch (error) {
    console.error(`Error reading sample filing: ${error.message}`);
    return `Error: Could not read sample filing - ${error.message}`;
  }
}

// Create a simple mock for the Claude AI API
async function mockClaudeAI(systemPrompt, userPrompt) {
  console.log('Mocking Claude AI API call');
  console.log(`System prompt length: ${systemPrompt.length} characters`);
  console.log(`User prompt length: ${userPrompt.length} characters`);
  
  // Save the prompts for inspection
  writeTestResult('system-prompt.txt', systemPrompt);
  writeTestResult('user-prompt.txt', userPrompt);
  
  // Simple mock response
  return {
    content: [
      {
        type: 'text',
        text: `This is a mock summary of the filing. The actual Claude API would return a real summary here.
        
        Key points:
        - This is point 1
        - This is point 2
        - This is point 3
        
        Financial highlights:
        - Revenue: $X million
        - Net income: $Y million
        - EPS: $Z
        `
      }
    ],
    usage: {
      input_tokens: systemPrompt.length + userPrompt.length,
      output_tokens: 150
    }
  };
}

// Try to import the real Claude AI client
async function importClaudeAI() {
  try {
    const { Anthropic } = await import('@anthropic-ai/sdk');
    console.log('Successfully imported Anthropic SDK');
    
    return new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  } catch (error) {
    console.error(`Error importing Anthropic SDK: ${error.message}`);
    console.log('Using mock Claude AI implementation');
    
    // Return an object with a similar interface
    return {
      messages: {
        create: mockClaudeAI
      }
    };
  }
}

// Try to import the summarize module
async function importSummarizeModule() {
  try {
    console.log('Attempting to import summarize module...');
    
    // Try different import paths
    try {
      const module = await import('./lib/ai/summarize.js');
      console.log('Successfully imported summarize module from ./lib/ai/summarize.js');
      return module;
    } catch (error1) {
      console.log('Failed to import from ./lib/ai/summarize.js, trying .ts extension...');
      
      try {
        const module = await import('./lib/ai/summarize.ts');
        console.log('Successfully imported summarize module from ./lib/ai/summarize.ts');
        return module;
      } catch (error2) {
        console.log('Failed to import from ./lib/ai/summarize.ts, trying with @/ prefix...');
        
        try {
          const module = await import('@/lib/ai/summarize');
          console.log('Successfully imported summarize module with @/ prefix');
          return module;
        } catch (error3) {
          console.error('All import attempts failed');
          console.error('Error 1:', error1.message);
          console.error('Error 2:', error2.message);
          console.error('Error 3:', error3.message);
          
          // Return null to indicate failure
          return null;
        }
      }
    }
  } catch (error) {
    console.error(`Unexpected error importing summarize module: ${error.message}`);
    return null;
  }
}

// Try to import the SEC prompts module
async function importSecPromptsModule() {
  try {
    console.log('Attempting to import SEC prompts module...');
    
    // Try different import paths
    try {
      const module = await import('./lib/ai/sec-prompts.js');
      console.log('Successfully imported SEC prompts module from ./lib/ai/sec-prompts.js');
      return module;
    } catch (error1) {
      console.log('Failed to import from ./lib/ai/sec-prompts.js, trying .ts extension...');
      
      try {
        const module = await import('./lib/ai/sec-prompts.ts');
        console.log('Successfully imported SEC prompts module from ./lib/ai/sec-prompts.ts');
        return module;
      } catch (error2) {
        console.log('Failed to import from ./lib/ai/sec-prompts.ts, trying with @/ prefix...');
        
        try {
          const module = await import('@/lib/ai/sec-prompts');
          console.log('Successfully imported SEC prompts module with @/ prefix');
          return module;
        } catch (error3) {
          console.error('All import attempts failed');
          console.error('Error 1:', error1.message);
          console.error('Error 2:', error2.message);
          console.error('Error 3:', error3.message);
          
          // Return null to indicate failure
          return null;
        }
      }
    }
  } catch (error) {
    console.error(`Unexpected error importing SEC prompts module: ${error.message}`);
    return null;
  }
}

// Manual implementation of prompt generation
function generatePrompts(filingType, content, companyName, ticker) {
  // System prompt
  const systemPrompt = `You are an expert financial analyst specializing in SEC filings. 
Your task is to analyze and summarize ${filingType} filings in clear, concise language that both financial professionals and individual investors can understand.
Focus on the most important information, key changes, and potential impacts on the company's future.

For ${filingType} filings, pay special attention to:
${filingType === '10-K' ? `
- Business overview and strategy
- Risk factors, especially new or changed risks
- Management's discussion and analysis
- Financial statements and key metrics
- Significant accounting policies
- Material events and uncertainties` : ''}
${filingType === '10-Q' ? `
- Quarter-over-quarter and year-over-year changes
- Management's discussion of results
- Material changes in financial condition
- Updates to risk factors
- Forward-looking statements` : ''}
${filingType === '8-K' ? `
- The nature of the material event
- Financial impact of the event
- Management's explanation
- Any exhibits or additional information provided` : ''}

Provide a concise summary followed by key points in bullet form. Use plain language and avoid jargon when possible.`;

  // User prompt
  const userPrompt = `Please summarize the following ${filingType} filing for ${companyName} (${ticker}):

${content.substring(0, 100000)} // Limit to 100K characters to avoid token limits

Focus on the most important information that investors should know. Include both positive and negative developments.`;

  return { systemPrompt, userPrompt };
}

// Test the Claude AI summarization pipeline
async function testClaudeSummarization() {
  console.log('Starting Claude AI summarization test...');
  
  // Import the Claude AI client
  const claude = await importClaudeAI();
  
  // Import the summarize module if available
  const summarizeModule = await importSummarizeModule();
  
  // Import the SEC prompts module if available
  const secPromptsModule = await importSecPromptsModule();
  
  // Define filing types to test
  const filingTypes = ['10-K', '10-Q', '8-K'];
  const companyName = 'Tesla, Inc.';
  const ticker = 'TSLA';
  
  // Test each filing type
  for (const filingType of filingTypes) {
    console.log(`\n--- Testing ${filingType} summarization ---`);
    
    // Get sample filing content
    const content = readSampleFiling(filingType);
    console.log(`Sample ${filingType} content length: ${content.length} characters`);
    
    // Save the content for reference
    writeTestResult(`${filingType}-content.txt`, content);
    
    // Test 1: Direct Claude API call with manual prompts
    console.log('\nTest 1: Direct Claude API call with manual prompts');
    try {
      // Generate prompts manually
      const { systemPrompt, userPrompt } = generatePrompts(filingType, content, companyName, ticker);
      
      // Call Claude API
      console.log('Calling Claude API...');
      const response = await claude.messages.create({
        model: 'claude-3-opus-20240229',
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000
      });
      
      console.log('Claude API response received');
      console.log(`Output tokens: ${response.usage?.output_tokens || 'unknown'}`);
      
      // Save the response
      writeTestResult(`${filingType}-direct-claude-response.json`, response);
      
      // Extract and save the summary text
      const summaryText = response.content[0].text;
      writeTestResult(`${filingType}-direct-claude-summary.txt`, summaryText);
      
      console.log('Direct Claude API test completed successfully');
    } catch (error) {
      console.error(`Error in direct Claude API test: ${error.message}`);
      writeTestResult(`${filingType}-direct-claude-error.json`, {
        error: error.message,
        stack: error.stack
      });
    }
    
    // Test 2: Using SEC prompts module if available
    if (secPromptsModule) {
      console.log('\nTest 2: Using SEC prompts module');
      try {
        // Generate prompts using the module
        const systemPrompt = secPromptsModule.generateSystemPrompt(filingType);
        const userPrompt = secPromptsModule.generateUserPrompt(filingType, content, companyName, ticker);
        
        // Save the prompts
        writeTestResult(`${filingType}-module-system-prompt.txt`, systemPrompt);
        writeTestResult(`${filingType}-module-user-prompt.txt`, userPrompt);
        
        // Call Claude API
        console.log('Calling Claude API with module-generated prompts...');
        const response = await claude.messages.create({
          model: 'claude-3-opus-20240229',
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 4000
        });
        
        console.log('Claude API response received');
        console.log(`Output tokens: ${response.usage?.output_tokens || 'unknown'}`);
        
        // Save the response
        writeTestResult(`${filingType}-module-claude-response.json`, response);
        
        // Extract and save the summary text
        const summaryText = response.content[0].text;
        writeTestResult(`${filingType}-module-claude-summary.txt`, summaryText);
        
        console.log('SEC prompts module test completed successfully');
      } catch (error) {
        console.error(`Error in SEC prompts module test: ${error.message}`);
        writeTestResult(`${filingType}-module-claude-error.json`, {
          error: error.message,
          stack: error.stack
        });
      }
    }
    
    // Test 3: Using summarize module if available
    if (summarizeModule) {
      console.log('\nTest 3: Using summarize module');
      try {
        // Create mock filing object
        const filing = {
          ticker,
          companyName,
          filingType,
          filingDate: new Date().toISOString().split('T')[0],
          filingUrl: `https://www.sec.gov/Archives/edgar/data/1318605/000095017023000794/tsla-${filingType.toLowerCase()}.htm`,
          id: `test-${filingType}-${Date.now()}`
        };
        
        // Call the summarize function
        console.log('Calling summarizeFiling function...');
        const result = await summarizeModule.summarizeFiling(filing, content);
        
        console.log('Summarize function returned result');
        console.log(`Summary status: ${result.processingStatus}`);
        console.log(`Summary length: ${result.summary?.length || 0} characters`);
        
        // Save the result
        writeTestResult(`${filingType}-summarize-result.json`, result);
        
        // Save the summary text
        if (result.summary) {
          writeTestResult(`${filingType}-summarize-summary.txt`, result.summary);
        }
        
        console.log('Summarize module test completed successfully');
      } catch (error) {
        console.error(`Error in summarize module test: ${error.message}`);
        writeTestResult(`${filingType}-summarize-error.json`, {
          error: error.message,
          stack: error.stack
        });
      }
    }
  }
}

// Run the test
console.log('=== Claude AI Summarization Debug Test ===');
testClaudeSummarization()
  .then(() => console.log('\nTest completed. Check the claude-test-results directory for output.'))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
