/**
 * Enhanced Form Parser
 * 
 * This module integrates the improved SEC filing extractor with the existing form-parser
 * to provide better content extraction for inline XBRL and complex SEC filings.
 */

import { FilingType } from '../sec-edgar/types';
import { ParsedContent, parseFormContent, extractImportantContent } from './form-parser';
import { extractEnhancedFilingContent, formatForSummarization, detectFilingType } from './sec-filing-integration';
import { logger } from '../logging';

// Create a module-specific logger
const parserLogger = logger.child('enhanced-form-parser');

/**
 * Enhanced version of parseFormContent that uses the improved SEC filing extractor
 * for inline XBRL and complex filings
 * 
 * @param content The raw content to parse
 * @param filingType The type of filing
 * @param url Optional URL of the filing for direct extraction
 * @returns Parsed content with sections and key data
 */
export async function parseFormContentEnhanced(
  content: string, 
  filingType: FilingType, 
  url?: string
): Promise<ParsedContent> {
  try {
    // If we have a URL, try to use the enhanced extractor directly
    if (url) {
      parserLogger.debug(`Using enhanced extractor for URL: ${url}`);
      const extractionResult = await extractEnhancedFilingContent(url, { debug: true });
      
      // Type assertion to define the expected structure
      const typedResult = extractionResult as {
        success: boolean;
        content: string;
        metadata: {
          filingType?: string;
          extractionMethod?: string;
        };
      };
      
      if (typedResult.success && typedResult.content) {
        parserLogger.info(`Successfully extracted content from ${url} using enhanced extractor`);
        
        // Format the content for better parsing
        const formattedContent = formatForSummarization(typedResult.content, {
          maxLength: 100000,
          includeBoilerplate: false
        });
        
        // Detect filing type if not provided
        const detectedFilingType = filingType || 
          (typedResult.metadata?.filingType as FilingType) || 
          detectFilingType(url, formattedContent) as FilingType;
        
        // Use the standard parser with the enhanced content
        const parsedContent = parseFormContent(formattedContent, detectedFilingType);
        
        // Add metadata about the enhanced extraction
        parsedContent.metadata = {
          ...parsedContent.metadata,
          enhancedExtraction: true,
          extractionMethod: typedResult.metadata?.extractionMethod,
          originalUrl: url
        };
        
        return parsedContent;
      }
      
      parserLogger.warn(`Enhanced extraction failed for ${url}, falling back to standard parser`);
    }
    
    // Check if content appears to be inline XBRL
    if (content.includes('xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"') || 
        content.includes('<ix:header') || 
        content.includes('<ix:hidden')) {
      parserLogger.info('Content appears to be inline XBRL, using enhanced processing');
      
      try {
        // Process the inline XBRL content to extract meaningful text
        // This is a simplified version since we don't have direct URL access
        const cleanedContent = content
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<ix:header[^>]*>[\s\S]*?<\/ix:header>/gi, '')
          .replace(/<ix:hidden[^>]*>[\s\S]*?<\/ix:hidden>/gi, '')
          .replace(/<ix:[^>]*>/g, '')
          .replace(/<\/ix:[^>]*>/g, '');
        
        // Use the standard parser with the cleaned content
        const parsedContent = parseFormContent(cleanedContent, filingType);
        
        // Add metadata about the enhanced processing
        parsedContent.metadata = {
          ...parsedContent.metadata,
          enhancedExtraction: true,
          extractionMethod: 'inline-xbrl-cleanup',
          isInlineXbrl: true
        };
        
        return parsedContent;
      } catch (error) {
        const typedError = error as Error;
        parserLogger.error(`Error processing inline XBRL content: ${typedError.message}`);
        throw error; // Re-throw the error
      }
    }
    
    // Fall back to standard parser
    parserLogger.debug(`Using standard parser for content`);
    return parseFormContent(content, filingType);
  } catch (error) {
    const typedError = error as Error;
    parserLogger.error(`Error in enhanced form parser: ${typedError.message}`);
    // Fall back to standard parser
    return parseFormContent(content, filingType);
  }
}

/**
 * Enhanced version of extractImportantContent that provides better content
 * extraction for summarization
 * 
 * @param parsedContent The parsed content
 * @param maxLength Maximum length of the extracted content
 * @returns The most important content for summarization
 */
export function extractImportantContentEnhanced(
  parsedContent: ParsedContent, 
  maxLength: number = 10000
): string {
  // If this content was processed with enhanced extraction, we may want
  // to handle it differently for summarization
  if (parsedContent.metadata?.enhancedExtraction) {
    // For now, we'll use the standard extractor but we could add
    // specialized handling here in the future
    return extractImportantContent(parsedContent, maxLength);
  }
  
  // Fall back to standard extractor
  return extractImportantContent(parsedContent, maxLength);
}

export default {
  parseFormContentEnhanced,
  extractImportantContentEnhanced
};
