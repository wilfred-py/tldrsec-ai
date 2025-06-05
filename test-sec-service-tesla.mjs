/**
 * SEC Service Tesla Filing Test Script
 * 
 * This script tests the SEC service's ability to retrieve and process Tesla (TSLA) filings.
 * It tests multiple filing types and saves detailed output for debugging.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create output directory for test results
const OUTPUT_DIR = path.join(__dirname, 'test-results');
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

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  else return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Main test function
async function testSecService() {
  console.log('Starting SEC service test for Tesla (TSLA) filings...');
  
  try {
    // Dynamically import the SEC service
    console.log('Importing SEC service...');
    
    // First try the direct import
    let secService;
    try {
      const module = await import('./services/secService.js');
      secService = module.default || module;
      console.log('Successfully imported SEC service from ./services/secService.js');
    } catch (importError1) {
      console.log('Failed to import from ./services/secService.js, trying alternative path...');
      try {
        // Try with TypeScript extension
        const module = await import('./services/secService.ts');
        secService = module.default || module;
        console.log('Successfully imported SEC service from ./services/secService.ts');
      } catch (importError2) {
        console.log('Failed to import from ./services/secService.ts, trying with @/ prefix...');
        try {
          // Try with @/ prefix (common in Next.js projects)
          const module = await import('@/services/secService');
          secService = module.default || module;
          console.log('Successfully imported SEC service with @/ prefix');
        } catch (importError3) {
          console.error('All import attempts failed. Using fallback axios approach.');
          writeTestResult('import-errors.json', {
            error1: importError1.message,
            error2: importError2.message,
            error3: importError3.message
          });
          
          // Use a fallback approach with axios
          const axios = (await import('axios')).default;
          secService = {
            findCompanyByTicker: async (ticker) => {
              console.log(`Fallback: Finding company info for ticker ${ticker}`);
              const response = await axios.get('https://www.sec.gov/include/ticker.txt');
              const lines = response.data.split('\n');
              for (const line of lines) {
                const [tickerFromFile, cik] = line.split('\t');
                if (tickerFromFile && tickerFromFile.toUpperCase() === ticker.toUpperCase() && cik) {
                  return {
                    cik: cik.padStart(10, '0'),
                    name: 'Tesla, Inc.', // Hardcoded for this test
                    tickers: [ticker]
                  };
                }
              }
              return null;
            },
            getCompanyFilings: async () => {
              throw new Error('Fallback method does not support getCompanyFilings');
            },
            getFilingDetails: async () => {
              throw new Error('Fallback method does not support getFilingDetails');
            }
          };
        }
      }
    }
    
    // Test 1: Find company by ticker
    console.log('\n--- Test 1: Find company by ticker ---');
    const ticker = 'TSLA';
    console.log(`Finding company info for ticker: ${ticker}`);
    
    try {
      const companyInfo = await secService.findCompanyByTicker(ticker);
      console.log('Company info found:');
      console.log(`- CIK: ${companyInfo.cik}`);
      console.log(`- Name: ${companyInfo.name}`);
      console.log(`- Tickers: ${companyInfo.tickers?.join(', ') || 'N/A'}`);
      
      writeTestResult('company-info.json', companyInfo);
      
      // Test 2: Get company filings
      console.log('\n--- Test 2: Get company filings ---');
      console.log(`Getting filings for CIK: ${companyInfo.cik}`);
      
      try {
        const filings = await secService.getCompanyFilings(companyInfo.cik);
        console.log(`Found ${filings.recentFilings.length} recent filings`);
        
        // Display the first 5 filings
        console.log('\nRecent filings (first 5):');
        filings.recentFilings.slice(0, 5).forEach((filing, index) => {
          console.log(`${index + 1}. Form ${filing.form} filed on ${filing.filingDate}`);
          console.log(`   Accession Number: ${filing.accessionNumber}`);
          console.log(`   Primary Document: ${filing.primaryDocument}`);
          console.log(`   URL: ${filing.filingUrl}`);
        });
        
        writeTestResult('company-filings.json', filings);
        
        // Test 3: Get filing details for different form types
        console.log('\n--- Test 3: Get filing details for different form types ---');
        
        // Get one of each major form type
        const formTypes = ['10-K', '10-Q', '8-K', '4'];
        const testFilings = [];
        
        for (const formType of formTypes) {
          const matchingFiling = filings.recentFilings.find(f => f.form === formType);
          if (matchingFiling) {
            testFilings.push({ type: formType, filing: matchingFiling });
          }
        }
        
        // If we didn't find all form types, add some of the most recent filings
        if (testFilings.length < 3) {
          filings.recentFilings.slice(0, 3).forEach(filing => {
            if (!testFilings.some(tf => tf.filing.accessionNumber === filing.accessionNumber)) {
              testFilings.push({ type: filing.form, filing });
            }
          });
        }
        
        console.log(`Testing ${testFilings.length} different filings`);
        
        // Process each test filing
        for (const [index, testFiling] of testFilings.entries()) {
          console.log(`\nProcessing filing ${index + 1}/${testFilings.length}: Form ${testFiling.type}`);
          console.log(`Accession Number: ${testFiling.filing.accessionNumber}`);
          
          try {
            const filingDetails = await secService.getFilingDetails(
              testFiling.filing.accessionNumber,
              companyInfo.cik
            );
            
            console.log(`Filing details retrieved successfully`);
            console.log(`- Company: ${filingDetails.companyName}`);
            console.log(`- Form: ${filingDetails.form}`);
            console.log(`- Filing Date: ${filingDetails.filingDate}`);
            console.log(`- Documents: ${filingDetails.documents.length}`);
            
            // Save filing details
            writeTestResult(`filing-details-${testFiling.type}.json`, filingDetails);
            
            // Log document information
            console.log('\nDocuments:');
            filingDetails.documents.forEach((doc, docIndex) => {
              console.log(`${docIndex + 1}. ${doc.fileName} (${doc.type}) - ${formatFileSize(doc.size)}`);
              console.log(`   Description: ${doc.description}`);
              console.log(`   URL: ${doc.documentUrl}`);
            });
            
            // Get the primary document content
            const primaryDoc = filingDetails.documents.find(d => 
              d.fileName === filingDetails.primaryDocument
            ) || filingDetails.documents[0];
            
            if (primaryDoc) {
              console.log(`\nFetching primary document: ${primaryDoc.fileName}`);
              
              try {
                // Use axios to fetch the document content
                const axios = (await import('axios')).default;
                const headers = secService.getSecApiHeaders ? 
                  secService.getSecApiHeaders() : 
                  { 'User-Agent': 'tldrSEC/1.0 (testing)' };
                
                const response = await axios.get(primaryDoc.documentUrl, { headers });
                const content = response.data;
                
                // Save a sample of the content
                const contentSample = typeof content === 'string' 
                  ? content.substring(0, 5000) 
                  : JSON.stringify(content).substring(0, 5000);
                
                writeTestResult(`document-content-${testFiling.type}-sample.txt`, contentSample + '...');
                
                console.log(`Document content retrieved: ${formatFileSize(contentSample.length)} sample saved`);
                
                // Save full content for detailed analysis
                writeTestResult(`document-content-${testFiling.type}-full.txt`, content);
                console.log(`Full document content saved (${formatFileSize(typeof content === 'string' ? content.length : JSON.stringify(content).length)})`);
                
                // Check if this is an inline XBRL document
                const isInlineXbrl = typeof content === 'string' && (
                  content.includes('inline XBRL') || 
                  content.includes('ix:header') || 
                  content.includes('ix:hidden')
                );
                
                if (isInlineXbrl) {
                  console.log(`⚠️ DETECTED INLINE XBRL DOCUMENT - This may require special handling`);
                  
                  // Try to find alternative documents that might contain better text
                  const alternativeDocs = filingDetails.documents.filter(d => 
                    d.fileName !== primaryDoc.fileName && 
                    (d.fileName.endsWith('.htm') || d.fileName.endsWith('.html') || d.fileName.endsWith('.txt'))
                  );
                  
                  if (alternativeDocs.length > 0) {
                    console.log(`Found ${alternativeDocs.length} alternative documents that might contain better text`);
                    
                    // Check the first alternative document
                    const altDoc = alternativeDocs[0];
                    console.log(`Checking alternative document: ${altDoc.fileName}`);
                    
                    try {
                      const altResponse = await axios.get(altDoc.documentUrl, { headers });
                      const altContent = altResponse.data;
                      
                      // Save a sample
                      const altContentSample = typeof altContent === 'string' 
                        ? altContent.substring(0, 5000) 
                        : JSON.stringify(altContent).substring(0, 5000);
                      
                      writeTestResult(`alt-document-content-${testFiling.type}-sample.txt`, altContentSample + '...');
                      console.log(`Alternative document content retrieved: ${formatFileSize(altContentSample.length)} sample saved`);
                    } catch (altError) {
                      console.error(`Error fetching alternative document: ${altError.message}`);
                    }
                  }
                }
              } catch (docError) {
                console.error(`Error fetching document content: ${docError.message}`);
                writeTestResult(`document-error-${testFiling.type}.json`, {
                  error: docError.message,
                  stack: docError.stack
                });
              }
            } else {
              console.log('No primary document found');
            }
          } catch (filingError) {
            console.error(`Error getting filing details: ${filingError.message}`);
            writeTestResult(`filing-error-${testFiling.type}.json`, {
              error: filingError.message,
              stack: filingError.stack
            });
          }
        }
        
        // Test 4: Get latest filings by form type
        console.log('\n--- Test 4: Get latest filings by form type ---');
        
        for (const formType of ['10-K', '10-Q', '8-K', '4']) {
          console.log(`\nGetting latest ${formType} filing for ${ticker}`);
          
          try {
            const latestFiling = await secService.getLatestFilingByFormType(ticker, formType);
            
            if (latestFiling) {
              console.log(`Latest ${formType} filing found:`);
              console.log(`- Filing Date: ${latestFiling.filingDate}`);
              console.log(`- Accession Number: ${latestFiling.accessionNumber}`);
              console.log(`- URL: ${latestFiling.filingUrl}`);
              
              writeTestResult(`latest-${formType}-filing.json`, latestFiling);
            } else {
              console.log(`No ${formType} filings found for ${ticker}`);
            }
          } catch (error) {
            console.error(`Error getting latest ${formType} filing: ${error.message}`);
            writeTestResult(`latest-${formType}-error.json`, {
              error: error.message,
              stack: error.stack
            });
          }
        }
        
      } catch (filingsError) {
        console.error(`Error getting company filings: ${filingsError.message}`);
        writeTestResult('company-filings-error.json', {
          error: filingsError.message,
          stack: filingsError.stack
        });
      }
    } catch (companyError) {
      console.error(`Error finding company by ticker: ${companyError.message}`);
      writeTestResult('company-info-error.json', {
        error: companyError.message,
        stack: companyError.stack
      });
    }
    
  } catch (error) {
    console.error(`Unexpected error in test: ${error.message}`);
    console.error(error.stack);
    writeTestResult('unexpected-error.json', {
      error: error.message,
      stack: error.stack
    });
  }
}

// Run the test
console.log('=== SEC Service Tesla Filing Test ===');
testSecService()
  .then(() => console.log('\nTest completed. Check the test-results directory for output.'))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
