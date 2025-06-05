/**
 * Test Script for SEC Service
 * 
 * This script tests the secService directly to verify it can properly
 * retrieve filing details and documents from SEC.
 * 
 * Run with: node test-sec-service.mjs
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Logger for the test
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} ${message}`);
}

// Test SEC service functionality
async function runTest() {
  try {
    console.log('===== TESTING SEC SERVICE =====\n');
    
    // Import the SEC service
    log('Importing SEC service...');
    
    // Try to dynamically import the SEC service
    try {
      let secService;
      
      // First try to import via Next.js path alias
      try {
        const { default: importedService } = await eval('import("@/services/secService")');
        secService = importedService;
        log('Successfully imported SEC service via alias', 'success');
      } catch (aliasError) {
        // If that fails, try direct relative path
        log('Alias import failed, trying direct path...', 'warning');
        const { default: importedService } = await import('./services/secService.js');
        secService = importedService;
        log('Successfully imported SEC service via direct path', 'success');
      }
      
      // Test URL components for Tesla 10-K
      const testUrl = 'https://www.sec.gov/Archives/edgar/data/1318605/000095017024014378/tsla-20231231.htm';
      const urlParts = testUrl.split('/');
      let cik = '';
      let accessionNumber = '';
      
      // Extract CIK and accession number from URL
      for (let i = 0; i < urlParts.length; i++) {
        if (urlParts[i] === 'data' && i + 1 < urlParts.length) {
          cik = urlParts[i + 1];
        }
        if (cik && i === urlParts.indexOf(cik) + 1 && i < urlParts.length) {
          accessionNumber = urlParts[i];
        }
      }
      
      log(`Extracted CIK: ${cik} and accessionNumber: ${accessionNumber} from URL`);
      
      // Get SEC API headers
      const secHeaders = await secService.getSecApiHeaders();
      log('Retrieved SEC API headers', 'success');
      log(`User-Agent: ${secHeaders['User-Agent']}`);
      
      // Get filing details
      log(`Getting filing details for accession ${accessionNumber}, CIK ${cik}...`);
      const filingDetails = await secService.getFilingDetails(accessionNumber, cik);
      
      // Check if filing details were returned
      if (!filingDetails) {
        log('No filing details returned', 'error');
      } else {
        log('Successfully retrieved filing details', 'success');
        log(`Filing company name: ${filingDetails.companyName || 'N/A'}`);
        log(`Filing date: ${filingDetails.filingDate || 'N/A'}`);
        log(`Filing type: ${filingDetails.formType || 'N/A'}`);
        
        if (filingDetails.documents && filingDetails.documents.length > 0) {
          log(`Found ${filingDetails.documents.length} documents in filing`, 'success');
          
          // Create output directory for saving document list
          const outputDir = path.join(__dirname, 'test-output');
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          // Save document list to file
          const outputFile = path.join(outputDir, 'tesla_filing_documents.json');
          fs.writeFileSync(outputFile, JSON.stringify(filingDetails.documents, null, 2));
          log(`Documents list saved to ${outputFile}`, 'success');
          
          // Display information about the first few documents
          console.log('\nDocument Preview:');
          for (let i = 0; i < Math.min(3, filingDetails.documents.length); i++) {
            const doc = filingDetails.documents[i];
            console.log(`\nDocument ${i+1}:`);
            console.log(`- Description: ${doc.description}`);
            console.log(`- File Name: ${doc.fileName}`);
            console.log(`- URL: ${doc.documentUrl}`);
          }
          
          // Try to find the main document
          const mainDocument = filingDetails.documents.find((doc) => 
            doc.fileName.endsWith('.htm') || 
            doc.fileName.endsWith('.html') ||
            doc.description.includes('FILING DOCUMENT') ||
            doc.description.includes('PRIMARY DOCUMENT')
          );
          
          if (mainDocument) {
            log(`Found main document: ${mainDocument.fileName}`, 'success');
            
            // If there's a secService.getDocumentContent method, test it
            if (secService.getDocumentContent) {
              try {
                log(`Fetching content for main document...`);
                const content = await secService.getDocumentContent(mainDocument.documentUrl);
                log(`Successfully retrieved document content (${content.length} chars)`, 'success');
                
                // Save content to file
                const contentFile = path.join(outputDir, 'tesla_main_document.txt');
                fs.writeFileSync(contentFile, content);
                log(`Main document content saved to ${contentFile}`, 'success');
                
                // Display sample of content
                const contentSample = content.substring(0, 200).replace(/\n/g, ' ');
                console.log(`\nContent sample: "${contentSample}..."`);
              } catch (contentError) {
                log(`Error fetching document content: ${contentError.message}`, 'error');
              }
            } else {
              log('secService.getDocumentContent method not available, skipping content fetch', 'warning');
            }
          } else {
            log('Could not identify main document', 'warning');
          }
        } else {
          log('No documents found in filing details', 'warning');
        }
      }
    } catch (error) {
      log(`Error importing or using SEC service: ${error.message}`, 'error');
      console.error('Error details:', error.stack);
    }
    
    console.log('\n===== SEC SERVICE TEST COMPLETED =====');
  } catch (error) {
    log(`Test failed with error: ${error.message}`, 'error');
    console.error('Error details:', error.stack);
  }
}

// Run the test
runTest().catch(console.error);
