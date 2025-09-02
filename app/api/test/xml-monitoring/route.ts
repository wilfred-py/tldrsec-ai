/**
 * XML Monitoring Test API Route
 * 
 * This API route tests the XML logging and monitoring functionality
 * and returns the results for verification.
 */

import { NextResponse } from 'next/server';
import { generateXmlSummary, formatXmlSummary, visualizeContextReferences } from '../../../../lib/xmlLogging';
import { logger } from '../../../../lib/logging';

// Sample XML content for testing - using a simpler XML structure
const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<report>
  <header>
    <title>Quarterly Financial Report</title>
    <period>Q2 2023</period>
    <company>Example Corp</company>
  </header>
  <financials>
    <metric id="revenue" contextRef="Q22023" decimals="-3" unitRef="USD">1250000</metric>
    <metric id="expenses" contextRef="Q22023" decimals="-3" unitRef="USD">780000</metric>
    <metric id="profit" contextRef="Q22023" decimals="-3" unitRef="USD">470000</metric>
  </financials>
  <notes>
    <section id="1">
      <title>Revenue Recognition</title>
      <content>Revenue is recognized when the performance obligation is satisfied.</content>
    </section>
    <section id="2">
      <title>Operating Expenses</title>
      <content>Operating expenses include salaries, rent, and utilities.</content>
    </section>
  </notes>
</report>`;

/**
 * GET handler for XML monitoring test
 * @param request NextRequest object
 * @returns JSON response with XML monitoring test results
 */
export async function GET() {
  try {
    logger.info('Testing XML logging utility...');
    
    // Log the sample XML content
    logger.debug(`Sample XML content size: ${sampleXml.length} bytes`);
    
    // Generate XML summary with detailed logging
    logger.info('Generating XML summary...');
    const summary = generateXmlSummary(sampleXml);
    
    // Format the summary
    const formattedSummary = formatXmlSummary(summary);
    logger.info(`XML Summary: ${formattedSummary}`);
    
    // Generate context reference visualization if available
    let contextVisualization = null;
    if (summary.contextRefs && Object.keys(summary.contextRefs).length > 0) {
      contextVisualization = visualizeContextReferences(summary.contextRefs);
      logger.info(`Context visualization generated with ${Object.keys(summary.contextRefs).length} references`);
    } else {
      logger.info('No context references found for visualization');
    }
    
    // Prepare monitoring data
    const monitoringData = {
      hasXmlContent: true,
      xmlSize: sampleXml.length,
      hasEmbeddedHtml: summary.hasEmbeddedHtml,
      namespaceCount: Object.keys(summary.namespaces || {}).length,
      contextRefCount: Object.keys(summary.contextRefs || {}).length,
      namespaces: summary.namespaces,
      contextRefs: summary.contextRefs ? Object.keys(summary.contextRefs) : []
    };
    
    // Log any errors from the XML parsing
    if (summary.error) {
      logger.warn(`XML parsing produced an error: ${summary.error}`);
    }
    
    // Return the test results
    return NextResponse.json({
      success: true,
      xmlSummary: summary,
      formattedSummary,
      contextVisualization,
      monitoringData
    });
  } catch (error) {
    logger.error(`Error in XML monitoring test: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
