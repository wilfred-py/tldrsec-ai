/**
 * SEC Filing Integration Module
 * 
 * This module integrates the improved SEC filing extractor with the existing SEC service
 * to provide robust content extraction for both inline XBRL and standard HTML filings.
 */

import { extractFilingContent, SEC_HEADERS } from './sec-filing-extractor.js';
import axios from 'axios';

/**
 * Enhanced function to extract content from SEC filings
 * This can be used as a drop-in replacement for the existing extraction function
 * 
 * @param {string} url - The SEC filing URL
 * @param {object} options - Additional options
 * @returns {Promise<object>} Extracted content and metadata
 */
export async function extractEnhancedFilingContent(url, options = {}) {
  const { debug = false, maxRetries = 3, timeout = 30000 } = options;
  
  const result = {
    content: '',
    metadata: {
      url,
      extractionMethod: 'enhanced',
      timestamp: new Date().toISOString()
    },
    success: false,
    error: null
  };
  
  try {
    // Use the improved extractor
    const extractionResult = await extractFilingContent(url, { 
      debug,
      timeout
    });
    
    if (extractionResult.success && extractionResult.content) {
      result.content = extractionResult.content;
      result.metadata = {
        ...result.metadata,
        ...extractionResult.metadata
      };
      result.success = true;
      
      return result;
    }
    
    // If the improved extractor fails, try a fallback approach
    if (debug) {
      console.log(`Enhanced extractor failed for ${url}, trying fallback approach`);
    }
    
    // Fallback: Try direct fetch with SEC headers
    const response = await axios.get(url, {
      headers: SEC_HEADERS,
      timeout
    });
    
    const htmlContent = response.data;
    
    // Simple text extraction
    let extractedText = '';
    if (typeof htmlContent === 'string') {
      // Remove scripts, styles, and XML/HTML tags
      extractedText = htmlContent
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<ix:[^>]*>/g, '') // Remove inline XBRL specific tags
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    if (extractedText && extractedText.length > 100) {
      result.content = extractedText;
      result.success = true;
      result.metadata.extractionMethod = 'fallback';
      
      return result;
    }
    
    throw new Error('All extraction methods failed');
  } catch (error) {
    result.error = error.message || 'Unknown error during extraction';
    
    if (debug) {
      console.error(`Error extracting content from ${url}: ${result.error}`);
    }
    
    return result;
  }
}

/**
 * Utility function to check if a URL is a valid SEC filing URL
 * 
 * @param {string} url - URL to check
 * @returns {boolean} Whether the URL is a valid SEC filing URL
 */
export function isSecFilingUrl(url) {
  if (!url) return false;
  
  // Check if it's an SEC.gov URL
  if (!url.includes('sec.gov')) return false;
  
  // Check if it's a filing URL
  return url.includes('/Archives/edgar/data/') || 
         url.includes('/ix?doc=/Archives/edgar/data/');
}

/**
 * Get the correct SEC headers for API requests
 * 
 * @returns {object} SEC headers
 */
export function getSecHeaders() {
  return SEC_HEADERS;
}

/**
 * Detect filing type from URL or content
 * 
 * @param {string} url - Filing URL
 * @param {string} content - Optional content to analyze
 * @returns {string} Filing type (10-K, 10-Q, 8-K, etc.)
 */
export function detectFilingType(url, content = '') {
  if (!url) return 'Unknown';
  
  const urlLower = url.toLowerCase();
  
  // Try to detect from URL first
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
  }
  
  // Try to extract from the URL path
  const match = url.match(/\/(\d+-[a-zA-Z]+)\./);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  
  // If we have content, try to detect from content
  if (content) {
    const contentLower = content.toLowerCase();
    if (contentLower.includes('form 10-k') || contentLower.includes('annual report')) {
      return '10-K';
    } else if (contentLower.includes('form 10-q') || contentLower.includes('quarterly report')) {
      return '10-Q';
    } else if (contentLower.includes('form 8-k') || contentLower.includes('current report')) {
      return '8-K';
    }
  }
  
  return 'Unknown';
}

/**
 * Format extracted content for summarization
 * 
 * @param {string} content - Raw extracted content
 * @param {object} options - Formatting options
 * @returns {string} Formatted content
 */
export function formatForSummarization(content, options = {}) {
  const { maxLength = 100000, includeBoilerplate = false } = options;
  
  if (!content) return '';
  
  let formattedContent = content;
  
  // Remove common boilerplate text if requested
  if (!includeBoilerplate) {
    // Remove forward-looking statements disclaimer but keep a marker
    formattedContent = formattedContent.replace(
      /Forward-Looking Statements[\s\S]*?reliance on our forward-looking statements/gi, 
      '[Forward-Looking Statements disclaimer removed]'
    );
    
    // Only remove specific parts of the SEC filing header, not the entire header
    // This preserves important information like company name, filing period, etc.
    formattedContent = formattedContent.replace(
      /(SECURITIES AND EXCHANGE COMMISSION[\s\S]*?Washington, D.C. 20549)/gi,
      '[SEC Filing Header]'
    );
    
    // Remove repetitive legal disclaimers
    formattedContent = formattedContent.replace(
      /The information in this (report|document)[\s\S]*?shall not be deemed "filed"[\s\S]*?Securities Act of 1933/gi,
      '[Legal Disclaimer removed]'
    );
    
    // Remove repetitive XBRL exhibits sections
    formattedContent = formattedContent.replace(
      /XBRL TAXONOMY EXTENSION[\s\S]*?SCHEMA DOCUMENT/gi,
      '[XBRL Taxonomy Information removed]'
    );
  }
  
  // Truncate if necessary
  if (formattedContent.length > maxLength) {
    formattedContent = formattedContent.substring(0, maxLength) + '... [content truncated due to length]';
  }
  
  return formattedContent;
}

/**
 * Check if content is likely inline XBRL
 * 
 * @param {string} content - Content to check
 * @returns {boolean} Whether the content is likely inline XBRL
 */
export function isInlineXbrl(content) {
  if (!content) return false;
  
  return content.includes('xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"') || 
         content.includes('ix:header') || 
         content.includes('ix:hidden') ||
         content.includes('inline XBRL');
}

export default {
  extractEnhancedFilingContent,
  isSecFilingUrl,
  getSecHeaders,
  detectFilingType,
  formatForSummarization,
  isInlineXbrl
};
