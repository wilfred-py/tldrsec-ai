import { FilingType } from '../sec-edgar/types';
import { FormTypeMetadata, getFormMetadata } from '../sec-edgar/form-registry';
import * as cheerio from 'cheerio';
import { extractEnhancedFilingContent, formatForSummarization, detectFilingType } from './sec-filing-integration';
import { logger } from '../logging';

const enhancedLogger = logger.child('form-parser:enhanced');

/**
 * Interface for parsed content from SEC filings
 */
export interface ParsedContent {
  title?: string;
  content: string;
  sections: Record<string, string>;
  keyData: Record<string, string | number | boolean | null>;
  metadata: Record<string, any>;
}

/**
 * Parse SEC filing content based on the filing type
 * @param content The raw content to parse
 * @param filingType The type of filing
 * @returns Parsed content with sections and key data
 */
export function parseFormContent(content: string, filingType: FilingType): ParsedContent {
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
 * @param content The raw content to parse
 * @param filingType The type of filing
 * @returns Parsed content with detailed sections and key data
 */
function parseDetailedForm(content: string, filingType: FilingType): ParsedContent {
  const $ = cheerio.load(content);
  const sections: Record<string, string> = {};
  const keyData: Record<string, string | number | boolean | null> = {};
  
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
    
    // Extract key financial data
    try {
      // Look for tables with financial data
      $('table').each((i, table) => {
        const tableText = $(table).text().toLowerCase();
        
        // Check if this table contains financial information
        if (tableText.includes('revenue') || 
            tableText.includes('income') || 
            tableText.includes('earnings') || 
            tableText.includes('assets') || 
            tableText.includes('liabilities')) {
          
          // Extract rows
          $(table).find('tr').each((j, row) => {
            const cells = $(row).find('td, th');
            if (cells.length >= 2) {
              const label = $(cells[0]).text().trim().toLowerCase();
              const value = $(cells[1]).text().trim();
              
              // Store common financial metrics
              if (label.includes('revenue') || 
                  label.includes('income') || 
                  label.includes('earnings') || 
                  label.includes('assets') || 
                  label.includes('liabilities') || 
                  label.includes('cash') || 
                  label.includes('debt')) {
                
                keyData[label] = value;
              }
            }
          });
        }
      });
    } catch (error) {
      console.error('Error extracting financial data:', error);
    }
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
 * @param content The raw content to parse
 * @param filingType The type of filing
 * @returns Parsed content with standard sections and key data
 */
function parseStandardForm(content: string, filingType: FilingType): ParsedContent {
  const $ = cheerio.load(content);
  const sections: Record<string, string> = {};
  const keyData: Record<string, string | number | boolean | null> = {};
  
  // Extract title
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                '';
  
  // Extract content based on filing type
  if (filingType === '8-K') {
    // For 8-K, extract the items and the main content
    const itemSelectors = [
      { name: 'Item1.01', selectors: [':contains("Item 1.01")', ':contains("ITEM 1.01")'] },
      { name: 'Item2.01', selectors: [':contains("Item 2.01")', ':contains("ITEM 2.01")'] },
      { name: 'Item5.02', selectors: [':contains("Item 5.02")', ':contains("ITEM 5.02")'] },
      { name: 'Item7.01', selectors: [':contains("Item 7.01")', ':contains("ITEM 7.01")'] },
      { name: 'Item8.01', selectors: [':contains("Item 8.01")', ':contains("ITEM 8.01")'] },
      { name: 'Item9.01', selectors: [':contains("Item 9.01")', ':contains("ITEM 9.01")'] }
    ];
    
    itemSelectors.forEach(item => {
      for (const selector of item.selectors) {
        const element = $(selector);
        if (element.length) {
          // Get text from this element and the next few siblings until the next item
          let itemContent = '';
          let currentElement = element;
          let nextItemFound = false;
          
          for (let i = 0; i < 20 && !nextItemFound; i++) {
            const text = currentElement.text().trim();
            if (text) {
              itemContent += text + '\n\n';
            }
            
            currentElement = currentElement.next();
            
            // Check if we've reached the next item
            if (!currentElement.length || 
                itemSelectors.some(s => s.selectors.some(sel => currentElement.is(sel)))) {
              nextItemFound = true;
            }
          }
          
          sections[item.name] = itemContent.trim();
          
          // Store the item number in key data
          keyData[`has${item.name}`] = true;
          break;
        }
      }
    });
    
    // Extract event date
    const datePattern = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/g;
    const dateMatches = content.match(datePattern);
    if (dateMatches && dateMatches.length > 0) {
      keyData['eventDate'] = dateMatches[0];
    }
  } else if (filingType.includes('DEF 14A') || filingType.includes('DEFA14A') || filingType.includes('PRE 14A')) {
    // For proxy statements, extract meeting information and proposals
    const meetingDateMatch = content.match(/meeting\s+(?:will\s+be|to\s+be)\s+held\s+on\s+(.*?)(?:\.|,)/i);
    if (meetingDateMatch && meetingDateMatch[1]) {
      keyData['meetingDate'] = meetingDateMatch[1].trim();
    }
    
    // Extract proposals
    let proposalCount = 0;
    $(':contains("Proposal")').each((i, element) => {
      const text = $(element).text().trim();
      const proposalMatch = text.match(/Proposal\s+(?:No\.)?\s*(\d+)[:\.]?\s*(.*)/i);
      if (proposalMatch && proposalMatch[1] && proposalMatch[2]) {
        const proposalNumber = proposalMatch[1];
        const proposalTitle = proposalMatch[2].trim();
        sections[`Proposal${proposalNumber}`] = proposalTitle;
        proposalCount++;
      }
    });
    
    keyData['proposalCount'] = proposalCount;
  } else if (filingType.includes('13F')) {
    // For 13F filings, extract holdings information
    let holdingsCount = 0;
    let totalValue = 0;
    
    // Look for tables with holdings data
    $('table').each((i, table) => {
      const tableText = $(table).text().toLowerCase();
      
      // Check if this table contains holdings information
      if (tableText.includes('cusip') || 
          tableText.includes('value') || 
          tableText.includes('shares') || 
          tableText.includes('investment')) {
        
        // Count rows (excluding header)
        const rows = $(table).find('tr').length - 1;
        if (rows > 0) {
          holdingsCount += rows;
        }
        
        // Try to extract total value
        $(table).find('tr').each((j, row) => {
          const cells = $(row).find('td, th');
          const rowText = $(row).text().toLowerCase();
          
          if (rowText.includes('total') && cells.length >= 2) {
            const valueText = $(cells[1]).text().trim().replace(/[^0-9.]/g, '');
            const value = parseFloat(valueText);
            if (!isNaN(value)) {
              totalValue += value;
            }
          }
        });
      }
    });
    
    keyData['holdingsCount'] = holdingsCount;
    keyData['totalValue'] = totalValue > 0 ? totalValue : null;
  }
  
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
 * @param content The raw content to parse
 * @param filingType The type of filing
 * @returns Parsed content with simple sections and key data
 */
function parseSimpleForm(content: string, filingType: FilingType): ParsedContent {
  const $ = cheerio.load(content);
  const sections: Record<string, string> = {};
  const keyData: Record<string, string | number | boolean | null> = {};
  
  // Extract title
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                '';
  
  if (filingType === 'Form4' || filingType === '4' || filingType === 'Form3' || filingType === '3' || filingType === 'Form5' || filingType === '5') {
    // For insider trading forms, extract transaction information
    
    // Extract issuer information
    const issuerNameElement = $(':contains("Issuer Name")').first();
    if (issuerNameElement.length) {
      const issuerName = issuerNameElement.next().text().trim();
      keyData['issuerName'] = issuerName;
    }
    
    // Extract reporting person information
    const reportingPersonElement = $(':contains("Reporting Person")').first();
    if (reportingPersonElement.length) {
      const reportingPerson = reportingPersonElement.next().text().trim();
      keyData['reportingPerson'] = reportingPerson;
    }
    
    // Extract relationship to issuer
    const relationshipElement = $(':contains("Relationship of Reporting Person")').first();
    if (relationshipElement.length) {
      const relationship = relationshipElement.next().text().trim();
      keyData['relationship'] = relationship;
    }
    
    // Extract transaction information
    let transactionCount = 0;
    $('table').each((i, table) => {
      const tableText = $(table).text().toLowerCase();
      
      // Check if this table contains transaction information
      if (tableText.includes('transaction') || 
          tableText.includes('securities acquired') || 
          tableText.includes('securities disposed')) {
        
        // Count rows (excluding header)
        const rows = $(table).find('tr').length - 1;
        if (rows > 0) {
          transactionCount += rows;
          
          // Extract transaction details
          $(table).find('tr').each((j, row) => {
            if (j > 0) { // Skip header row
              const cells = $(row).find('td');
              if (cells.length >= 5) {
                const transactionDate = $(cells[0]).text().trim();
                const securityType = $(cells[1]).text().trim();
                const transactionType = $(cells[2]).text().trim();
                const shares = $(cells[3]).text().trim();
                const price = $(cells[4]).text().trim();
                
                sections[`Transaction${j}`] = `Date: ${transactionDate}, Security: ${securityType}, Type: ${transactionType}, Shares: ${shares}, Price: ${price}`;
              }
            }
          });
        }
      }
    });
    
    keyData['transactionCount'] = transactionCount;
  } else if (filingType === 'Form 144' || filingType === '144') {
    // For Form 144, extract proposed sale information
    
    // Extract issuer information
    const issuerNameElement = $(':contains("Issuer Name")').first();
    if (issuerNameElement.length) {
      const issuerName = issuerNameElement.next().text().trim();
      keyData['issuerName'] = issuerName;
    }
    
    // Extract security information
    const securityElement = $(':contains("Title of the class of securities")').first();
    if (securityElement.length) {
      const security = securityElement.next().text().trim();
      keyData['securityType'] = security;
    }
    
    // Extract amount to be sold
    const amountElement = $(':contains("Amount of securities to be sold")').first();
    if (amountElement.length) {
      const amount = amountElement.next().text().trim();
      keyData['amountToSell'] = amount;
    }
    
    // Extract approximate sale date
    const dateElement = $(':contains("Approximate date of sale")').first();
    if (dateElement.length) {
      const date = dateElement.next().text().trim();
      keyData['approximateSaleDate'] = date;
    }
  }
  
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
 * @param content The raw content to parse
 * @returns Parsed content with basic extraction
 */
function parseGenericForm(content: string): ParsedContent {
  const $ = cheerio.load(content);
  
  // Extract title
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                '';
  
  // Extract all headings as sections
  const sections: Record<string, string> = {};
  $('h1, h2, h3, h4, h5, h6').each((i, heading) => {
    const headingText = $(heading).text().trim();
    if (headingText) {
      let sectionContent = '';
      let currentElement = $(heading).next();
      
      // Collect content until the next heading
      while (currentElement.length && !currentElement.is('h1, h2, h3, h4, h5, h6')) {
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
 * @param parsedContent The parsed content
 * @param maxLength Maximum length of the extracted content
 * @returns The most important content for summarization
 */
export function extractImportantContent(parsedContent: ParsedContent, maxLength: number = 10000): string {
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
  const filingType = metadata.filingType as FilingType;
  const formMetadata = getFormMetadata(filingType as string);
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
 * @param filingType The filing type
 * @param sectionNames Optional list of available section names to filter from
 * @returns Array of important section names
 */
function getImportantSectionsForFilingType(filingType: FilingType, sectionNames: string[] = []): string[] {
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

/**
 * Enhanced parseFormContent: handles URL-based extraction and inline XBRL.
 * Callers that have a URL or expect inline-XBRL filings reach for this entry
 * point; everyone else uses {@link parseFormContent} directly.
 *
 * Falls back to {@link parseFormContent} when:
 *   - no URL is supplied and the content is not inline XBRL, or
 *   - any enhanced path throws.
 */
export async function parseFormContentEnhanced(
  content: string,
  filingType: FilingType,
  url?: string
): Promise<ParsedContent> {
  try {
    if (url) {
      enhancedLogger.debug(`Using enhanced extractor for URL: ${url}`);
      const extractionResult = await extractEnhancedFilingContent(url, { debug: true });

      const typedResult = extractionResult as {
        success: boolean;
        content: string;
        metadata: {
          filingType?: string;
          extractionMethod?: string;
        };
      };

      if (typedResult.success && typedResult.content) {
        enhancedLogger.info(`Successfully extracted content from ${url} using enhanced extractor`);

        const formattedContent = formatForSummarization(typedResult.content, {
          maxLength: 100000,
          includeBoilerplate: false
        });

        const detectedFilingType = filingType ||
          (typedResult.metadata?.filingType as FilingType) ||
          detectFilingType(url, formattedContent) as FilingType;

        const parsedContent = parseFormContent(formattedContent, detectedFilingType);

        parsedContent.metadata = {
          ...parsedContent.metadata,
          enhancedExtraction: true,
          extractionMethod: typedResult.metadata?.extractionMethod,
          originalUrl: url
        };

        return parsedContent;
      }

      enhancedLogger.warn(`Enhanced extraction failed for ${url}, falling back to standard parser`);
    }

    if (content.includes('xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"') ||
        content.includes('<ix:header') ||
        content.includes('<ix:hidden')) {
      enhancedLogger.info('Content appears to be inline XBRL, using enhanced processing');

      try {
        const cleanedContent = content
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<ix:header[^>]*>[\s\S]*?<\/ix:header>/gi, '')
          .replace(/<ix:hidden[^>]*>[\s\S]*?<\/ix:hidden>/gi, '')
          .replace(/<ix:[^>]*>/g, '')
          .replace(/<\/ix:[^>]*>/g, '');

        const parsedContent = parseFormContent(cleanedContent, filingType);

        parsedContent.metadata = {
          ...parsedContent.metadata,
          enhancedExtraction: true,
          extractionMethod: 'inline-xbrl-cleanup',
          isInlineXbrl: true
        };

        return parsedContent;
      } catch (error) {
        const typedError = error as Error;
        enhancedLogger.error(`Error processing inline XBRL content: ${typedError.message}`);
        throw error;
      }
    }

    enhancedLogger.debug(`Using standard parser for content`);
    return parseFormContent(content, filingType);
  } catch (error) {
    const typedError = error as Error;
    enhancedLogger.error(`Error in enhanced form parser: ${typedError.message}`);
    return parseFormContent(content, filingType);
  }
}

/**
 * Enhanced extractImportantContent. Kept for symmetry with
 * parseFormContentEnhanced; currently delegates to extractImportantContent.
 */
export function extractImportantContentEnhanced(
  parsedContent: ParsedContent,
  maxLength: number = 10000
): string {
  return extractImportantContent(parsedContent, maxLength);
}
