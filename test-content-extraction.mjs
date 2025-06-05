/**
 * Test Script for SEC Filing Content Extraction
 * 
 * This script tests the content extraction for TSLA filings directly
 * using the SEC service without importing TypeScript modules.
 * 
 * Run with: node test-content-extraction.mjs
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fetch from 'node-fetch';
import axios from 'axios';

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

// Manual implementation of content extraction for testing
async function extractFilingContent(filingUrl, filingType) {
  log(`Extracting content from ${filingType} filing at ${filingUrl}`);
  
  try {
    // Generate SEC-compatible User-Agent
    const userAgent = 'Mozilla/5.0 (compatible; TLDRsecTestBot/1.0; +https://tldrsec.com)'; 
    
    // Fetch the filing directly
    const response = await axios.get(filingUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      },
      timeout: 15000 // 15 second timeout
    });
    
    let content = response.data;
    
    // If content is HTML, extract text and clean it up
    if (typeof content === 'string' && (content.includes('<html') || content.includes('<!DOCTYPE'))) {
      // Remove HTML tags, scripts, styles while preserving content structure
      content = content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // If content is XML, convert it to a more readable format
    if (typeof content === 'string' && content.includes('<?xml')) {
      // Try to extract readable text from XML
      content = content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    return content;
  } catch (error) {
    log(`Error extracting content: ${error.message}`, 'error');
    throw error;
  }
}

async function runTest() {
  try {
    console.log('===== TESTING SEC FILING CONTENT EXTRACTION =====\n');
    
    // Test URLs for TSLA filings
    const testUrls = [
      // 10-K filing (annual report) - Latest available annual report
      {
        url: 'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000095017024014378/tsla-20231231.htm',
        formType: '10-K'
      },
      // 10-Q filing (quarterly report) - Latest available quarterly report
      {
        url: 'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000095017024026454/tsla-20240331.htm',
        formType: '10-Q'
      },
      // 8-K filing (current report) - Recent material event
      {
        url: 'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000095017024028562/tsla-20240424.htm',
        formType: '8-K'
      },
      // Form 4 (insider trading) - Recent insider transaction
      {
        url: 'https://www.sec.gov/Archives/edgar/data/1494730/000089924324013822/xslF345X04/doc4.xml',
        formType: '4'
      }
    ];
    
    // Create output directory for saving extracted content
    const outputDir = path.join(__dirname, 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    log('Created output directory: ' + outputDir, 'success');
    
    // Test each URL
    for (const test of testUrls) {
      log(`\nTesting content extraction for TSLA ${test.formType} filing:`, 'info');
      log(`URL: ${test.url}`, 'info');
      
      try {
        // Measure extraction time
        const startTime = Date.now();
        
        // Extract filing content
        const content = await extractFilingContent(test.url, test.formType);
        
        const duration = (Date.now() - startTime) / 1000;
        
        // Check if content was extracted
        if (!content) {
          log(`No content extracted for ${test.formType}`, 'error');
          continue;
        }
        
        // Log success with content length and sample
        log(`Content extracted successfully (${content.length} chars in ${duration.toFixed(2)}s)`, 'success');
        
        // Show sample of the content (first 200 chars)
        const contentSample = content.substring(0, 200).replace(/\n/g, ' ');
        console.log(`Content sample: "${contentSample}..."`);
        
        // Save the content to a file for inspection
        const outputFile = path.join(outputDir, `tsla_${test.formType.replace(/[^a-zA-Z0-9]/g, '_')}_content.txt`);
        fs.writeFileSync(outputFile, content);
        log(`Content saved to: ${outputFile}`, 'success');
        
        // Check if content seems valid
        const contentIsValid = content.length > 1000; // Assuming valid content is at least 1000 chars
        if (contentIsValid) {
          log(`Content length appears valid (${content.length} chars)`, 'success');
        } else {
          log(`Content length suspiciously short (${content.length} chars)`, 'warning');
        }
      } catch (error) {
        log(`Error extracting content for ${test.formType}: ${error.message}`, 'error');
        console.error('Error details:', error.stack);
      }
    }
    
    console.log('\n===== CONTENT EXTRACTION TEST COMPLETED =====');
  } catch (error) {
    log(`Test failed with error: ${error.message}`, 'error');
    console.error('Error details:', error.stack);
  }
}

// Run the test
runTest().catch(console.error);
