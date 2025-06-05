/**
 * SEC Filing Content Extractor
 * 
 * This module provides specialized extraction for SEC filings, including
 * handling for inline XBRL documents and SEC's viewer URLs.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// SEC API headers - CRITICAL for avoiding 403 errors
const SEC_HEADERS = {
  'User-Agent': 'tldrSEC/1.0 (contact@tldrsec.app)',
  'Accept-Encoding': 'gzip, deflate',
  'Host': 'www.sec.gov'
};

/**
 * Extract content from an SEC filing URL
 * 
 * @param {string} url - The SEC filing URL
 * @param {object} options - Configuration options
 * @returns {Promise<object>} Extracted content and metadata
 */
async function extractFilingContent(url, options = {}) {
  const { debug = false } = options;
  
  const result = {
    content: '',
    metadata: {
      url,
      filingType: detectFilingType(url),
      isInlineXbrl: false
    },
    success: false,
    error: null,
    debugInfo: debug ? { steps: [] } : null
  };
  
  try {
    if (debug) result.debugInfo.steps.push(`Starting extraction for URL: ${url}`);
    
    // Check if this is an SEC viewer URL
    const isViewerUrl = url.includes('/ix?doc=');
    
    if (debug) {
      result.debugInfo.steps.push(`URL type: ${isViewerUrl ? 'SEC viewer URL' : 'Direct filing URL'}`);
      result.debugInfo.steps.push(`Detected filing type: ${result.metadata.filingType}`);
    }
    
    // For viewer URLs, we need to extract the actual document URL
    let documentUrl = url;
    if (isViewerUrl) {
      if (debug) result.debugInfo.steps.push('Processing SEC viewer URL to extract document URL');
      documentUrl = url.split('/ix?doc=')[1];
      if (documentUrl) {
        documentUrl = 'https://www.sec.gov/' + documentUrl;
        if (debug) result.debugInfo.steps.push(`Extracted document URL: ${documentUrl}`);
      } else {
        throw new Error('Failed to extract document URL from viewer URL');
      }
    }
    
    // Fetch the document content
    if (debug) result.debugInfo.steps.push(`Fetching content from: ${documentUrl}`);
    const response = await axios.get(documentUrl, {
      headers: SEC_HEADERS,
      timeout: 30000 // 30 second timeout
    });
    
    const htmlContent = response.data;
    if (debug) {
      const contentSize = typeof htmlContent === 'string' ? 
        htmlContent.length : JSON.stringify(htmlContent).length;
      result.debugInfo.steps.push(`Received content size: ${formatSize(contentSize)}`);
    }
    
    // Check if this is an inline XBRL document
    const isInlineXbrl = typeof htmlContent === 'string' && (
      htmlContent.includes('xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"') || 
      htmlContent.includes('ix:header') || 
      htmlContent.includes('ix:hidden') ||
      htmlContent.includes('inline XBRL')
    );
    
    result.metadata.isInlineXbrl = isInlineXbrl;
    
    if (debug) {
      result.debugInfo.steps.push(`Document is inline XBRL: ${isInlineXbrl}`);
    }
    
    // For inline XBRL documents, we need special handling
    if (isInlineXbrl) {
      if (debug) result.debugInfo.steps.push('Using specialized inline XBRL extraction');
      
      // Try to extract the actual content
      const extractedContent = extractFromInlineXbrl(htmlContent, debug ? result.debugInfo : null);
      
      if (extractedContent && extractedContent.length > 100) {
        result.content = extractedContent;
        result.success = true;
        
        if (debug) {
          result.debugInfo.steps.push(`Successfully extracted ${formatSize(extractedContent.length)} of content from inline XBRL`);
          result.debugInfo.contentSample = extractedContent.substring(0, 500) + 
            (extractedContent.length > 500 ? '...' : '');
        }
      } else {
        // If direct extraction fails, try to find and fetch the viewer URL
        if (debug) result.debugInfo.steps.push('Direct extraction failed, looking for SEC viewer URL');
        
        const viewerUrlMatch = typeof htmlContent === 'string' && 
          htmlContent.match(/href="(https:\/\/www\.sec\.gov\/ix\?doc=[^"]+)"/);
        
        if (viewerUrlMatch && viewerUrlMatch[1] && !isViewerUrl) {
          const viewerUrl = viewerUrlMatch[1];
          if (debug) result.debugInfo.steps.push(`Found SEC viewer URL: ${viewerUrl}`);
          
          // Recursively call with the viewer URL
          if (debug) result.debugInfo.steps.push('Recursively calling with viewer URL');
          const viewerResult = await extractFilingContent(viewerUrl, options);
          
          if (viewerResult.success) {
            result.content = viewerResult.content;
            result.success = true;
            result.metadata = { ...result.metadata, ...viewerResult.metadata };
            
            if (debug) {
              result.debugInfo.steps.push(`Successfully extracted ${formatSize(viewerResult.content.length)} from viewer URL`);
              result.debugInfo.viewerResult = viewerResult;
            }
          } else {
            if (debug) result.debugInfo.steps.push('Viewer URL extraction failed');
            throw new Error('Failed to extract content from both direct URL and viewer URL');
          }
        } else {
          // If we can't find a viewer URL, try a fallback approach
          if (debug) result.debugInfo.steps.push('No viewer URL found, using fallback extraction');
          
          const fallbackContent = extractWithFallback(htmlContent, debug ? result.debugInfo : null);
          
          if (fallbackContent && fallbackContent.length > 100) {
            result.content = fallbackContent;
            result.success = true;
            
            if (debug) {
              result.debugInfo.steps.push(`Successfully extracted ${formatSize(fallbackContent.length)} with fallback method`);
              result.debugInfo.contentSample = fallbackContent.substring(0, 500) + 
                (fallbackContent.length > 500 ? '...' : '');
            }
          } else {
            throw new Error('All extraction methods failed for inline XBRL document');
          }
        }
      }
    } else {
      // For standard HTML documents, use regular extraction
      if (debug) result.debugInfo.steps.push('Using standard HTML extraction');
      
      const extractedContent = extractFromStandardHtml(htmlContent, debug ? result.debugInfo : null);
      
      if (extractedContent && extractedContent.length > 100) {
        result.content = extractedContent;
        result.success = true;
        
        if (debug) {
          result.debugInfo.steps.push(`Successfully extracted ${formatSize(extractedContent.length)} from standard HTML`);
          result.debugInfo.contentSample = extractedContent.substring(0, 500) + 
            (extractedContent.length > 500 ? '...' : '');
        }
      } else {
        throw new Error('Failed to extract content from standard HTML document');
      }
    }
    
    return result;
  } catch (error) {
    if (debug) {
      result.debugInfo.steps.push(`Error: ${error.message}`);
      result.debugInfo.error = error;
    }
    
    result.error = error.message;
    return result;
  }
}

