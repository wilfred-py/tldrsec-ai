/**
 * Form 144 Parser Module
 * 
 * Provides functionality for parsing Form 144 filings
 */

import { DOMParser } from '@xmldom/xmldom';
import { secLogger } from '../../../utils/logger';
import { Form144ParsedContent } from '../../../types/sec/form144';

/**
 * Extracts Form 144 information from a filing
 * @param filing The filing details
 * @returns Parsed Form 144 data
 */
export async function parseForm144(filing: { 
  content: string; 
  companyName: string; 
  filingDate: string 
}): Promise<Form144ParsedContent | null> {
  try {
    // Extract XML content using string pattern matching
    const xmlPattern = /<XML>([\s\S]*?)<\/XML>/i;
    const xmlMatch = filing.content.match(xmlPattern);
    if (!xmlMatch || !xmlMatch[1]) {
      secLogger.warn('No XML content found in Form 144 filing');
      return null;
    }

    const xmlContent = xmlMatch[1].trim();
    
    // Parse XML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Helper function to get text content from XML nodes
    const getNodeText = (xpathExpression: string): string => {
      try {
        // @ts-ignore - xmldom's DOMParser doesn't have proper TypeScript definitions for evaluate
        const nodes = doc.evaluate(xpathExpression, doc, null, 0, null);
        let result = '';
        let node;
        // @ts-ignore - iterateNext() might not be defined in TypeScript types
        while ((node = nodes.iterateNext())) {
          result += node.textContent || '';
        }
        return result.trim();
      } catch (error) {
        return '';
      }
    };
    
    // Extract data from XML
    const reportingPerson = getNodeText('//ns1:reportingOwner/ns1:reportingOwnerId/ns1:rptOwnerName/text()');
    const reportingPersonTitle = getNodeText('//ns1:reportingOwner/ns1:reportingOwnerRelationship/ns1:officerTitle/text()');
    const relationshipToIssuer = getNodeText('//ns1:reportingOwner/ns1:reportingOwnerRelationship/ns1:directorOrOfficer/text()');
    const dateOfSale = getNodeText('//ns1:saleDate/text()');
    const amountOfSecurities = getNodeText('//ns1:amountOfSecurities/text()');
    const proposedSaleDate = getNodeText('//ns1:proposedSaleDate/text()');
    const broker = getNodeText('//ns1:brokerName/text()');
    const note = getNodeText('//ns1:remarks/text()');

    return {
      reportingPerson,
      reportingPersonTitle,
      relationshipToIssuer,
      dateOfSale,
      amountOfSecurities,
      proposedSaleDate,
      broker,
      note
    };
  } catch (error) {
    secLogger.error('Error parsing Form 144 filing:', error);
    return null;
  }
}
