#!/usr/bin/env node

/**
 * Test SEC Filing Monitoring Workflow
 * 
 * This script tests the full SEC filing content retrieval and monitoring workflow:
 * 1. Fetches a real SEC filing by accession number
 * 2. Processes the XML content
 * 3. Records the fetch attempt in the database
 * 4. Verifies the monitoring data
 */

import { PrismaClient } from '../lib/generated/prisma/index.js';
import axios from 'axios';

// SEC filing test data - Apple Inc. 10-K filing from 2022
const TEST_ACCESSION_NUMBER = '0000320193-22-000108'; // Verified Apple Inc. filing accession number
const TEST_CIK = '0000320193'; // Apple Inc. CIK
const TEST_FORM_TYPE = '10-K'; // Form type
const SEC_USER_AGENT = 'Mozilla/5.0 (compatible; TLDRSecAI/1.0; support@tldrsec.ai)';

// Initialize Prisma client
let prismaInstance = null;

function getPrismaClient() {
  if (!prismaInstance) {
    try {
      prismaInstance = new PrismaClient();
      console.log('✅ Prisma client initialized successfully');
    } catch (error) {
      console.error(`❌ Failed to initialize Prisma client: ${error.message}`);
      throw error;
    }
  }
  return prismaInstance;
}

/**
 * Fetch SEC filing content
 */
async function fetchSecFiling(accessionNumber, cik, formType) {
  console.log(`\n=== Fetching SEC Filing: ${accessionNumber} (CIK: ${cik}, Form: ${formType}) ===`);
  
  try {
    // Normalize the accession number (remove dashes)
    const normalizedAccessionNumber = accessionNumber.replace(/-/g, '');
    
    // Normalize CIK (remove leading zeros)
    const normalizedCik = cik.replace(/^0+/, '');
    
    // Try different URL patterns to fetch the filing
    const urls = [
      // Primary document URL (most reliable)
      `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${normalizedAccessionNumber}/${accessionNumber}.txt`,
      
      // Index URL for directory listing
      `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${normalizedAccessionNumber}/index.json`,
      
      // XML document URL (for XML submissions)
      `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${normalizedAccessionNumber}/${accessionNumber}.xml`,
      
      // Form-specific URLs
      ...(formType === '4' ? [
        `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${normalizedAccessionNumber}/xslF345X03/${accessionNumber}.xml`
      ] : []),
      
      // Fallback URLs
      `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${normalizedAccessionNumber}/primary-document.xml`
    ];
    
    // Try each URL
    for (const url of urls) {
      try {
        console.log(`Trying URL: ${url}`);
        
        const response = await axios.get(url, {
          headers: {
            'User-Agent': SEC_USER_AGENT
          }
        });
        
        console.log(`✅ Successfully fetched content from ${url}`);
        console.log(`Status: ${response.status}`);
        console.log(`Content Type: ${response.headers['content-type']}`);
        console.log(`Content Length: ${response.data.length} bytes`);
        
        // Check if content is XML
        const isXml = 
          response.headers['content-type']?.includes('xml') || 
          (typeof response.data === 'string' && response.data.trim().startsWith('<?xml'));
        
        if (isXml) {
          console.log('Content is XML format');
        } else {
          console.log('Content is not XML format');
        }
        
        return {
          content: response.data,
          url,
          isXml,
          statusCode: response.status
        };
      } catch (error) {
        console.error(`❌ Error fetching from ${url}: ${error.message}`);
      }
    }
    
    throw new Error(`Failed to fetch filing content for ${accessionNumber} from any URL`);
  } catch (error) {
    console.error(`❌ Filing fetch failed: ${error.message}`);
    throw error;
  }
}

/**
 * Record fetch attempt in database
 */
