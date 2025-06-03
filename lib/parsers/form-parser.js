/**
 * Form parser for SEC filings
 * JavaScript version converted from TypeScript
 */

import { getFormMetadata } from '../sec-edgar/form-registry.js';
import * as cheerio from 'cheerio';

/**
 * Parse SEC filing content based on the filing type
 * @param {string} content The raw content to parse
 * @param {string} filingType The type of filing
 * @returns {Object} Parsed content with sections and key data
 */
export function parseFormContent(content, filingType) {
  const formMetadata = getFormMetadata(filingType);
  
  if (!formMetadata) {
    return parseGenericForm(content);
  }
  
  switch (formMetadata.parsingStrategy) {
    case 'detailed':
      return parseDetailedForm(content, filingType);
    case 'standard':
      return parseStandardForm(content, filingType);
    case 'simple':
      return parseSimpleForm(content, filingType);
    default:
      return parseGenericForm(content);
  }
}

/**
 * Parse a form using the detailed strategy (for complex filings like 10-K, 10-Q)
 * @param {string} content The raw content to parse
 * @param {string} filingType The type of filing
 * @returns {Object} Parsed content with detailed sections and key data
 */
function parseDetailedForm(content, filingType) {
  const $ = cheerio.load(content);
  const sections = {};
  const keyData = {};
  
  // Extract title
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                '';
  
  // Extract important sections based on filing type
  if (filingType.includes('10-K') || filingType.includes('10-Q') || filingType === '20-F' || filingType === '40-F') {
    // Financial reports sections
    const sectionSelectors = [
      { name: 'Business', selectors: ['#item1', '[name="item1"]', ':contains("Item 1. Business")', ':contains("ITEM 1. BUSINESS")'] },
      { name: 'Risk Factors', selectors: ['#item1a', '[name="item1a"]', ':contains("Item 1A. Risk Factors")', ':contains("ITEM 1A. RISK FACTORS")'] },
      { name: 'MD&A', selectors: ['#item7', '[name="item7"]', ':contains("Item 7. Management\'s Discussion")', ':contains("ITEM 7. MANAGEMENT\'S DISCUSSION")'] },
      { name: 'Financial Statements', selectors: ['#item8', '[name="item8"]', ':contains("Item 8. Financial Statements")', ':contains("ITEM 8. FINANCIAL STATEMENTS")'] },
      { name: 'Controls and Procedures', selectors: ['#item9a', '[name="item9a"]', ':contains("Item 9A. Controls and Procedures")', ':contains("ITEM 9A. CONTROLS AND PROCEDURES")'] }
    ];
    
    sectionSelectors.forEach(section => {
      for (const selector of section.selectors) {
        const element = $(selector);
        if (element.length) {
          // Get text from this element and the next few siblings until the next section
          let sectionContent = '';
          let currentElement = element;
          let nextSectionFound = false;
          
          for (let i = 0; i < 50 && !nextSectionFound; i++) {
            const text = currentElement.text().trim();
            if (text) {
              sectionContent += text + '\n\n';
            }
            
            currentElement = currentElement.next();
            
            // Check if we've reached the next section
            if (!currentElement.length || 
                sectionSelectors.some(s => s.selectors.some(sel => currentElement.is(sel)))) {
              nextSectionFound = true;
            }
          }
          
          sections[section.name] = sectionContent.trim();
          break;
        }
      }
    });
  }
  
  return {
    title,
    content: content,
    sections,
    keyData,
    metadata: {
      filingType,
      parsingStrategy: 'detailed'
    }
  };
}

/**
 * Parse a form using the standard strategy (for 8-K, proxy statements, etc.)
 * @param {string} content The raw content to parse
 * @param {string} filingType The type of filing
 * @returns {Object} Parsed content with standard sections and key data
 */
function parseStandardForm(content, filingType) {
  const $ = cheerio.load(content);
  const sections = {};
  const keyData = {};
  
  // Extract title
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                '';
  
  // Extract sections based on headers
  $('h2, h3, h4, .header, .title, .section-header').each((i, header) => {
    const headerText = $(header).text().trim();
    if (headerText && headerText.length > 3 && headerText.length < 100) {
      let sectionContent = '';
      let currentElement = $(header).next();
      
      while (currentElement.length && 
             !currentElement.is('h2') && 
             !currentElement.is('h3') && 
             !currentElement.is('h4') && 
             !currentElement.is('.header') && 
             !currentElement.is('.title') && 
             !currentElement.is('.section-header')) {
        
        sectionContent += currentElement.text().trim() + '\n\n';
        currentElement = currentElement.next();
      }
      
      if (sectionContent.trim()) {
        sections[headerText] = sectionContent.trim();
      }
    }
  });
  
  return {
    title,
    content: content,
    sections,
    keyData,
    metadata: {
      filingType,
      parsingStrategy: 'standard'
    }
  };
}

/**
 * Parse a form using the simple strategy (for Form 4, Form 144, etc.)
 * @param {string} content The raw content to parse
 * @param {string} filingType The type of filing
 * @returns {Object} Parsed content with simple sections and key data
 */
