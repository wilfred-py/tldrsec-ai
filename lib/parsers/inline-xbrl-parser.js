/**
 * Inline XBRL Parser
 * 
 * This module provides specialized parsing for inline XBRL (iXBRL) documents
 * commonly used in SEC filings. It extracts meaningful text content from
 * these structured documents for summarization purposes.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { JSDOM } = require('jsdom');

// SEC API headers - CRITICAL for avoiding 403 errors
const SEC_HEADERS = {
  'User-Agent': 'tldrSEC/1.0 (contact@tldrsec.app)',
  'Accept-Encoding': 'gzip, deflate',
  'Host': 'www.sec.gov'
};

/**
 * Extracts meaningful text content from an inline XBRL document
 * 
 * @param {string} htmlContent - The raw HTML/XBRL content
 * @param {object} options - Configuration options
 * @param {boolean} options.debug - Whether to include debug information
 * @param {boolean} options.includeTablesData - Whether to include table data
 * @returns {object} Extracted content and metadata
 */
function extractContentFromInlineXbrl(htmlContent, options = {}) {
  const { debug = false, includeTablesData = true } = options;
  
  // Initialize results object
  const result = {
    title: '',
    sections: [],
    metadata: {},
    tables: [],
    success: false,
    contentLength: 0,
    debugInfo: debug ? { parsingSteps: [] } : null
  };
  
  if (!htmlContent) {
    if (debug) result.debugInfo.parsingSteps.push('Empty content received');
    return result;
  }
  
  try {
    if (debug) result.debugInfo.parsingSteps.push('Starting inline XBRL parsing');
    
    // Check if this is actually inline XBRL
    const isInlineXbrl = 
      htmlContent.includes('xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"') || 
      htmlContent.includes('ix:header') || 
      htmlContent.includes('ix:hidden') ||
      htmlContent.includes('inline XBRL');
    
    if (!isInlineXbrl) {
      if (debug) result.debugInfo.parsingSteps.push('Content is not inline XBRL, falling back to standard HTML parsing');
      return parseStandardHtml(htmlContent, options);
    }
    
    if (debug) result.debugInfo.parsingSteps.push('Confirmed inline XBRL content');
    
    // Use JSDOM for more robust parsing
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    // Extract title
    result.title = document.title || '';
    if (debug) result.debugInfo.parsingSteps.push(`Extracted title: ${result.title}`);
    
    // Extract metadata from ix:hidden section if present
    const hiddenSection = document.querySelector('ix\\:hidden') || document.querySelector('[id="hidden"]');
    if (hiddenSection) {
      if (debug) result.debugInfo.parsingSteps.push('Found ix:hidden section, extracting metadata');
      // We don't want to include this content in our extraction
    }
    
    // Extract main content sections
    // First look for standard SEC filing sections
    const mainContentSections = [
      ...Array.from(document.querySelectorAll('div[id^="item"]')),
      ...Array.from(document.querySelectorAll('div[id^="ITEM"]')),
      ...Array.from(document.querySelectorAll('h1, h2, h3, h4')),
      ...Array.from(document.querySelectorAll('div.WordSection'))
    ];
    
    if (mainContentSections.length > 0) {
      if (debug) result.debugInfo.parsingSteps.push(`Found ${mainContentSections.length} main content sections`);
      
      // Process each section
      mainContentSections.forEach(section => {
        const sectionTitle = section.tagName.toLowerCase().startsWith('h') 
          ? section.textContent.trim()
          : (section.querySelector('h1, h2, h3, h4')?.textContent.trim() || section.id || 'Untitled Section');
        
        // Get the text content, removing scripts and styles
        let sectionContent = section.textContent || '';
        
        // Clean up the text content
        sectionContent = sectionContent
          .replace(/\s+/g, ' ')
          .trim();
        
        if (sectionContent.length > 0) {
          result.sections.push({
            title: sectionTitle,
            content: sectionContent
          });
        }
      });
    } else {
      // Fallback: if no standard sections found, extract all paragraphs and div blocks
      if (debug) result.debugInfo.parsingSteps.push('No standard sections found, extracting paragraphs and div blocks');
      
      const paragraphs = document.querySelectorAll('p, div:not([id="hidden"]):not([class="hidden"])');
      const textBlocks = Array.from(paragraphs)
        .map(p => p.textContent.trim())
        .filter(text => text.length > 50); // Only include substantial paragraphs
      
      if (textBlocks.length > 0) {
        result.sections.push({
          title: 'Main Content',
          content: textBlocks.join('\n\n')
        });
      }
    }
    
    // Extract tables if requested
    if (includeTablesData) {
      const tables = document.querySelectorAll('table');
      if (tables.length > 0) {
        if (debug) result.debugInfo.parsingSteps.push(`Found ${tables.length} tables`);
        
        tables.forEach((table, index) => {
          // Skip tiny tables that are likely formatting tables
          if (table.rows.length <= 1 && table.rows[0]?.cells.length <= 1) return;
          
          const tableData = {
            title: `Table ${index + 1}`,
            headers: [],
            rows: []
          };
          
          // Extract table headers
          const headerRow = table.querySelector('tr th') ? table.querySelector('tr') : null;
          if (headerRow) {
            tableData.headers = Array.from(headerRow.querySelectorAll('th')).map(th => th.textContent.trim());
          }
          
          // Extract table rows
          const dataRows = headerRow ? 
            Array.from(table.querySelectorAll('tr')).slice(1) : 
            Array.from(table.querySelectorAll('tr'));
          
          dataRows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
            if (cells.some(cell => cell.length > 0)) {
              tableData.rows.push(cells);
            }
          });
          
          if (tableData.rows.length > 0) {
            result.tables.push(tableData);
          }
        });
      }
    }
    
    // Calculate total content length
    let totalContent = result.sections.map(section => section.content).join(' ');
    result.contentLength = totalContent.length;
    
    // Set success flag based on content extraction
    result.success = result.contentLength > 100; // At least some meaningful content
    
    if (debug) {
      result.debugInfo.parsingSteps.push(`Extracted ${result.sections.length} sections with total length ${result.contentLength}`);
      result.debugInfo.parsingSteps.push(`Extracted ${result.tables.length} tables`);
      result.debugInfo.contentSample = totalContent.substring(0, 500) + (totalContent.length > 500 ? '...' : '');
    }
    
    return result;
  } catch (error) {
    if (debug) {
      result.debugInfo.parsingSteps.push(`Error parsing inline XBRL: ${error.message}`);
      result.debugInfo.error = error.message;
    }
    return result;
  }
}

