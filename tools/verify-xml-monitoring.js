#!/usr/bin/env node

/**
 * Verify XML Monitoring System
 * 
 * This script verifies the XML parsing and database connectivity for the SEC filing XML monitoring system.
 * It tests:
 * 1. XML parsing with namespace handling
 * 2. Database connectivity and table existence
 * 3. SEC fetch attempt recording
 */

import { PrismaClient } from '../lib/generated/prisma/index.js';
import { DOMParser } from '@xmldom/xmldom';

// Direct implementation of XML summary generation to avoid TypeScript import issues
function generateXmlSummary(xmlContent) {
  // Initialize summary object
  const summary = {
    totalElements: 0,
    totalAttributes: 0,
    depth: 0,
    namespaces: {},
    elementCounts: {},
    contextRefs: {},
    hasEmbeddedHtml: false,
    size: {
      bytes: xmlContent.length,
      category: 'small',
    },
    truncated: false
  };

  // Categorize the size
  if (xmlContent.length < 100000) {
    summary.size.category = 'small';
  } else if (xmlContent.length < 1000000) {
    summary.size.category = 'medium';
  } else if (xmlContent.length < 10000000) {
    summary.size.category = 'large';
  } else {
    summary.size.category = 'very_large';
  }

  try {
    // Skip parsing if content is empty
    if (!xmlContent || xmlContent.trim().length === 0) {
      console.warn('Empty XML content provided');
      return summary;
    }
    
    // Clean up the XML content - trim leading/trailing whitespace
    const cleanXmlContent = xmlContent.trim();
    
    // Store original console methods to restore later
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    // Temporarily suppress console errors/warnings during parsing
    const xmlErrors = [];
    console.error = (msg) => xmlErrors.push(String(msg));
    console.warn = (msg) => {}; // Suppress warnings
    
    // Try parsing with different approaches
    let doc;
    let parsingSuccessful = false;
    
    // Attempt 1: Standard parsing
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(cleanXmlContent, 'text/xml');
      
      if (doc && doc.documentElement) {
        parsingSuccessful = true;
        console.log('XML parsed successfully with standard parsing');
      }
    } catch (error) {
      console.log(`Standard parsing failed: ${error instanceof Error ? error.message : String(error)}`);
      xmlErrors.push(`Standard parsing error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Attempt 2: Try with namespace handling if first attempt failed
    if (!parsingSuccessful) {
      try {
        // Try again with a different approach - strip problematic namespace declarations
        // This is a fallback for developer debugging only
        const simplifiedXml = cleanXmlContent
          .replace(/xmlns:[^=]*="[^"]*"/g, '') // Remove namespace declarations
          .replace(/:[^\s\/>]*/g, ''); // Remove namespace prefixes from tags
        
        const parser = new DOMParser();
        doc = parser.parseFromString(simplifiedXml, 'text/xml');
        
        if (doc && doc.documentElement) {
          parsingSuccessful = true;
          console.log('XML parsed successfully with namespace stripping');
          summary.error = 'Used namespace stripping fallback - some namespace information may be lost';
        }
      } catch (error) {
        console.log(`Namespace stripping parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        xmlErrors.push(`Namespace stripping error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Restore console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    
    // Log any errors that occurred during parsing
    if (xmlErrors.length > 0) {
      const errorSample = xmlErrors[0];
      console.log(`XML parsing produced ${xmlErrors.length} errors/warnings. Sample: ${errorSample}`);
      summary.error = errorSample; // Store first error in summary
    }
    
    // Check if we have a valid document element
    if (doc && doc.documentElement) {
      // Process the document to gather statistics
      processNode(doc.documentElement, summary, 0);
    } else {
      console.warn('Failed to parse XML: No document element found');
      summary.error = 'Failed to parse XML: No document element found';
    }
    
    return summary;
  } catch (error) {
    console.error(`Error generating XML summary: ${error instanceof Error ? error.message : String(error)}`);
    summary.error = `Error: ${error instanceof Error ? error.message : String(error)}`;
    return summary;
  }
}

// Process XML node recursively
function processNode(node, summary, depth) {
  // Update depth tracking
  summary.depth = Math.max(summary.depth, depth);
  
  // Process element nodes
  if (node.nodeType === 1) { // Element node
    // Count the element
    summary.totalElements++;
    
    // Track element type
    const tagName = node.tagName;
    summary.elementCounts[tagName] = (summary.elementCounts[tagName] || 0) + 1;
    
    // Check for namespaces in tag name
    if (tagName.includes(':')) {
      const namespace = tagName.split(':')[0];
      summary.namespaces[namespace] = (summary.namespaces[namespace] || 0) + 1;
    }
    
    // Check for xmlns attributes
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        summary.totalAttributes++;
        
        // Check for namespace declarations
        if (attr.name.startsWith('xmlns:')) {
          const namespace = attr.name.split(':')[1];
          summary.namespaces[namespace] = (summary.namespaces[namespace] || 0) + 1;
        }
        
        // Check for contextRef attributes
        if (attr.name === 'contextRef') {
          summary.contextRefs[attr.value] = true;
        }
      }
    }
    
    // Check for embedded HTML
    if (!summary.hasEmbeddedHtml) {
      const htmlTags = ['div', 'span', 'p', 'br', 'table', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'a', 'img'];
      const tagLower = tagName.toLowerCase();
      if (htmlTags.includes(tagLower) || tagName.includes(':') && htmlTags.includes(tagName.split(':')[1].toLowerCase())) {
        summary.hasEmbeddedHtml = true;
      }
    }
    
    // Process child nodes recursively
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        processNode(node.childNodes[i], summary, depth + 1);
      }
    }
  }
}

// Sample XML with namespaces (simplified from SEC filings)
const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" 
      xmlns:xbrli="http://www.xbrl.org/2003/instance"
      xmlns:us-gaap="http://fasb.org/us-gaap/2021-01-31">
  <context id="c1">
    <entity>
      <identifier scheme="http://www.sec.gov/CIK">0000123456</identifier>
    </entity>
    <period>
      <instant>2023-03-31</instant>
    </period>
  </context>
  <us-gaap:Assets contextRef="c1">1000000</us-gaap:Assets>
</xbrl>`;

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
 * Test XML parsing with namespace handling
 */
async function testXmlParsing() {
  console.log('\n=== Testing XML Parsing ===');
  
  try {
    console.log('Parsing sample XML with namespaces...');
    
    // Generate XML summary using our utility function
    const summary = generateXmlSummary(sampleXml);
    
    // Display the summary
    console.log('\nXML Summary:');
    console.log(`- Total Elements: ${summary.totalElements}`);
    console.log(`- Total Attributes: ${summary.totalAttributes}`);
    console.log(`- Depth: ${summary.depth}`);
    console.log(`- Namespaces: ${Object.keys(summary.namespaces).length}`);
    Object.entries(summary.namespaces).forEach(([ns, count]) => {
      console.log(`  - ${ns}: ${count} occurrences`);
    });
    console.log(`- Context References: ${Object.keys(summary.contextRefs).length}`);
    Object.keys(summary.contextRefs).forEach(ref => {
      console.log(`  - ${ref}`);
    });
    console.log(`- Has Embedded HTML: ${summary.hasEmbeddedHtml}`);
    console.log(`- Size: ${summary.size.bytes} bytes (${summary.size.category})`);
    
    // Check for errors
    if (summary.error) {
      console.log(`\n⚠️ Warning: ${summary.error}`);
    } else {
      console.log('\n✅ XML parsing successful with no errors');
    }
    
    return summary;
  } catch (error) {
    console.error(`\n❌ XML parsing failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test database connectivity and table existence
 */
async function testDatabaseConnection() {
  console.log('\n=== Testing Database Connection ===');
  
  try {
    // Get Prisma client
    const prisma = getPrismaClient();
    
    // Test database connection
    console.log('Testing database connection...');
    await prisma.$connect();
    console.log('✅ Successfully connected to database');
    
    // Check if secFetchAttempt table exists by querying it
    console.log('\nChecking secFetchAttempt table...');
    try {
      const count = await prisma.secFetchAttempt.count();
      console.log(`✅ secFetchAttempt table exists with ${count} records`);
      return true;
    } catch (tableError) {
      console.error(`❌ Error accessing secFetchAttempt table: ${tableError.message}`);
      console.log('\nChecking if table exists in database schema...');
      
      // Try to query the information schema to check if the table exists
      try {
        const tables = await prisma.$queryRaw`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'`;
        
        console.log('Available tables in database:');
        console.log(tables);
        
        // Check specifically for secFetchAttempt table (case insensitive)
        const secFetchTable = tables.find(t => 
          t.table_name.toLowerCase() === 'secfetchattempt' || 
          t.table_name.toLowerCase() === 'sec_fetch_attempt');
        
        if (secFetchTable) {
          console.log(`✅ Table found in database schema as ${secFetchTable.table_name}`);
          return true;
        } else {
          console.log('❌ SecFetchAttempt table not found in database schema');
          console.log('Run Prisma migration to create the table:');
          console.log('npx prisma migrate dev --name add_sec_fetch_attempt');
          return false;
        }
      } catch (schemaError) {
        console.error(`❌ Error querying database schema: ${schemaError.message}`);
        return false;
      }
    }
  } catch (error) {
    console.error(`❌ Database connection check failed: ${error.message}`);
    return false;
  }
}

/**
 * Test SEC fetch attempt recording
 */
async function testSecFetchRecording() {
  console.log('\n=== Testing SEC Fetch Recording ===');
  
  try {
    // Get Prisma client
    const prisma = getPrismaClient();
    
    // Create a test fetch attempt
    const testAttempt = {
      filingId: 'TEST-' + Date.now(),
      ticker: 'TEST',
      formType: 'TEST-FORM',
      urlAttempts: JSON.stringify([
        {
          url: 'https://example.com/test',
          success: true,
          statusCode: 200,
          timestamp: Date.now(),
          parsingStages: {
            fetchComplete: true,
            xmlParsed: true,
            namespacesResolved: true,
            contextRefsValid: true
          }
        }
      ]),
      successful: true,
      attemptCount: 1,
      successCount: 1,
      timestamp: new Date(),
      hasXmlContent: true,
      xmlSize: sampleXml.length,
      hasEmbeddedHtml: false,
      namespaceCount: 3,
      contextRefCount: 1
    };
    
    console.log('Creating test SEC fetch attempt record...');
    const result = await prisma.secFetchAttempt.create({
      data: testAttempt
    });
    
    console.log(`✅ Successfully created SEC fetch attempt record with ID: ${result.id}`);
    
    // Verify the record was created
    const fetchedRecord = await prisma.secFetchAttempt.findUnique({
      where: { id: result.id }
    });
    
    if (fetchedRecord) {
      console.log('✅ Successfully verified SEC fetch attempt record');
      
      // Clean up the test record
      await prisma.secFetchAttempt.delete({
        where: { id: result.id }
      });
      
      console.log('✅ Test record cleaned up');
      return true;
    } else {
      console.error('❌ Failed to verify SEC fetch attempt record');
      return false;
    }
  } catch (error) {
    console.error(`❌ SEC fetch recording test failed: ${error.message}`);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('=== XML Monitoring System Verification ===');
  
  try {
    // Test XML parsing
    const xmlSummary = await testXmlParsing();
    
    // Test database connection
    const dbConnected = await testDatabaseConnection();
    
    // Test SEC fetch recording if database is connected
    let secFetchRecorded = false;
    if (dbConnected) {
      secFetchRecorded = await testSecFetchRecording();
    }
    
    // Print overall results
    console.log('\n=== Verification Results ===');
    console.log(`XML Parsing: ${xmlSummary && !xmlSummary.error ? '✅ PASS' : '⚠️ PARTIAL'}`);
    console.log(`Database Connection: ${dbConnected ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`SEC Fetch Recording: ${secFetchRecorded ? '✅ PASS' : dbConnected ? '❌ FAIL' : '⏭️ SKIPPED'}`);
    
    // Disconnect from database
    const prisma = getPrismaClient();
    await prisma.$disconnect();
    
  } catch (error) {
    console.error(`\n❌ Verification failed: ${error.message}`);
    
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

// Run all tests
runAllTests().catch(console.error);
