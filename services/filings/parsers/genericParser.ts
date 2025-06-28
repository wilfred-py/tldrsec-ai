/**
 * Generic Parser Module
 * 
 * Provides shared parsing functionality for SEC filings
 */

import { secLogger } from '../../../utils/logger';
import { SecFilingDetails } from '../../../types/sec/filing';

/**
 * Parses a filing document to extract structured content
 * @param filing The filing details
 * @param formType The type of form being parsed
 * @returns Parsed content structure
 */
export async function parseFilingContent(
  filing: SecFilingDetails, 
  formType: string
): Promise<Record<string, any> | null> {
  try {
    // Extract basic metadata
    const metadata = {
      accessionNumber: filing.accessionNumber,
      formType,
      filingDate: filing.filingDate,
      documentCount: filing.documents?.length || 0
    };
    
    // Extract primary document content if available
    let primaryContent = '';
    if (filing.primaryDocument && filing.documents) {
      const primaryDoc = filing.documents.find(doc => doc.filename === filing.primaryDocument);
      if (primaryDoc) {
        primaryContent = primaryDoc.content || '';
      }
    }
    
    // If no primary content but we have documents, use the first one
    if (!primaryContent && filing.documents && filing.documents.length > 0) {
      primaryContent = filing.documents[0].content || '';
    }
    
    // If still no content, use the full filing text
    if (!primaryContent && filing.content) {
      primaryContent = filing.content;
    }
    
    return {
      ...metadata,
      primaryContent,
      hasXml: primaryContent.includes('<XML>') || primaryContent.includes('<?xml'),
      hasHtml: primaryContent.includes('<html>') || primaryContent.includes('<HTML>'),
      documentTypes: filing.documents?.map(doc => doc.type) || []
    };
  } catch (error) {
    secLogger.error(`Error parsing ${formType} filing:`, error);
    return null;
  }
}
