#!/usr/bin/env node

/**
 * Simple XML Test
 * 
 * This script tests basic XML parsing functionality with xmldom
 */

import { DOMParser } from '@xmldom/xmldom';

// Sample XML content
const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <element id="1">Text content</element>
  <element id="2">More content</element>
</root>`;

console.log('=== Simple XML Test ===');
console.log('Parsing simple XML...');

try {
  // Create parser
  const parser = new DOMParser();
  
  // Parse XML
  const doc = parser.parseFromString(sampleXml, 'text/xml');
  
  // Check if parsing was successful
  if (doc && doc.documentElement) {
    console.log('✅ XML parsed successfully');
    console.log(`Root element: ${doc.documentElement.tagName}`);
    
    // Count child elements
    const elements = doc.getElementsByTagName('element');
    console.log(`Found ${elements.length} element nodes`);
    
    // Output element content
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const id = element.getAttribute('id');
      const content = element.textContent;
      console.log(`Element #${id}: ${content}`);
    }
  } else {
    console.log('❌ Failed to parse XML');
  }
} catch (error) {
  console.error(`Error parsing XML: ${error.message}`);
}

console.log('Test completed');
