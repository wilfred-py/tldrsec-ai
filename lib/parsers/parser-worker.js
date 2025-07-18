/**
 * Worker thread for CPU-intensive parsing operations
 * 
 * This worker handles XML and HTML parsing operations to prevent blocking the main event loop
 */

const { parentPort } = require('worker_threads');
const cheerio = require('cheerio');

// Handle messages from the main thread
parentPort.on('message', (task) => {
  try {
    let result;
    
    // Process different task types
    switch (task.type) {
      case 'cleanHtml':
        result = cleanHtmlContent(task.html, task.options);
        break;
      case 'extractXml':
        result = extractXmlContent(task.xml, task.rootElement);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
    
    // Send the result back to the main thread
    parentPort.postMessage(result);
  } catch (error) {
    // Send the error back to the main thread
    parentPort.postMessage({
      error: true,
      message: error.message,
      stack: error.stack
    });
  }
});

/**
 * Clean HTML content by removing scripts, styles, and unnecessary elements
 * @param {string} html - HTML content to clean
 * @param {object} options - Cleaning options
 * @returns {string} Cleaned text content
 */
function cleanHtmlContent(html, options = {}) {
  if (!html) return '';
  
  try {
    const $ = cheerio.load(html);
    
    // Remove scripts, styles, and comments
    $('script, style, noscript, iframe, object, embed').remove();
    
    // Remove comments
    $('*').contents().each(function() {
      if (this.type === 'comment') {
        $(this).remove();
      }
    });
    
    // Process the body content
    let bodyContent = $('body').length ? $('body') : $.root();
    
    // Handle tables specially to preserve structure
    bodyContent.find('table').each(function() {
      const $table = $(this);
      const rows = [];
      
      $table.find('tr').each(function() {
        const cells = [];
        $(this).find('td, th').each(function() {
          cells.push($(this).text().trim());
        });
        if (cells.length > 0) {
          rows.push(cells.join(' | '));
        }
      });
      
      if (rows.length > 0) {
        $table.replaceWith(rows.join('\n'));
      }
    });
    
    // Handle lists to preserve structure
    bodyContent.find('ul, ol').each(function() {
      const $list = $(this);
      const items = [];
      
      $list.find('li').each(function() {
        items.push('• ' + $(this).text().trim());
      });
      
      if (items.length > 0) {
        $list.replaceWith(items.join('\n'));
      }
    });
    
    // Replace divs and paragraphs with newlines
    if (!options.preserveFormatting) {
      bodyContent.find('div, p, br, hr').each(function() {
        $(this).replaceWith('\n' + $(this).text() + '\n');
      });
    }
    
    // Replace headings with emphasized text
    bodyContent.find('h1, h2, h3, h4, h5, h6').each(function() {
      const level = this.name.charAt(1);
      const prefix = '#'.repeat(parseInt(level));
      $(this).replaceWith('\n' + prefix + ' ' + $(this).text() + '\n');
    });
    
    // Get the text content
    let text = bodyContent.text();
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Restore some paragraph breaks
    text = text.replace(/\.\s+([A-Z])/g, '.\n\n$1');
    
    return text;
  } catch (error) {
    // Basic fallback if cheerio fails
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * Extract content from XML document
 * @param {string} xml - XML content
 * @param {string} rootElement - Root element to extract from
 * @returns {string} Extracted text content
 */
function extractXmlContent(xml, rootElement) {
  if (!xml) return '';
  
  try {
    // Load the XML
    const $ = cheerio.load(xml, {
      xmlMode: true
    });
    
    // If a root element is specified, focus on that element
    const root = rootElement ? $(rootElement).first() : $.root();
    
    // Process the content
    let result = '';
    
    // Extract text from all elements, preserving structure
    function extractTextFromNode(node) {
      // Skip XML processing instructions and comments
      if (node.type === 'directive' || node.type === 'comment') {
        return;
      }
      
      // Get the node name
      const nodeName = node.name?.toLowerCase();
      
      // Skip certain elements
      if (['style', 'script', 'noscript'].includes(nodeName)) {
        return;
      }
      
      // Handle text nodes
      if (node.type === 'text') {
        const text = $(node).text().trim();
        if (text) {
          result += text + ' ';
        }
        return;
      }
      
      // Handle elements that should create line breaks
      if (['p', 'div', 'br', 'tr', 'li'].includes(nodeName)) {
        result += '\n';
      }
      
      // Handle heading elements
      if (nodeName && nodeName.match(/^h[1-6]$/)) {
        const level = nodeName.charAt(1);
        result += '\n' + '#'.repeat(parseInt(level)) + ' ';
      }
      
      // Process children
      $(node).contents().each((_, child) => {
        extractTextFromNode(child);
      });
      
      // Add line breaks after certain elements
      if (['p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(nodeName)) {
        result += '\n';
      }
    }
    
    // Start extraction from the root
    root.contents().each((_, child) => {
      extractTextFromNode(child);
    });
    
    // Clean up whitespace
    result = result.replace(/\s+/g, ' ').trim();
    
    // Restore some paragraph breaks
    result = result.replace(/\.\s+([A-Z])/g, '.\n\n$1');
    
    return result;
  } catch (error) {
    // Basic fallback if cheerio fails
    return xml
      .replace(/<\?[^>]+\?>/g, '') // Remove XML processing instructions
      .replace(/<[^>]+>/g, ' ')    // Remove all XML tags
      .replace(/\s+/g, ' ')        // Normalize whitespace
      .trim();
  }
}