/**
 * Fallback parser for standard HTML content
 */
function parseStandardHtml(htmlContent, options = {}) {
  const { debug = false, includeTablesData = true } = options;
  
  // Initialize results object
  const result = {
    title: '',
    sections: [],
    metadata: {},
    tables: [],
    success: false,
    contentLength: 0,
    debugInfo: debug ? { parsingSteps: [] } : null
  };
  
  try {
    if (debug) result.debugInfo.parsingSteps.push('Parsing as standard HTML');
    
    // Use cheerio for HTML parsing
    const $ = cheerio.load(htmlContent);
    
    // Extract title
    result.title = $('title').text() || '';
    if (debug) result.debugInfo.parsingSteps.push(`Extracted title: ${result.title}`);
    
    // Remove scripts, styles, and hidden elements
    $('script, style, [style*="display: none"], [style*="display:none"]').remove();
    
    // Extract main content
    const mainContent = $('body').text().replace(/\s+/g, ' ').trim();
    
    if (mainContent.length > 0) {
      result.sections.push({
        title: 'Main Content',
        content: mainContent
      });
    }
    
    // Calculate total content length
    result.contentLength = mainContent.length;
    
    // Set success flag based on content extraction
    result.success = result.contentLength > 100; // At least some meaningful content
    
    if (debug) {
      result.debugInfo.parsingSteps.push(`Extracted content with total length ${result.contentLength}`);
      result.debugInfo.contentSample = mainContent.substring(0, 500) + (mainContent.length > 500 ? '...' : '');
    }
    
    return result;
  } catch (error) {
    if (debug) {
      result.debugInfo.parsingSteps.push(`Error parsing standard HTML: ${error.message}`);
      result.debugInfo.error = error.message;
    }
    return result;
  }
}

/**
 * Fetches and extracts content from a SEC filing URL
 * 
 * @param {string} url - The SEC filing URL
 * @param {object} options - Configuration options
 * @returns {Promise<object>} Extracted content and metadata
 */
async function fetchAndExtractContent(url, options = {}) {
  try {
    // Fetch the content with proper SEC headers
    const response = await axios.get(url, {
      headers: SEC_HEADERS,
      timeout: 15000 // 15 second timeout
    });
    
    const content = response.data;
    
    // Extract content from the inline XBRL
    return extractContentFromInlineXbrl(content, options);
  } catch (error) {
    return {
      title: '',
      sections: [],
      metadata: {},
      tables: [],
      success: false,
      contentLength: 0,
      error: error.message,
      debugInfo: options.debug ? { error: error.message } : null
    };
  }
}

/**
 * Converts extracted content to a plain text format suitable for summarization
 * 
 * @param {object} extractedContent - The content extracted by extractContentFromInlineXbrl
 * @param {object} options - Configuration options
 * @returns {string} Formatted plain text
 */
function formatExtractedContent(extractedContent, options = {}) {
  const { includeTables = true, maxLength = 100000 } = options;
  
  if (!extractedContent || !extractedContent.success) {
    return '';
  }
  
  let formattedText = '';
  
  // Add title
  if (extractedContent.title) {
    formattedText += `# ${extractedContent.title}\n\n`;
  }
  
  // Add sections
  extractedContent.sections.forEach(section => {
    if (section.title && section.title !== 'Main Content') {
      formattedText += `## ${section.title}\n\n`;
    }
    formattedText += `${section.content}\n\n`;
  });
  
  // Add tables if requested
  if (includeTables && extractedContent.tables && extractedContent.tables.length > 0) {
    formattedText += `## Tables\n\n`;
    
    extractedContent.tables.forEach(table => {
      formattedText += `### ${table.title}\n\n`;
      
      // Format table as plain text
      if (table.headers && table.headers.length > 0) {
        formattedText += table.headers.join(' | ') + '\n';
        formattedText += table.headers.map(() => '---').join(' | ') + '\n';
      }
      
      table.rows.forEach(row => {
        formattedText += row.join(' | ') + '\n';
      });
      
      formattedText += '\n';
    });
  }
  
  // Truncate if necessary
  if (formattedText.length > maxLength) {
    formattedText = formattedText.substring(0, maxLength) + '...[content truncated due to length]';
  }
  
  return formattedText;
}

module.exports = {
  extractContentFromInlineXbrl,
  fetchAndExtractContent,
  formatExtractedContent,
  SEC_HEADERS
};
