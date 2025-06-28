/**
 * XML Logging Utilities
 * 
 * Provides structured logging for XML documents to improve debugging
 * of SEC filing fetch and parsing issues.
 */

import { DOMParser } from '@xmldom/xmldom';
import { logger } from './logging';

// Interface for XML summary statistics
export interface XmlSummary {
  totalElements: number;
  totalAttributes: number;
  depth: number;
  namespaces: Record<string, number>;
  elementCounts: Record<string, number>;
  contextRefs?: Record<string, boolean>;
  hasEmbeddedHtml: boolean;
  size: {
    bytes: number;
    category: 'small' | 'medium' | 'large' | 'very_large';
  };
  truncated: boolean;
  error?: string; // Optional error message if parsing had issues
}

/**
 * Generates a summary of an XML document for logging
 * @param xmlContent The XML content as a string
 * @param maxElements Maximum number of elements to process (for large documents)
 * @returns Summary statistics about the XML document
 */
export function generateXmlSummary(xmlContent: string, maxElements = 10000): XmlSummary {
  // Initialize summary object
  const summary: XmlSummary = {
    totalElements: 0,
    totalAttributes: 0,
    depth: 0,
    namespaces: {},
    elementCounts: {},
    contextRefs: {},
    hasEmbeddedHtml: false,
    size: {
      bytes: xmlContent.length,
      category: 'small',
    },
    truncated: false
  };

  // Categorize the size
  if (xmlContent.length < 100000) {
    summary.size.category = 'small';
  } else if (xmlContent.length < 1000000) {
    summary.size.category = 'medium';
  } else if (xmlContent.length < 10000000) {
    summary.size.category = 'large';
  } else {
    summary.size.category = 'very_large';
  }

  try {
    // Skip parsing if content is empty
    if (!xmlContent || xmlContent.trim().length === 0) {
      logger.warn('Empty XML content provided');
      return summary;
    }
    
    // Clean up the XML content - trim leading/trailing whitespace
    const cleanXmlContent = xmlContent.trim();
    
    // Store original console methods to restore later
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    // Temporarily suppress console errors/warnings during parsing
    const xmlErrors: string[] = [];
    console.error = (msg) => xmlErrors.push(String(msg));
    console.warn = (msg) => {}; // Suppress warnings
    
    // Try parsing with different approaches
    let doc;
    let parsingSuccessful = false;
    
    // Attempt 1: Standard parsing
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(cleanXmlContent, 'text/xml');
      
      if (doc && doc.documentElement) {
        parsingSuccessful = true;
        logger.debug('XML parsed successfully with standard parsing');
      }
    } catch (error) {
      logger.debug(`Standard parsing failed: ${error instanceof Error ? error.message : String(error)}`);
      xmlErrors.push(`Standard parsing error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Attempt 2: Try with namespace handling if first attempt failed
    if (!parsingSuccessful) {
      try {
        // Try again with a different approach - strip problematic namespace declarations
        // This is a fallback for developer debugging only
        const simplifiedXml = cleanXmlContent
          .replace(/xmlns:[^=]*="[^"]*"/g, '') // Remove namespace declarations
          .replace(/:[^\s\/>]*/g, ''); // Remove namespace prefixes from tags
        
        const parser = new DOMParser();
        doc = parser.parseFromString(simplifiedXml, 'text/xml');
        
        if (doc && doc.documentElement) {
          parsingSuccessful = true;
          logger.debug('XML parsed successfully with namespace stripping');
          summary.error = 'Used namespace stripping fallback - some namespace information may be lost';
        }
      } catch (error) {
        logger.debug(`Namespace stripping parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        xmlErrors.push(`Namespace stripping error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Restore console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    
    // Log any errors that occurred during parsing
    if (xmlErrors.length > 0) {
      const errorSample = xmlErrors[0];
      logger.debug(`XML parsing produced ${xmlErrors.length} errors/warnings. Sample: ${errorSample}`);
      summary.error = errorSample; // Store first error in summary
    }
    
    // Check if we have a valid document element
    if (doc && doc.documentElement) {
      // Process the document to gather statistics
      processNode(doc.documentElement, summary, 0, maxElements);
    } else {
      logger.warn('Failed to parse XML: No document element found');
      summary.error = 'Failed to parse XML: No document element found';
    }
    
    return summary;
  } catch (error) {
    logger.error(`Failed to parse XML for summary: ${error instanceof Error ? error.message : String(error)}`);
    return {
      ...summary,
      error: error instanceof Error ? error.message : String(error)
    } as XmlSummary & { error: string };
  }
}

/**
 * Recursively processes an XML node to gather statistics
 * @param node The XML node to process
 * @param summary The summary object to update
 * @param currentDepth The current depth in the XML tree
 * @param maxElements Maximum number of elements to process
 */
function processNode(node: Node, summary: XmlSummary, currentDepth: number, maxElements: number): void {
  // Check if we've exceeded the maximum number of elements
  if (summary.totalElements >= maxElements) {
    summary.truncated = true;
    return;
  }

  // Update depth if this is deeper than what we've seen
  if (currentDepth > summary.depth) {
    summary.depth = currentDepth;
  }

  // Process element nodes
  if (node.nodeType === 1) { // ELEMENT_NODE
    const element = node as Element;
    summary.totalElements++;

    // Count this element type
    const tagName = element.tagName;
    summary.elementCounts[tagName] = (summary.elementCounts[tagName] || 0) + 1;

    // Method 1: Check tag name for namespace prefix
    if (tagName && tagName.includes(':')) {
      const namespace = tagName.split(':')[0];
      if (namespace) {
        summary.namespaces[namespace] = (summary.namespaces[namespace] || 0) + 1;
      }
    }
    
    // Method 2: Check for xmlns attributes
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        if (attr.name.startsWith('xmlns:')) {
          const ns = attr.name.split(':')[1];
          if (ns && !summary.namespaces[ns]) {
            summary.namespaces[ns] = 0; // Register namespace even if not used in elements
          }
        } else if (attr.name === 'xmlns') {
          // Default namespace
          if (!summary.namespaces['default']) {
            summary.namespaces['default'] = 0;
          }
          summary.namespaces['default']++;
        }
      }
    } // Count attributes and check for contextRef
    if (element.attributes) {
      summary.totalAttributes += element.attributes.length;
      
      // Check for contextRef attribute (common in XBRL)
      const contextRef = element.getAttribute('contextRef');
      if (contextRef) {
        summary.contextRefs[contextRef] = true;
      }
    }

    // Check for embedded HTML
    if (tagName.toLowerCase() === 'html' || 
        tagName.toLowerCase() === 'div' || 
        tagName.toLowerCase() === 'p' || 
        tagName.toLowerCase() === 'table') {
      summary.hasEmbeddedHtml = true;
    }

    // Process child nodes
    for (let i = 0; i < element.childNodes.length; i++) {
      processNode(element.childNodes[i], summary, currentDepth + 1, maxElements);
      if (summary.truncated) return;
    }
  }
}

/**
 * Formats an XML summary for logging
 * @param summary The XML summary object
 * @returns A formatted string representation of the summary
 */
export function formatXmlSummary(summary: XmlSummary): string {
  // Create a formatted summary string
  let result = `XML Summary [${summary.size.category.toUpperCase()}] - ${formatBytes(summary.size.bytes)}\n`;
  
  // Add basic statistics
  result += `├─ Elements: ${summary.totalElements}${summary.truncated ? ' (truncated)' : ''}\n`;
  result += `├─ Attributes: ${summary.totalAttributes}\n`;
  result += `├─ Depth: ${summary.depth}\n`;
  
  // Add namespace information
  const namespaces = Object.keys(summary.namespaces);
  result += `├─ Namespaces (${namespaces.length}): ${namespaces.join(', ')}\n`;
  
  // Add top elements by count
  const topElements = Object.entries(summary.elementCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  result += `├─ Top Elements: ${topElements.map(([tag, count]) => `${tag}(${count})`).join(', ')}\n`;
  
  // Add context reference count if available
  if (summary.contextRefs) {
    const contextCount = Object.keys(summary.contextRefs).length;
    result += `├─ Context References: ${contextCount}\n`;
  }
  
  // Add embedded HTML indicator
  result += `└─ Embedded HTML: ${summary.hasEmbeddedHtml ? 'Yes' : 'No'}\n`;
  
  return result;
}

/**
 * Formats a byte size into a human-readable string
 * @param bytes The number of bytes
 * @returns A formatted string (e.g., "1.23 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Logs an XML document with structured formatting
 * @param xmlContent The XML content to log
 * @param message Optional message to include with the log
 * @param logLevel Log level to use ('debug', 'info', 'warn', 'error')
 */
export function logXmlDocument(
  xmlContent: string, 
  message = 'XML Document Summary', 
  logLevel: 'debug' | 'info' | 'warn' | 'error' = 'debug'
): XmlSummary {
  try {
    // Generate the summary
    const summary = generateXmlSummary(xmlContent);
    
    // Format the summary
    const formattedSummary = formatXmlSummary(summary);
    
    // Log with the appropriate level
    switch (logLevel) {
      case 'info':
        logger.info(`${message}\n${formattedSummary}`);
        break;
      case 'warn':
        logger.warn(`${message}\n${formattedSummary}`);
        break;
      case 'error':
        logger.error(`${message}\n${formattedSummary}`);
        break;
      default:
        logger.debug(`${message}\n${formattedSummary}`);
    }
    
    return summary;
  } catch (error) {
    logger.error(`Failed to log XML document: ${error instanceof Error ? error.message : String(error)}`);
    return {
      totalElements: 0,
      totalAttributes: 0,
      depth: 0,
      namespaces: {},
      elementCounts: {},
      hasEmbeddedHtml: false,
      size: {
        bytes: xmlContent.length,
        category: 'unknown' as any,
      },
      truncated: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Creates a visual representation of context references in an XML document
 * @param contextRefs Object containing context references
 * @param maxWidth Maximum width of the visualization
 * @returns A string containing a visual representation of context references
 */
export function visualizeContextReferences(contextRefs: Record<string, boolean>, maxWidth = 80): string {
  const contextNames = Object.keys(contextRefs);
  if (contextNames.length === 0) return 'No context references found';
  
  // Group contexts by common prefixes
  const contextGroups: Record<string, string[]> = {};
  
  contextNames.forEach(context => {
    // Try to extract a prefix (e.g., "AsOf2023" from "AsOf2023_123")
    const match = context.match(/^([A-Za-z]+\d*)/);
    const prefix = match ? match[1] : 'other';
    
    if (!contextGroups[prefix]) {
      contextGroups[prefix] = [];
    }
    contextGroups[prefix].push(context);
  });
  
  // Create a visualization
  let result = 'Context References:\n';
  
  Object.entries(contextGroups).forEach(([prefix, contexts]) => {
    result += `${prefix}: `;
    
    // Create a visual representation with dots for each context
    let line = '';
    contexts.forEach((_, index) => {
      line += '•';
      
      // Add a space every 5 dots for readability
      if ((index + 1) % 5 === 0) line += ' ';
      
      // Wrap if we're approaching the max width
      if (line.length >= maxWidth - 10) {
        result += line + '\n' + ' '.repeat(prefix.length + 2);
        line = '';
      }
    });
    
    result += line + ` (${contexts.length})\n`;
  });
  
  return result;
}

export default {
  generateXmlSummary,
  formatXmlSummary,
  logXmlDocument,
  visualizeContextReferences
};
