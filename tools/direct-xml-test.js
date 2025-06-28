/**
 * Direct XML Monitoring Test
 * 
 * This script directly tests the XML logging utility and SEC fetch monitoring
 * without relying on API endpoints.
 */

import { generateXmlSummary, formatXmlSummary } from '../lib/xmlLogging.ts';
import { logger } from '../lib/logging.js';

// Sample XML content for testing
const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
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
 * Test XML logging functionality
 */
function testXmlLogging() {
  try {
    logger.info('Testing XML logging utility...');
    
    // Generate XML summary
    const summary = generateXmlSummary(sampleXml);
    
    // Format and log the summary
    const formattedSummary = formatXmlSummary(summary);
    logger.info('XML Summary:');
    logger.info(formattedSummary);
    
    // Log XML monitoring data
    logger.info('XML Monitoring Data:');
    logger.info(`- Has XML Content: ${true}`);
    logger.info(`- XML Size: ${sampleXml.length} bytes`);
    logger.info(`- Has Embedded HTML: ${summary.hasEmbeddedHtml ? 'Yes' : 'No'}`);
    logger.info(`- Namespace Count: ${Object.keys(summary.namespaces || {}).length}`);
    logger.info(`- Context Reference Count: ${Object.keys(summary.contextRefs || {}).length}`);
    
    // Log namespaces
    if (summary.namespaces) {
      logger.info('- Namespaces:');
      Object.entries(summary.namespaces).forEach(([ns, count]) => {
        logger.info(`  - ${ns}: ${count}`);
      });
    }
    
    // Log context references
    if (summary.contextRefs) {
      logger.info('- Context References:');
      Object.keys(summary.contextRefs).forEach(ref => {
        logger.info(`  - ${ref}`);
      });
    }
    
    logger.info('XML logging test completed successfully');
  } catch (error) {
    logger.error(`Error in XML logging test: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Run the test
testXmlLogging();
