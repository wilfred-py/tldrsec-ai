/**
 * Test script for XBRL parser
 * 
 * This script demonstrates how to use the XBRL parser to process XBRL SEC filings.
 * It can either use a sample XBRL string or load an XBRL file from disk.
 */

const fs = require('fs');
const path = require('path');
const { parseXBRL, parseXBRLAsSECFiling } = require('../demo-xbrl-parser');
const { createAutoParser } = require('../demo-filing-parser-factory');

// Set up output directory
const OUTPUT_DIR = path.join(__dirname, 'xbrl-parser-results');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Simple logger
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

/**
 * Create a minimal XBRL string for testing
 * This function generates a small XBRL document with some financial data
 * for testing when no real XBRL document is available
 */
function createSampleXBRLString() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" 
      xmlns:xbrli="http://www.xbrl.org/2003/instance"
      xmlns:dei="http://xbrl.sec.gov/dei/2021"
      xmlns:us-gaap="http://fasb.org/us-gaap/2021">
  <dei:DocumentType>10-K</dei:DocumentType>
  <dei:EntityRegistrantName>Tesla, Inc.</dei:EntityRegistrantName>
  <dei:DocumentPeriodEndDate>2023-12-31</dei:DocumentPeriodEndDate>
  <dei:DocumentFiscalYearFocus>2023</dei:DocumentFiscalYearFocus>
  <dei:DocumentFiscalPeriodFocus>FY</dei:DocumentFiscalPeriodFocus>
  
  <!-- Context definitions -->
  <xbrli:context id="FY2023">
    <xbrli:entity>
      <xbrli:identifier scheme="http://www.sec.gov/CIK">0001318605</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:startDate>2023-01-01</xbrli:startDate>
      <xbrli:endDate>2023-12-31</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>
  
  <xbrli:context id="AsOf2023-12-31">
    <xbrli:entity>
      <xbrli:identifier scheme="http://www.sec.gov/CIK">0001318605</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:instant>2023-12-31</xbrli:instant>
    </xbrli:period>
  </xbrli:context>
  
  <!-- Unit definitions -->
  <xbrli:unit id="USD">
    <xbrli:measure>iso4217:USD</xbrli:measure>
  </xbrli:unit>
  
  <xbrli:unit id="shares">
    <xbrli:measure>xbrli:shares</xbrli:measure>
  </xbrli:unit>
  
  <xbrli:unit id="usd-per-share">
    <xbrli:divide>
      <xbrli:numerator>
        <xbrli:measure>iso4217:USD</xbrli:measure>
      </xbrli:numerator>
      <xbrli:denominator>
        <xbrli:measure>xbrli:shares</xbrli:measure>
      </xbrli:denominator>
    </xbrli:divide>
  </xbrli:unit>
  
  <!-- Financial facts -->
  <us-gaap:Revenue contextRef="FY2023" unitRef="USD" decimals="-6">96773000000</us-gaap:Revenue>
  <us-gaap:NetIncomeLoss contextRef="FY2023" unitRef="USD" decimals="-6">15173000000</us-gaap:NetIncomeLoss>
  <us-gaap:EarningsPerShareBasic contextRef="FY2023" unitRef="usd-per-share" decimals="2">4.82</us-gaap:EarningsPerShareBasic>
  <us-gaap:EarningsPerShareDiluted contextRef="FY2023" unitRef="usd-per-share" decimals="2">4.59</us-gaap:EarningsPerShareDiluted>
  
  <us-gaap:AssetsCurrent contextRef="AsOf2023-12-31" unitRef="USD" decimals="-6">40456000000</us-gaap:AssetsCurrent>
  <us-gaap:AssetsNoncurrent contextRef="AsOf2023-12-31" unitRef="USD" decimals="-6">91450000000</us-gaap:AssetsNoncurrent>
  <us-gaap:Assets contextRef="AsOf2023-12-31" unitRef="USD" decimals="-6">131906000000</us-gaap:Assets>
  
  <us-gaap:LiabilitiesCurrent contextRef="AsOf2023-12-31" unitRef="USD" decimals="-6">28403000000</us-gaap:LiabilitiesCurrent>
  <us-gaap:LiabilitiesNoncurrent contextRef="AsOf2023-12-31" unitRef="USD" decimals="-6">14625000000</us-gaap:LiabilitiesNoncurrent>
  <us-gaap:Liabilities contextRef="AsOf2023-12-31" unitRef="USD" decimals="-6">43028000000</us-gaap:Liabilities>
  
  <us-gaap:StockholdersEquity contextRef="AsOf2023-12-31" unitRef="USD" decimals="-6">88878000000</us-gaap:StockholdersEquity>
  
  <us-gaap:CashAndCashEquivalentsAtCarryingValue contextRef="AsOf2023-12-31" unitRef="USD" decimals="-6">29140000000</us-gaap:CashAndCashEquivalentsAtCarryingValue>
