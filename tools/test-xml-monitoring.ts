/**
 * Test XML Monitoring
 * 
 * This script tests the XML logging and monitoring enhancements for SEC filing fetches.
 * It fetches a sample SEC filing with XML content and logs the monitoring data.
 * 
 * Usage:
 *   npx ts-node tools/test-xml-monitoring.ts [filingId]
 */

import { getFilingById } from '../services/filing/getFilingById';
import { getPrismaClient } from '../lib/db';
import { logger } from '../lib/logging';

// Sample filing IDs with XML content
const SAMPLE_FILING_IDS = [
  '0001193125-23-164627', // 10-Q with XML content
  '0001193125-23-088200', // 10-K with XML content
  '0001193125-23-172056'  // 8-K with XML content
];

/**
 * Fetches a filing and logs the XML monitoring data
 */
async function testXmlMonitoring(filingId?: string) {
  try {
    // Use provided filing ID or select a random one from samples
    const targetFilingId = filingId || SAMPLE_FILING_IDS[Math.floor(Math.random() * SAMPLE_FILING_IDS.length)];
    
    logger.info(`Testing XML monitoring with filing ID: ${targetFilingId}`);
    
    // Fetch the filing
    const result = await getFilingById(targetFilingId);
    
    // Check if the filing was fetched successfully
    if (!result.data) {
      logger.error(`Failed to fetch filing: ${targetFilingId}`);
      return;
    }
    
    logger.info(`Successfully fetched filing: ${targetFilingId}`);
    
    // Get the most recent fetch attempt for this filing
    const prisma = getPrismaClient();
    const fetchAttempt = await prisma.secFetchAttempt.findFirst({
      where: {
        filingId: targetFilingId
      },
      orderBy: {
        timestamp: 'desc'
      }
    });
    
    if (!fetchAttempt) {
      logger.warn(`No fetch attempt found for filing ID: ${targetFilingId}`);
      return;
    }
    
    // Log XML monitoring data
    logger.info(`XML Monitoring Data for filing ${targetFilingId}:`);
    logger.info(`- Has XML Content: ${fetchAttempt.hasXmlContent ? 'Yes' : 'No'}`);
    logger.info(`- XML Size: ${fetchAttempt.xmlSize} bytes`);
    logger.info(`- Has Embedded HTML: ${fetchAttempt.hasEmbeddedHtml ? 'Yes' : 'No'}`);
    logger.info(`- Namespace Count: ${fetchAttempt.namespaceCount}`);
    logger.info(`- Context Reference Count: ${fetchAttempt.contextRefCount}`);
    
    // Parse URL attempts
    const urlAttempts = JSON.parse(fetchAttempt.urlAttempts as string || '[]');
    
    // Find the first successful attempt with XML content
    const xmlAttempt = urlAttempts.find((a: any) => a.success && a.xmlSummary);
    
    if (xmlAttempt && xmlAttempt.xmlSummary) {
      logger.info('XML Summary:');
      logger.info(`- Total Elements: ${xmlAttempt.xmlSummary.totalElements}`);
      logger.info(`- Total Attributes: ${xmlAttempt.xmlSummary.totalAttributes}`);
      logger.info(`- Depth: ${xmlAttempt.xmlSummary.depth}`);
      
      if (xmlAttempt.xmlSummary.namespaces) {
        logger.info('- Namespaces:');
        Object.entries(xmlAttempt.xmlSummary.namespaces).forEach(([ns, count]) => {
          logger.info(`  - ${ns}: ${count}`);
        });
      }
      
      if (xmlAttempt.xmlSummary.contextRefs) {
        logger.info('- Context References:');
        Object.keys(xmlAttempt.xmlSummary.contextRefs).slice(0, 5).forEach(ref => {
          logger.info(`  - ${ref}`);
        });
        
        if (Object.keys(xmlAttempt.xmlSummary.contextRefs).length > 5) {
          logger.info(`  - ... and ${Object.keys(xmlAttempt.xmlSummary.contextRefs).length - 5} more`);
        }
      }
      
      if (xmlAttempt.parsingStages) {
        logger.info('- Parsing Stages:');
        logger.info(`  - Fetch Complete: ${xmlAttempt.parsingStages.fetchComplete ? 'Yes' : 'No'}`);
        logger.info(`  - XML Parsed: ${xmlAttempt.parsingStages.xmlParsed ? 'Yes' : 'No'}`);
        logger.info(`  - Namespaces Resolved: ${xmlAttempt.parsingStages.namespacesResolved ? 'Yes' : 'No'}`);
        logger.info(`  - Context References Valid: ${xmlAttempt.parsingStages.contextRefsValid ? 'Yes' : 'No'}`);
      }
    }
    
    logger.info('XML monitoring test completed successfully');
  } catch (error) {
    logger.error(`Error in XML monitoring test: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Get filing ID from command line arguments
const filingId = process.argv[2];

// Run the test
testXmlMonitoring(filingId)
  .then(() => process.exit(0))
  .catch(error => {
    logger.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
