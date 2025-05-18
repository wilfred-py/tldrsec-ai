/**
 * Demo SEC Filing Parser Factory
 * 
 * JavaScript version of the filing parser factory for demonstration purposes.
 */

const { parsePDFFromBuffer, isPDF } = require('./demo-pdf-parser');
const fs = require('fs');
const path = require('path');

// Create a simple logger
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err || ''),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

// Default options
const DEFAULT_OPTIONS = {
  extractImportantSections: true,
  includeFullText: false,
  maxFullTextLength: 500000,
  includeRawHtml: false,
  maxSectionLength: 100000,
  preserveWhitespace: false,
  extractTables: true,
  extractLists: true,
  removeBoilerplate: true,
};

/**
 * Detects the filing type from content
 * 
 * @param {string|Buffer} content - The content to analyze
 * @returns {string|null} The detected filing type or null if not detected
 */
function detectFilingType(content) {
  // Check if this is a PDF file
  if (isPDF(content)) {
    logger.debug('Content appears to be a PDF file');
    return 'PDF'; // Special type to indicate PDF
  }
  
  // For HTML content, convert buffer to string if needed
  const html = Buffer.isBuffer(content) ? content.toString('utf8', 0, 2000) : content;
  
  // Simple regex-based detection from title or content
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  // Check for common patterns in the title
  if (/Form 10-K|Annual Report|10-K/i.test(title)) return '10-K';
  if (/Form 10-Q|Quarterly Report|10-Q/i.test(title)) return '10-Q';
  if (/Form 8-K|Current Report|8-K/i.test(title)) return '8-K';
  if (/Form 4|Statement of Changes|beneficial ownership/i.test(title)) return 'Form4';
  if (/DEFA14A|DEFA 14A|Additional Proxy Materials|Additional Proxy Soliciting/i.test(title)) return 'DEFA14A';
  if (/Schedule 13D|SC 13D|beneficial ownership report/i.test(title)) return 'SC 13D';
  if (/Form 144|Notice of Proposed Sale/i.test(title)) return '144';
  
  // Check content if title doesn't provide clear indication
  if (/Form 10-K/i.test(html)) return '10-K';
  if (/Form 10-Q/i.test(html)) return '10-Q';
  if (/Form 8-K/i.test(html)) return '8-K';
  if (/DEFA14A|DEFA 14A|Additional Proxy Materials/i.test(html)) return 'DEFA14A';
  
  // No recognized pattern found
  return null;
}

/**
 * Parse a PDF file as an SEC filing
 * 
 * @param {Buffer} buffer - The PDF buffer
 * @param {Object} options - Parser options
 * @returns {Object} A parsed SEC filing object
 */
async function parsePDFAsSECFiling(buffer, options = {}) {
  try {
    logger.debug('Parsing PDF as SEC filing');
    
    // Parse the PDF
    const sections = await parsePDFFromBuffer(buffer, options);
    
    // Find metadata
    const metadataSection = sections.find(section => 
      section.type === 'section' && section.title === 'Metadata'
    );
    
    // Extract important sections based on headings
    const importantSections = {};
    
    // Look for common important sections in SEC filings
    const sectionNames = [
      'Management\'s Discussion and Analysis',
      'Risk Factors',
      'Financial Statements',
      'Notes to Financial Statements',
      'Controls and Procedures',
      'Quantitative and Qualitative Disclosures',
      'Business',
      'Item 1.',
      'Item 1A.',
      'Item 7.',
      'Item 8.',
    ];
    
    // Find sections that match important section names
    for (const section of sections) {
      if (section.title) {
        for (const sectionName of sectionNames) {
          if (section.title.includes(sectionName)) {
            importantSections[sectionName] = section.content;
            break;
          }
        }
      }
    }
    
    // Extract tables
    const tables = sections.filter(section => section.type === 'table');
    
    // Create a ParsedSECFiling object
    const result = {
      filingType: 'PDF',
      importantSections,
      sections,
      tables,
      lists: sections.filter(section => section.type === 'list'),
    };
    
    // Add metadata if available
    if (metadataSection && metadataSection.metadata) {
      // Create a proper metadata object
      const metadata = {
        filingType: 'PDF',
        ...metadataSection.metadata
      };
      
      // Add metadata to result
      result.metadata = metadata;
      
      // Extract company name if available
      if (metadataSection.metadata.Author) {
        result.companyName = metadataSection.metadata.Author;
      }
      
      // Extract filing date if available
      if (metadataSection.metadata.CreationDate) {
        try {
          // Parse PDF date format (typically like "D:20201231120000+00'00'")
          const dateString = metadataSection.metadata.CreationDate;
          if (dateString.startsWith('D:')) {
            const year = parseInt(dateString.substring(2, 6));
            const month = parseInt(dateString.substring(6, 8)) - 1;
            const day = parseInt(dateString.substring(8, 10));
            result.filingDate = new Date(year, month, day);
          }
        } catch (error) {
          logger.error('Error parsing PDF creation date:', error);
        }
      }
    }
    
    return result;
  } catch (error) {
    logger.error('Error parsing PDF as SEC filing:', error);
    throw new Error(`Failed to parse PDF as SEC filing: ${error}`);
  }
}

/**
 * Creates a parser for a filing based on its detected type
 * 
 * @param {string|Buffer} content - The content to parse (HTML string or PDF buffer)
 * @param {Object} options - Parser options to apply
 * @returns {Promise<Object>} The parsed SEC filing
 * @throws {Error} If the filing type cannot be detected
 */
async function createAutoParser(content, options = {}) {
  try {
    // Handle Buffer input
    const contentForDetection = Buffer.isBuffer(content) ? content.toString('utf8', 0, 1000) : content;
    
    // Try to detect the filing type
    const detectedType = detectFilingType(contentForDetection);
    
    if (!detectedType) {
      logger.warn('Could not detect filing type from content');
      throw new Error('Unable to determine SEC filing type from content');
    }
    
    logger.debug(`Auto-detected filing type: ${detectedType}`);
    
    // Check if this is a PDF file
    if (detectedType === 'PDF') {
      // For PDF files, process differently
      logger.debug('Processing PDF file');
      
      // Make sure content is a Buffer
      if (!Buffer.isBuffer(content)) {
        content = Buffer.from(content);
      }
      
      // Parse the PDF
      return await parsePDFAsSECFiling(content, options);
    }
    
    // For HTML files, we would normally create and use the appropriate parser
    // In this demo version, we'll just return dummy data
    logger.info(`Detected HTML filing of type: ${detectedType}`);
    return {
      filingType: detectedType,
      importantSections: {},
      sections: [],
      companyName: 'Demo Company (HTML parsing not implemented in demo)',
      filingDate: new Date()
    };
  } catch (error) {
    logger.error('Error in auto parser:', error);
    throw error;
  }
}

module.exports = {
  detectFilingType,
  createAutoParser,
  parsePDFAsSECFiling,
  isPDF
}; 