</xbrl>`;
}

/**
 * Main function to run the XBRL parser demo
 */
async function runXBRLParserDemo() {
  try {
    logger.info('Starting XBRL parser demo');
    
    // Create or load XBRL content
    let xbrlContent;
    const sampleXbrlPath = path.join(__dirname, '..', 'assets', 'sample-sec-filing.xbrl');
    
    if (fs.existsSync(sampleXbrlPath)) {
      logger.info(`Loading XBRL from ${sampleXbrlPath}`);
      xbrlContent = fs.readFileSync(sampleXbrlPath);
    } else {
      logger.info('No sample XBRL found, using generated sample XBRL');
      xbrlContent = Buffer.from(createSampleXBRLString());
    }
    
    // Test direct XBRL parser
    logger.info('Testing direct XBRL parser...');
    const xbrlDoc = parseXBRL(xbrlContent.toString('utf8'));
    
    // Save parsed XBRL to a JSON file
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'xbrl-document.json'),
      JSON.stringify(xbrlDoc, null, 2)
    );
    logger.info(`XBRL document saved to ${path.join(OUTPUT_DIR, 'xbrl-document.json')}`);
    
    // Test XBRL to SEC Filing conversion
    logger.info('Testing XBRL to SEC Filing conversion...');
    const parsedFiling = await parseXBRLAsSECFiling(xbrlContent);
    
    // Save the parsed filing to a JSON file
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'xbrl-filing.json'),
      JSON.stringify(parsedFiling, null, 2)
    );
    logger.info(`Parsed filing saved to ${path.join(OUTPUT_DIR, 'xbrl-filing.json')}`);
    
    // Test auto parser with XBRL detection
    logger.info('Testing auto parser with XBRL detection...');
    const autoDetectedFiling = await createAutoParser(xbrlContent);
    
    // Save the auto-detected filing to a JSON file
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'xbrl-auto-filing.json'),
      JSON.stringify(autoDetectedFiling, null, 2)
    );
    logger.info(`Auto-detected filing saved to ${path.join(OUTPUT_DIR, 'xbrl-auto-filing.json')}`);
    
    // Display some information about the parsed XBRL
    logger.info('\nXBRL Parser Results:');
    logger.info(`Company: ${xbrlDoc.documentInfo.companyName || 'Unknown'}`);
    logger.info(`Filing Date: ${xbrlDoc.documentInfo.filingDate || 'Unknown'}`);
    logger.info(`Document Type: ${xbrlDoc.documentInfo.documentType || 'Unknown'}`);
    logger.info(`Number of contexts: ${Object.keys(xbrlDoc.contexts).length}`);
    logger.info(`Number of units: ${Object.keys(xbrlDoc.units).length}`);
    logger.info(`Number of facts: ${xbrlDoc.facts.length}`);
    
    // Display standardized metrics
    logger.info('\nStandardized Financial Metrics:');
    for (const [metric, facts] of Object.entries(xbrlDoc.standardizedMetrics)) {
      if (facts.length > 0) {
        const values = facts.map(fact => {
          const context = xbrlDoc.contexts[fact.contextRef];
          let periodInfo = '';
          
          if (context?.period) {
            if (context.period.instant) {
              periodInfo = `As of ${context.period.instant}`;
            } else if (context.period.startDate && context.period.endDate) {
              periodInfo = `From ${context.period.startDate} to ${context.period.endDate}`;
            }
          }
          
          return `${fact.value} (${periodInfo})`;
        });
        
        logger.info(`  ${metric}: ${values.join(', ')}`);
      }
    }
    
    logger.info('\nXBRL parser demo completed successfully');
  } catch (error) {
    logger.error('XBRL parser demo failed:', error);
  }
}

// Run the demo
runXBRLParserDemo(); 