function parseSimpleForm(content, filingType) {
  const $ = cheerio.load(content);
  const sections = {};
  const keyData = {};
  
  // Extract title
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                '';
  
  // Extract key data from tables
  $('table').each((i, table) => {
    const rows = $(table).find('tr');
    if (rows.length > 0) {
      rows.each((j, row) => {
        const cells = $(row).find('td, th');
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim();
          const value = $(cells[1]).text().trim();
          
          if (key && value && key.length < 100) {
            keyData[key] = value;
          }
        }
      });
    }
  });
  
  // Extract sections from divs with class or id
  $('div[class], div[id]').each((i, div) => {
    const divId = $(div).attr('id') || '';
    const divClass = $(div).attr('class') || '';
    const sectionName = divId || divClass;
    
    if (sectionName && sectionName.length > 2 && sectionName.length < 50) {
      const sectionContent = $(div).text().trim();
      if (sectionContent && sectionContent.length > 20) {
        sections[sectionName] = sectionContent;
      }
    }
  });
  
  return {
    title,
    content: content,
    sections,
    keyData,
    metadata: {
      filingType,
      parsingStrategy: 'simple'
    }
  };
}

/**
 * Parse a form using a generic strategy (fallback for unsupported types)
 * @param {string} content The raw content to parse
 * @returns {Object} Parsed content with basic extraction
 */
function parseGenericForm(content) {
  const $ = cheerio.load(content);
  const sections = {};
  
  // Extract title
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                '';
  
  // Extract sections from headings
  $('h1, h2, h3, h4').each((i, heading) => {
    const headingText = $(heading).text().trim();
    if (headingText && headingText.length > 3 && headingText.length < 100) {
      let sectionContent = '';
      let currentElement = $(heading).next();
      
      while (currentElement.length && 
             !currentElement.is('h1') && 
             !currentElement.is('h2') && 
             !currentElement.is('h3') && 
             !currentElement.is('h4')) {
        
        sectionContent += currentElement.text().trim() + '\n\n';
        currentElement = currentElement.next();
      }
      
      if (sectionContent.trim()) {
        sections[headingText] = sectionContent.trim();
      }
    }
  });
  
  return {
    title,
    content: content,
    sections,
    keyData: {},
    metadata: {
      parsingStrategy: 'generic'
    }
  };
}

/**
 * Extract the most important content from a filing for summarization
 * @param {Object} parsedContent The parsed content
 * @param {number} maxLength Maximum length of the extracted content
 * @returns {string} The most important content for summarization
 */
export function extractImportantContent(parsedContent, maxLength = 10000) {
  const { sections, keyData, title, metadata } = parsedContent;
  
  // Start with the title
  let result = title ? `Title: ${title}\n\n` : '';
  
  // Add key data
  if (Object.keys(keyData).length > 0) {
    result += 'Key Information:\n';
    for (const [key, value] of Object.entries(keyData)) {
      if (value !== null) {
        result += `- ${key}: ${value}\n`;
      }
    }
    result += '\n';
  }
  
  // Add important sections based on filing type
  const filingType = metadata.filingType;
  const formMetadata = getFormMetadata(filingType);
  const sectionNames = Object.keys(sections);
  
  if (formMetadata) {
    const importantSections = getImportantSectionsForFilingType(filingType, sectionNames);
    
    for (const sectionName of importantSections) {
      if (sections[sectionName]) {
        result += `${sectionName}:\n${sections[sectionName]}\n\n`;
      }
    }
    
    // Add other sections if we haven't reached the max length
    if (result.length < maxLength) {
      for (const [sectionName, content] of Object.entries(sections)) {
        if (!importantSections.includes(sectionName)) {
          const remainingLength = maxLength - result.length;
          if (remainingLength > 0) {
            const truncatedContent = content.length > remainingLength 
              ? content.substring(0, remainingLength) + '...' 
              : content;
            
            result += `${sectionName}:\n${truncatedContent}\n\n`;
          }
        }
      }
    }
  } else {
    // For unknown filing types, just add all sections
    for (const [sectionName, content] of Object.entries(sections)) {
      const remainingLength = maxLength - result.length;
      if (remainingLength > 0) {
        const truncatedContent = content.length > remainingLength 
          ? content.substring(0, remainingLength) + '...' 
          : content;
        
        result += `${sectionName}:\n${truncatedContent}\n\n`;
      }
    }
  }
  
  // Truncate if still too long
  if (result.length > maxLength) {
    result = result.substring(0, maxLength) + '...';
  }
  
  return result;
}

/**
 * Get the most important sections for a specific filing type
 * @param {string} filingType The filing type
 * @param {string[]} sectionNames Optional list of available section names to filter from
 * @returns {string[]} Array of important section names
 */
function getImportantSectionsForFilingType(filingType, sectionNames = []) {
  if (filingType.includes('10-K') || filingType.includes('10-Q') || filingType === '20-F' || filingType === '40-F') {
    return ['Business', 'Risk Factors', 'MD&A', 'Financial Statements'];
  } else if (filingType === '8-K') {
    return ['Item1.01', 'Item2.01', 'Item5.02', 'Item7.01', 'Item8.01', 'Item9.01'];
  } else if (filingType.includes('DEF 14A') || filingType.includes('DEFA14A') || filingType.includes('PRE 14A')) {
    // Return all proposal sections
    return sectionNames.filter(key => key.startsWith('Proposal'));
  } else if (filingType === 'Form4' || filingType === '4' || filingType === 'Form3' || filingType === '3' || filingType === 'Form5' || filingType === '5') {
    // Return all transaction sections
    return sectionNames.filter(key => key.startsWith('Transaction'));
  }
  
  // Default to returning all section names
  return sectionNames;
}