async function recordFetchAttempt(accessionNumber, cik, formType, fetchResult) {
  console.log(`\n=== Recording Fetch Attempt for ${accessionNumber} ===`);
  
  try {
    const prisma = getPrismaClient();
    
    // Create URL attempt record
    const urlAttempt = {
      url: fetchResult.url,
      success: true,
      statusCode: fetchResult.statusCode,
      timestamp: Date.now(),
      parsingStages: {
        fetchComplete: true,
        xmlParsed: fetchResult.isXml,
        namespacesResolved: false,
        contextRefsValid: false
      }
    };
    
    // Create fetch attempt record
    const fetchAttempt = {
      filingId: accessionNumber,
      ticker: 'AAPL',  // Apple Inc. ticker for test
      formType: formType, // Form type from parameters
      urlAttempts: JSON.stringify([urlAttempt]),
      successful: true,
      attemptCount: 1,
      successCount: 1,
      timestamp: new Date(),
      hasXmlContent: fetchResult.isXml,
      xmlSize: fetchResult.content.length,
      hasEmbeddedHtml: false, // Simplified for test
      namespaceCount: 0,      // Simplified for test
      contextRefCount: 0      // Simplified for test
    };
    
    console.log('Creating SEC fetch attempt record...');
    const result = await prisma.secFetchAttempt.create({
      data: fetchAttempt
    });
    
    console.log(`✅ Successfully created SEC fetch attempt record with ID: ${result.id}`);
    return result.id;
  } catch (error) {
    console.error(`❌ Failed to record fetch attempt: ${error.message}`);
    throw error;
  }
}

/**
 * Verify monitoring data in database
 */
async function verifyMonitoringData(recordId) {
  console.log(`\n=== Verifying Monitoring Data ===`);
  
  try {
    const prisma = getPrismaClient();
    
    // Fetch the record
    const record = await prisma.secFetchAttempt.findUnique({
      where: { id: recordId }
    });
    
    if (!record) {
      throw new Error(`Record with ID ${recordId} not found`);
    }
    
    console.log('Fetch attempt record found:');
    console.log(`- Filing ID: ${record.filingId}`);
    console.log(`- Timestamp: ${record.timestamp}`);
    console.log(`- Successful: ${record.successful}`);
    console.log(`- Attempt Count: ${record.attemptCount}`);
    console.log(`- Success Count: ${record.successCount}`);
    console.log(`- Has XML Content: ${record.hasXmlContent}`);
    console.log(`- XML Size: ${record.xmlSize} bytes`);
    
    // Parse URL attempts
    const urlAttempts = JSON.parse(record.urlAttempts);
    console.log(`- URL Attempts: ${urlAttempts.length}`);
    urlAttempts.forEach((attempt, index) => {
      console.log(`  [${index + 1}] ${attempt.url} - ${attempt.success ? '✅' : '❌'}`);
    });
    
    console.log('✅ Successfully verified monitoring data');
    return record;
  } catch (error) {
    console.error(`❌ Failed to verify monitoring data: ${error.message}`);
    throw error;
  }
}

/**
 * Run the full test workflow
 */
async function runTest() {
  console.log('=== SEC Filing Monitoring Workflow Test ===');
  
  try {
    // Step 1: Fetch SEC filing
    const fetchResult = await fetchSecFiling(TEST_ACCESSION_NUMBER, TEST_CIK, TEST_FORM_TYPE);
    
    // Step 2: Record fetch attempt
    const recordId = await recordFetchAttempt(TEST_ACCESSION_NUMBER, TEST_CIK, TEST_FORM_TYPE, fetchResult);
    
    // Step 3: Verify monitoring data
    const record = await verifyMonitoringData(recordId);
    
    // Step 4: Clean up test data
    console.log('\n=== Cleaning Up Test Data ===');
    const prisma = getPrismaClient();
    await prisma.secFetchAttempt.delete({
      where: { id: recordId }
    });
    console.log('✅ Test record cleaned up');
    
    // Print overall results
    console.log('\n=== Test Results ===');
    console.log('SEC Filing Fetch: ✅ PASS');
    console.log('Fetch Attempt Recording: ✅ PASS');
    console.log('Monitoring Data Verification: ✅ PASS');
    
    // Disconnect from database
    await prisma.$disconnect();
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    
    // Try to disconnect from database even if tests fail
    try {
      if (prismaInstance) {
        await prismaInstance.$disconnect();
      }
    } catch (disconnectError) {
      // Ignore disconnect errors
    }
    
    process.exit(1);
  }
}

// Run the test
runTest().catch(console.error);
