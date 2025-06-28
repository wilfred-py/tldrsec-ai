#!/usr/bin/env node

/**
 * Comprehensive XML Test
 * 
 * This script tests XML parsing functionality with xmldom for both simple and complex XML
 * to help identify and fix issues with namespace handling and XML parsing.
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
  <us-gaap:Assets contextRef="AsOf2023Q1" decimals="-6" unitRef="USD">1000000</us-gaap:Assets>
  <div xmlns="http://www.w3.org/1999/xhtml">
    <p>This is embedded HTML content</p>
  </div>
</xbrl>`;

console.log('=== Comprehensive XML Test ===');

// Test simple XML first
console.log('\n--- Testing Simple XML ---');
testXmlParsing(simpleXml, 'simple');

// Test complex XML with namespaces
console.log('\n--- Testing Complex XML with Namespaces ---');
testXmlParsing(complexXml, 'complex');

/**
 * Test XML parsing with error handling
 * @param {string} xmlContent - The XML content to parse
 * @param {string} type - Type of XML (simple or complex)
 */
function testXmlParsing(xmlContent, type) {
  console.log(`Parsing ${type} XML...`);
  console.log(`XML size: ${xmlContent.length} bytes`);
  
  try {
    // Store original console methods
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    // Collect errors and warnings
    const xmlErrors = [];
    const xmlWarnings = [];
    
    // Override console methods to capture errors
    console.error = (msg) => {
      xmlErrors.push(String(msg));
    };
    
    console.warn = (msg) => {
      xmlWarnings.push(String(msg));
    };
    
    // Create parser with specific configuration for better namespace handling
    const parser = new DOMParser({
      locator: {}, // Enable position info
      errorHandler: { // Provide empty handlers to prevent exceptions
        warning: function() {},
        error: function() {},
        fatalError: function() {}
      }
    });
    
    // Try parsing with error suppression
    console.log('Attempting to parse XML...');
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Restore console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    
    // Check if we have a valid document
    if (doc && doc.documentElement) {
      console.log('✅ XML parsed successfully');
      console.log(`Root element: ${doc.documentElement.tagName}`);
      
      // Analyze document structure
      analyzeXmlStructure(doc);
      
      // Report any errors or warnings
      if (xmlErrors.length > 0) {
        console.log('\nXML Parsing Errors:');
        xmlErrors.forEach(err => console.log(`- ${err}`));
      }
      
      if (xmlWarnings.length > 0) {
        console.log('\nXML Parsing Warnings:');
        xmlWarnings.forEach(warn => console.log(`- ${warn}`));
      }
    } else {
      console.log('❌ Failed to parse XML: No document element found');
    }
  } catch (error) {
    console.error(`❌ Error parsing ${type} XML: ${error.message}`);
  }
}

/**
 * Analyze XML document structure
 * @param {Document} doc - The XML document to analyze
 */
function analyzeXmlStructure(doc) {
  // Initialize counters
  let elementCount = 0;
  let attributeCount = 0;
  const namespaces = {};
  const contextRefs = {};
  let hasEmbeddedHtml = false;
  
  // Process the document element
  processNode(doc.documentElement);
  
  // Output analysis results
  console.log('\nXML Analysis:');
  console.log(`- Elements: ${elementCount}`);
  console.log(`- Attributes: ${attributeCount}`);
  console.log(`- Namespaces: ${Object.keys(namespaces).length > 0 ? Object.keys(namespaces).join(', ') : 'none'}`);
  console.log(`- Context References: ${Object.keys(contextRefs).length > 0 ? Object.keys(contextRefs).join(', ') : 'none'}`);
  console.log(`- Has Embedded HTML: ${hasEmbeddedHtml ? 'Yes' : 'No'}`);
  
  /**
   * Process an XML node recursively
   * @param {Node} node - The node to process
   */
  function processNode(node) {
    if (!node) return;
    
    // Process element nodes
    if (node.nodeType === 1) { // ELEMENT_NODE
      elementCount++;
      
      // Check for namespaces in tag name
      const tagName = node.nodeName;
      if (tagName && tagName.includes(':')) {
        const namespace = tagName.split(':')[0];
        namespaces[namespace] = true;
      }
      
      // Check for attributes
      if (node.attributes) {
        attributeCount += node.attributes.length;
        
        // Check for xmlns attributes
        for (let i = 0; i < node.attributes.length; i++) {
          const attr = node.attributes[i];
          
          // Check for namespace declarations
          if (attr.name.startsWith('xmlns:')) {
            const ns = attr.name.split(':')[1];
            namespaces[ns] = true;
          } else if (attr.name === 'xmlns') {
            namespaces['default'] = true;
          }
          
          // Check for context references
          if (attr.name === 'contextRef') {
            contextRefs[attr.value] = true;
          }
        }
      }
      
      // Check for embedded HTML
      if (tagName === 'div' || tagName === 'p' || tagName === 'span' || tagName === 'br') {
        hasEmbeddedHtml = true;
      }
      
      // Process child nodes
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          processNode(node.childNodes[i]);
        }
      }
    }
  }
}
