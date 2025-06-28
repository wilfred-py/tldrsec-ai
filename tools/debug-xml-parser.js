#!/usr/bin/env node

/**
 * Debug XML Parser
 * 
 * A focused script to debug XML parsing issues with @xmldom/xmldom
 * Specifically designed to handle namespace issues in SEC filings
 */

import { DOMParser } from '@xmldom/xmldom';

// Simple XML for baseline testing
const simpleXml = `<?xml version="1.0" encoding="UTF-8"?>
<report>
  <header>
    <title>Test Report</title>
  </header>
  <content>Simple content</content>
</report>`;

// Complex XML with namespaces (simplified from SEC filings)
const complexXml = `<?xml version="1.0" encoding="UTF-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance">
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

console.log('=== XML Parser Debug ===');

// Test both XML samples
console.log('\n1. Testing Simple XML');
parseXml(simpleXml);

console.log('\n2. Testing Complex XML with Namespaces');
parseXml(complexXml);

/**
 * Parse XML with detailed error reporting
 */
function parseXml(xml) {
  console.log(`XML length: ${xml.length} bytes`);
  
  try {
    // Capture errors and warnings
    const errors = [];
    const warnings = [];
    
    // Override console methods temporarily
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = (msg) => errors.push(String(msg));
    console.warn = (msg) => warnings.push(String(msg));
    
    // First attempt: standard parsing
    console.log('\nAttempt 1: Standard parsing');
    const parser1 = new DOMParser();
    const doc1 = parser1.parseFromString(xml, 'text/xml');
    
    // Check result
    if (doc1 && doc1.documentElement) {
      console.log(`✅ Parsing successful - Root: <${doc1.documentElement.tagName}>`);
    } else {
      console.log('❌ Parsing failed - No document element');
    }
    
    // Show any errors/warnings
    if (errors.length > 0) {
      console.log(`Found ${errors.length} errors:`);
      errors.forEach((err, i) => console.log(`  ${i+1}. ${err}`));
      errors.length = 0; // Clear for next attempt
    }
    
    if (warnings.length > 0) {
      console.log(`Found ${warnings.length} warnings:`);
      warnings.forEach((warn, i) => console.log(`  ${i+1}. ${warn}`));
      warnings.length = 0; // Clear for next attempt
    }
    
    // Second attempt: with namespace handling options
    console.log('\nAttempt 2: With namespace handling');
    const parser2 = new DOMParser({
      xmlns: true,           // Enable namespace processing
      locator: {}            // Enable position info
    });
    const doc2 = parser2.parseFromString(xml, 'text/xml');
    
    // Check result
    if (doc2 && doc2.documentElement) {
      console.log(`✅ Parsing successful - Root: <${doc2.documentElement.tagName}>`);
      
      // Try to count elements
      try {
        const elements = countElements(doc2.documentElement);
        console.log(`Found ${elements.total} elements (${elements.withNamespace} with namespaces)`);
      } catch (countError) {
        console.log(`Error counting elements: ${countError.message}`);
      }
    } else {
      console.log('❌ Parsing failed - No document element');
    }
    
    // Show any errors/warnings
    if (errors.length > 0) {
      console.log(`Found ${errors.length} errors:`);
      errors.forEach((err, i) => console.log(`  ${i+1}. ${err}`));
    }
    
    if (warnings.length > 0) {
      console.log(`Found ${warnings.length} warnings:`);
      warnings.forEach((warn, i) => console.log(`  ${i+1}. ${warn}`));
    }
    
    // Restore console methods
    console.error = originalError;
    console.warn = originalWarn;
    
  } catch (error) {
    console.error(`❌ Exception: ${error.message}`);
  }
}

/**
 * Count elements in the document, including those with namespaces
 */
function countElements(node) {
  const result = { total: 0, withNamespace: 0 };
  
  function traverse(n) {
    if (!n) return;
    
    if (n.nodeType === 1) { // Element node
      result.total++;
      
      // Check for namespace
      if (n.tagName.includes(':')) {
        result.withNamespace++;
      }
      
      // Process children
      if (n.childNodes) {
        for (let i = 0; i < n.childNodes.length; i++) {
          traverse(n.childNodes[i]);
        }
      }
    }
  }
  
  traverse(node);
  return result;
}