/**
 * Extract content from inline XBRL document
 */
function extractFromInlineXbrl(htmlContent, debugInfo = null) {
  if (debugInfo) debugInfo.steps.push('Extracting content from inline XBRL');
  
  try {
    const $ = cheerio.load(htmlContent);
    
    // Remove hidden sections and metadata
    $('ix\\:hidden, [id="hidden"], script, style, head').remove();
    
    // First try to extract from specific sections that typically contain the actual content
    const contentSections = [
      // Main document sections
      '#item1, #item1a, #item1b, #item2, #item3, #item4, #item5, #item6, #item7, #item7a, #item8, #item9, #item9a, #item9b, #item10, #item11, #item12, #item13, #item14, #item15',
      // Uppercase variants
      '#ITEM1, #ITEM1A, #ITEM1B, #ITEM2, #ITEM3, #ITEM4, #ITEM5, #ITEM6, #ITEM7, #ITEM7A, #ITEM8, #ITEM9, #ITEM9A, #ITEM9B, #ITEM10, #ITEM11, #ITEM12, #ITEM13, #ITEM14, #ITEM15',
      // Common section classes
      '.WordSection1, .WordSection2, .WordSection3, .Section1, .Section2, .Section3',
      // Document body sections
      '.document, .filing-document, .text, .formContent, .mainContent'
    ].join(', ');
    
    let extractedText = '';
    const sections = $(contentSections);
    
    if (sections.length > 0) {
      if (debugInfo) debugInfo.steps.push(`Found ${sections.length} specific content sections`);
      
      sections.each((i, section) => {
        const sectionText = $(section).text().trim();
        if (sectionText.length > 0) {
          extractedText += sectionText + '\n\n';
        }
      });
    }
    
    // If we couldn't extract from specific sections, try to get all visible text
    if (extractedText.length < 100) {
      if (debugInfo) debugInfo.steps.push('Specific sections extraction failed, trying full body text');
      
      // Remove ix:hidden and other non-content elements
      $('ix\\:hidden, script, style, head, noscript, ix\\:header').remove();
      
      // Get all paragraphs and div blocks
      const paragraphs = $('p, div:not([style*="display:none"]):not([style*="display: none"])');
      
      if (debugInfo) debugInfo.steps.push(`Found ${paragraphs.length} paragraphs and div blocks`);
      
      paragraphs.each((i, para) => {
        const text = $(para).text().trim();
        if (text.length > 20) { // Only include substantial paragraphs
          extractedText += text + '\n\n';
        }
      });
    }
    
    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    if (debugInfo) {
      debugInfo.steps.push(`Extracted ${formatSize(extractedText.length)} of text from inline XBRL`);
    }
    
    return extractedText;
  } catch (error) {
    if (debugInfo) {
      debugInfo.steps.push(`Error extracting from inline XBRL: ${error.message}`);
      debugInfo.extractionError = error;
    }
    return '';
  }
}

