#!/usr/bin/env node

/**
 * XBRL Content Extraction Script
 * 
 * This script demonstrates the extraction of content from an XBRL file
 * without depending on complex module imports.
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// File path to the sample XBRL file
const xbrlFilePath = path.join(__dirname, '../../assets/sample-sec-filing.xbrl');

// Utility function to format output
function formatOutput(label, content) {
  console.log('\n' + '='.repeat(80));
  console.log(`${label}:`);
  console.log('='.repeat(80));
  
  if (typeof content === 'object') {
    console.log(JSON.stringify(content, null, 2));
  } else {
    console.log(content);
  }
}

// Simple function to detect filing type
function detectFilingType(content) {
  const contentStr = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  
  // Check for DocumentType in XBRL
  if (contentStr.includes('<dei:DocumentType>')) {
    const match = contentStr.match(/<dei:DocumentType>([^<]+)<\/dei:DocumentType>/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return 'Unknown';
}

// Extract metadata from XBRL
function extractMetadata(content) {
  const contentStr = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  const metadata = {};
  
  // Company name
  const companyMatch = contentStr.match(/<dei:EntityRegistrantName>([^<]+)<\/dei:EntityRegistrantName>/);
  if (companyMatch && companyMatch[1]) {
    metadata.companyName = companyMatch[1].trim();
  }
  
  // Document period end date
  const periodMatch = contentStr.match(/<dei:DocumentPeriodEndDate>([^<]+)<\/dei:DocumentPeriodEndDate>/);
  if (periodMatch && periodMatch[1]) {
    metadata.periodEndDate = periodMatch[1].trim();
  }
  
  // Fiscal year
  const fiscalYearMatch = contentStr.match(/<dei:DocumentFiscalYearFocus>([^<]+)<\/dei:DocumentFiscalYearFocus>/);
  if (fiscalYearMatch && fiscalYearMatch[1]) {
    metadata.fiscalYear = fiscalYearMatch[1].trim();
  }
  
  return metadata;
}

// Extract financial metrics from XBRL
function extractFinancialMetrics(content) {
  const contentStr = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  const metrics = {};
  
  // Parse the XML
  const options = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  };
  
  try {
    const parser = new XMLParser(options);
    const result = parser.parse(contentStr);
    
    // Extract metrics from us-gaap namespace
    const usGaapMatches = contentStr.match(/<us-gaap:([^>]+)>([^<]+)<\/us-gaap:[^>]+>/g) || [];
    
    usGaapMatches.forEach(match => {
      const metricMatch = match.match(/<us-gaap:([^>]+)>([^<]+)<\/us-gaap:[^>]+>/);
      if (metricMatch && metricMatch[1] && metricMatch[2]) {
        const metricName = metricMatch[1];
        const metricValue = metricMatch[2].trim();
        
        // Convert to number if possible
        const numValue = Number(metricValue);
        metrics[metricName] = isNaN(numValue) ? metricValue : numValue;
      }
    });
    
    return metrics;
  } catch (error) {
    console.error('Error parsing XBRL:', error);
    return {};
  }
}

// Main function
async function main() {
  console.log('XBRL Content Extraction Test');
  console.log('==========================\n');
  
  // Check if the file exists
  if (!fs.existsSync(xbrlFilePath)) {
    console.error(`File not found: ${xbrlFilePath}`);
    process.exit(1);
  }
  
  console.log(`Processing XBRL file: ${path.basename(xbrlFilePath)}`);
  
  // Read the file
  const content = fs.readFileSync(xbrlFilePath);
  
  // Detect filing type
  const filingType = detectFilingType(content);
  formatOutput('Detected Filing Type', filingType);
  
  // Extract metadata
  const metadata = extractMetadata(content);
  formatOutput('Extracted Metadata', metadata);
  
  // Extract financial metrics
  const financialMetrics = extractFinancialMetrics(content);
  formatOutput('Extracted Financial Metrics', financialMetrics);
  
  console.log('\nExtraction complete!');
}

// Run the main function
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 