#!/usr/bin/env node

/**
 * Comprehensive XML Test
 * 
 * This script tests XML parsing functionality with xmldom for both simple and complex XML
 */

import { DOMParser } from '@xmldom/xmldom';

// Simple XML content for testing
const simpleXml = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <element id="1">Text content</element>
  <element id="2">More content</element>
</root>`;

// Complex XML content with namespaces for testing
const complexXml = `<?xml version="1.0" encoding="UTF-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" 
      xmlns:link="http://www.xbrl.org/2003/linkbase" 
      xmlns:xlink="http://www.w3.org/1999/xlink">
  <link:schemaRef xlink:href="http://example.com/schema.xsd" />
  <context id="AsOf2023Q1">
    <entity>
      <identifier scheme="http://www.sec.gov/CIK">0000123456</identifier>
    </entity>
    <period>
      <instant>2023-03-31</instant>
    </period>
  </context>
  <context id="AsOf2023Q2">
    <entity>
      <identifier scheme="http://www.sec.gov/CIK">0000123456</identifier>
    </entity>
    <period>
      <instant>2023-06-30</instant>
    </period>
  </context>
  <us-gaap:Assets contextRef="AsOf2023Q1" decimals="-6" unitRef="USD">1000000</us-gaap:Assets>
  <us-gaap:Assets contextRef="AsOf2023Q2" decimals="-6" unitRef="USD">1200000</us-gaap:Assets>
  <us-gaap:Liabilities contextRef="AsOf2023Q1" decimals="-6" unitRef="USD">500000</us-gaap:Liabilities>
  <us-gaap:Liabilities contextRef="AsOf2023Q2" decimals="-6" unitRef="USD">600000</us-gaap:Liabilities>
  <div xmlns="http://www.w3.org/1999/xhtml">
    <p>This is embedded HTML content</p>
  </div>
</xbrl>`;

/**
 * Simple function to analyze XML content
 */
function analyzeXml(xmlContent) {
  console.log('Analyzing XML content...');
  
  try {
    // Trim XML content
    const cleanXmlContent = xmlContent.trim();
    console.log(`XML size: ${cleanXmlContent.length} bytes`);
    
    // Collect errors and warnings
    const xmlErrors = [];
    const xmlWarnings = [];
    
    // Create parser with default configuration
    const parser = new DOMParser();
    
    // Set up error handling via a custom error handler
    // Store original console methods
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    // Override console methods to capture errors
    console.error = (msg) => {
      xmlErrors.push(String(msg));
    };
    
    console.warn = (msg) => {
      xmlWarnings.push(String(msg));
    };
    
    // Parse the XML
    console.log('Parsing XML document...');
    const doc = parser.parseFromString(cleanXmlContent, 'text/xml');
    
    // Restore original console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    
    // Basic validation
    if (!doc || !doc.documentElement) {
      console.log('❌ Failed to parse XML: No document element found');
      return;
    }
    
    console.log('✅ XML parsed successfully');
    console.log(`Root element: ${doc.documentElement.tagName}`);
    
    // Test simple XML first
    console.log('\n--- Testing Simple XML ---');
    testXmlParsing(simpleXml, 'simple');
    
    // Test complex XML with namespaces
    console.log('\n--- Testing Complex XML with Namespaces ---');
    testXmlParsing(complexXml, 'complex');
          namespaces[namespace] = (namespaces[namespace] || 0) + 1;
        }
        
        // Check for attributes
        if (node.attributes) {
          attributeCount += node.attributes.length;
          
          // Check for contextRef attribute
          const contextRef = node.getAttribute && node.getAttribute('contextRef');
          if (contextRef) {
            contextRefs[contextRef] = true;
          }
        }
        
        // Check for embedded HTML
        if (tagName && (tagName.toLowerCase() === 'html' || 
            tagName.toLowerCase() === 'div' || 
            tagName.toLowerCase() === 'p' || 
            tagName.toLowerCase() === 'span')) {
          hasEmbeddedHtml = true;
        }
      }
      
      // Process child nodes
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          countElements(node.childNodes[i]);
        }
      }
    }
    
    // Count elements starting from the root
    countElements(doc.documentElement);
    
    // Output results
    console.log(`Total elements: ${elementCount}`);
    console.log(`Total attributes: ${attributeCount}`);
    console.log(`Namespaces: ${Object.keys(namespaces).join(', ')} (${Object.keys(namespaces).length} total)`);
    console.log(`Context references: ${Object.keys(contextRefs).length} total`);
    console.log(`Has embedded HTML: ${hasEmbeddedHtml ? 'Yes' : 'No'}`);
    
    // Output any errors or warnings
    if (xmlErrors && xmlErrors.length > 0) {
      console.log('\nXML Parsing Errors:');
      xmlErrors.forEach(err => console.log(`- ${err}`));
    }
    
    if (xmlWarnings && xmlWarnings.length > 0) {
      console.log('\nXML Parsing Warnings:');
      xmlWarnings.forEach(warn => console.log(`- ${warn}`));
    }
    
  } catch (error) {
    console.error(`Failed to analyze XML: ${error.message}`);
  }
}

// Run the analysis
console.log('=== XML Parser Test ===');
analyzeXml(sampleXml);
console.log('\nTest completed');