/**
 * Extract content from standard HTML document
 */
function extractFromStandardHtml(htmlContent, debugInfo = null) {
  if (debugInfo) debugInfo.steps.push('Extracting content from standard HTML');
  
  try {
    const $ = cheerio.load(htmlContent);
    
    // Remove non-content elements
    $('script, style, head, noscript').remove();
    
    // Get all paragraphs and div blocks
    const paragraphs = $('p, div:not([style*="display:none"]):not([style*="display: none"])');
    
    if (debugInfo) debugInfo.steps.push(`Found ${paragraphs.length} paragraphs and div blocks`);
    
    let extractedText = '';
    paragraphs.each((i, para) => {
      const text = $(para).text().trim();
      if (text.length > 20) { // Only include substantial paragraphs
        extractedText += text + '\n\n';
      }
    });
    
    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    if (debugInfo) {
      debugInfo.steps.push(`Extracted ${formatSize(extractedText.length)} of text from standard HTML`);
    }
    
    return extractedText;
  } catch (error) {
    if (debugInfo) {
      debugInfo.steps.push(`Error extracting from standard HTML: ${error.message}`);
      debugInfo.extractionError = error;
    }
    return '';
  }
}

/**
 * Fallback extraction method for difficult documents
 */
function extractWithFallback(htmlContent, debugInfo = null) {
  if (debugInfo) debugInfo.steps.push('Using fallback extraction method');
  
  try {
    // Simple regex-based extraction to get text between tags
    let extractedText = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
      .replace(/<ix:hidden\b[^<]*(?:(?!<\/ix:hidden>)<[^<]*)*<\/ix:hidden>/gi, '')
      .replace(/<ix:header\b[^<]*(?:(?!<\/ix:header>)<[^<]*)*<\/ix:header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (debugInfo) {
      debugInfo.steps.push(`Extracted ${formatSize(extractedText.length)} with fallback method`);
    }
    
    return extractedText;
  } catch (error) {
    if (debugInfo) {
      debugInfo.steps.push(`Error in fallback extraction: ${error.message}`);
      debugInfo.fallbackError = error;
    }
    return '';
  }
}

/**
 * Detect the filing type from the URL
 */
function detectFilingType(url) {
  if (!url) return 'Unknown';
  
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('10-k') || urlLower.includes('10k')) {
    return '10-K';
  } else if (urlLower.includes('10-q') || urlLower.includes('10q')) {
    return '10-Q';
  } else if (urlLower.includes('8-k') || urlLower.includes('8k')) {
    return '8-K';
  } else if (urlLower.includes('form4') || urlLower.includes('xslf345')) {
    return 'Form 4';
  } else if (urlLower.includes('def14a')) {
    return 'DEF 14A';
  } else if (urlLower.includes('s-1')) {
    return 'S-1';
  } else if (urlLower.includes('6-k')) {
    return '6-K';
  } else {
    // Try to extract from the URL path
    const match = url.match(/\/(\d+-[a-zA-Z]+)\./);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
    
    return 'Unknown';
  }
}

/**
 * Format size in bytes to human-readable format
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  else return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export {
  extractFilingContent,
  SEC_HEADERS
};
