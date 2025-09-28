/**
 * Response Fixer for Claude API Responses
 * 
 * Provides utilities to fix common issues with Claude API responses
 * to ensure they meet minimum schema requirements.
 * 
 * Enhanced with robust validation and fallback mechanisms for all SEC filing types.
 */

import { SECFilingType } from '../prompts/prompt-types';
import { logger } from '../../logging';

// Define minimum required fields for each filing type
const requiredFieldsByType: Record<string, string[]> = {
  '4': ['company', 'filerName', 'transactions', 'summary'],
  '8-K': ['company', 'eventType', 'summary'],
  '10-K': ['company', 'fiscalYear', 'summary'],
  '10-Q': ['company', 'fiscalQuarter', 'summary'],
  '144': ['company', 'filerName', 'summary'],
  'SC 13G': ['company', 'investor', 'ownershipPercent', 'summary'],
  'SC 13D': ['company', 'investor', 'ownershipPercent', 'purpose', 'summary'],
  '424B2': ['company', 'offeringType', 'summary'],
  'Generic': ['company', 'filingType', 'summary']
};

/**
 * Validates if a parsed response has all required fields for its filing type
 * 
 * @param data - The parsed data to validate
 * @param filingType - The type of SEC filing
 * @returns Object with validation result and missing fields
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  filingType: SECFilingType
): { valid: boolean; missingFields: string[] } {
  // Get required fields for this filing type or fall back to generic
  const requiredFields = requiredFieldsByType[filingType as string] || requiredFieldsByType['Generic'];
  
  // Check for missing fields
  const missingFields = requiredFields.filter(field => {
    // Special handling for transactions array - must exist and not be empty
    if (field === 'transactions') {
      return !data[field] || !Array.isArray(data[field]) || data[field].length === 0;
    }
    return data[field] === undefined || data[field] === null || data[field] === '';
  });
  
  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Ensures a response has the minimum required fields based on filing type
 * This is used as a fallback when parsing fails
 * 
 * @param responseText - The raw text response from Claude
 * @param filingType - The type of SEC filing
 * @param fallbackCompany - Fallback company name if not found
 * @returns A valid JSON object with minimum required fields
 */
export function ensureMinimumFields(
  responseText: string,
  filingType: SECFilingType,
  fallbackCompany: string = 'Unknown Company'
): Record<string, unknown> {
  logger.debug(`Ensuring minimum fields for ${filingType} filing`);
  
  // First try to extract any JSON-like structures from the response
  const extractedData = extractPartialData(responseText);
  
  // Extract what appears to be the summary from the text response
  let summary = extractedData.summary || responseText;
  
  // Try to limit to first 2000 characters for summary
  if (summary.length > 2000) {
    summary = summary.substring(0, 2000) + '...';
  }
  
  // Try to extract company name from the response or use extracted data
  let company = extractedData.company || fallbackCompany;
  if (!extractedData.company) {
    const companyMatch = responseText.match(/(?:for|by|from)\s+([A-Z][A-Za-z0-9\s,\.]+?)(?:\(|on|filed|dated|dated on|report|\.|,)/);
    if (companyMatch && companyMatch[1]) {
      company = companyMatch[1].trim();
    }
  }
  
  // Create minimum valid object based on filing type
  let result: Record<string, unknown>;
  
  switch (filingType) {
    case '4':
      result = {
        company,
        filingDate: extractedData.filingDate || new Date().toISOString().split('T')[0],
        filerName: extractedData.filerName || extractFilerName(responseText) || 'Unknown Filer',
        relationship: extractedData.relationship || extractRelationship(responseText) || 'Company Insider',
        transactions: extractedData.transactions || [],
        summary
      };
      
      // Ensure transactions is an array with at least one placeholder item
      if (!Array.isArray(result.transactions) || result.transactions.length === 0) {
        result.transactions = [{
          type: 'Unknown',
          date: result.filingDate,
          shares: 'Unknown',
          price: 'Unknown',
          value: 'Unknown',
          sharesOwned: 'Unknown'
        }];
      }
      break;
      
    case '8-K':
      result = {
        company,
        reportDate: extractedData.reportDate || extractedData.filingDate || new Date().toISOString().split('T')[0],
        eventType: extractedData.eventType || extractEventType(responseText) || 'Corporate Event',
        summary,
        positiveDevelopments: extractedData.positiveDevelopments || extractBulletPoints(responseText, 'positive') || [],
        potentialConcerns: extractedData.potentialConcerns || extractBulletPoints(responseText, 'concern') || []
      };
      break;
      
    case '144':
      result = {
        company,
        filingDate: extractedData.filingDate || new Date().toISOString().split('T')[0],
        filerName: extractedData.filerName || extractFilerName(responseText) || 'Unknown Filer',
        proposedSale: extractedData.proposedSale || 'Details not available',
        summary
      };
      break;
      
    case 'SC 13G':
    case 'SCHEDULE 13G':
      result = {
        company,
        filingDate: extractedData.filingDate || new Date().toISOString().split('T')[0],
        investor: extractedData.investor || extractInvestor(responseText) || 'Unknown Investor',
        ownershipPercent: extractedData.ownershipPercent || extractPercentage(responseText) || 'Unknown',
        summary
      };
      break;
      
    case '424B2':
    case '424B3':
      result = {
        company,
        filingDate: extractedData.filingDate || new Date().toISOString().split('T')[0],
        offeringType: extractedData.offeringType || 'Securities Offering',
        offeringDetails: extractedData.offeringDetails || 'Details not available',
        summary
      };
      break;
      
    case '10-K':
      result = {
        company,
        fiscalYear: extractedData.fiscalYear || extractFiscalPeriod(responseText) || 'Recent Fiscal Year',
        filingDate: extractedData.filingDate || new Date().toISOString().split('T')[0],
        keyPoints: extractedData.keyPoints || extractBulletPoints(responseText) || [],
        summary
      };
      break;
      
    case '10-Q':
      result = {
        company,
        fiscalQuarter: extractedData.fiscalQuarter || extractFiscalPeriod(responseText) || 'Recent Quarter',
        filingDate: extractedData.filingDate || new Date().toISOString().split('T')[0],
        keyPoints: extractedData.keyPoints || extractBulletPoints(responseText) || [],
        summary
      };
      break;
      
    default:
      result = {
        company,
        filingType,
        filingDate: extractedData.filingDate || new Date().toISOString().split('T')[0],
        keyPoints: extractedData.keyPoints || [summary.substring(0, 200) + '...'],
        summary
      };
  }
  
  // Log what we've constructed
  logger.debug(`Created fallback data for ${filingType} with fields: ${Object.keys(result).join(', ')}`);
  
  return result;
}

/**
 * Attempts to extract structured data from response text even when JSON parsing fails
 * Uses regex patterns to find key information
 * 
 * @param text - The response text to extract data from
 * @returns Partial data extracted from the text
 */
function extractPartialData(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  try {
    // Try to find any JSON-like structures in the text
    const jsonPattern = /{[\s\S]*?}/g;
    const jsonMatches = text.match(jsonPattern);
    
    if (jsonMatches) {
      // Try each match to see if any can be parsed as JSON
      for (const match of jsonMatches) {
        try {
          const parsed = JSON.parse(match);
          // If we successfully parsed JSON, merge it into our result
          Object.assign(result, parsed);
        } catch {
          // Continue to the next match if this one fails
          continue;
        }
      }
    }
    
    // Extract company name
    const companyPattern = /(?:company|issuer|filer)\s*[:\-]\s*([^\n\r,\.]{3,50})/i;
    const companyMatch = text.match(companyPattern);
    if (companyMatch && companyMatch[1]) {
      result.company = companyMatch[1].trim();
    }
    
    // Extract filing date
    const datePattern = /(?:filing|report|document)\s*date\s*[:\-]\s*([^\n\r,]{5,20})/i;
    const dateMatch = text.match(datePattern);
    if (dateMatch && dateMatch[1]) {
      result.filingDate = dateMatch[1].trim();
    }
    
    // Extract summary
    const summaryPattern = /(?:summary|overview)\s*[:\-]\s*([^\n\r]{20,2000})/i;
    const summaryMatch = text.match(summaryPattern);
    if (summaryMatch && summaryMatch[1]) {
      result.summary = summaryMatch[1].trim();
    }
    
    // Extract key points
    const keyPointsPattern = /(?:key\s*points|highlights|important\s*points)[^:]*:\s*([\s\S]*?)(?:\n\n|\n#|$)/i;
    const keyPointsMatch = text.match(keyPointsPattern);
    if (keyPointsMatch && keyPointsMatch[1]) {
      result.keyPoints = extractBulletPoints(keyPointsMatch[1]);
    }
    
    // Extract filer name for Form 4
    const filerPattern = /(?:reporting\s*person|insider|filer)\s*[:\-]\s*([^\n\r,\.]{3,50})/i;
    const filerMatch = text.match(filerPattern);
    if (filerMatch && filerMatch[1]) {
      result.filerName = filerMatch[1].trim();
    }
    
    // Extract relationship for Form 4
    const relationshipPattern = /(?:relationship|position|title)\s*[:\-]\s*([^\n\r,\.]{3,50})/i;
    const relationshipMatch = text.match(relationshipPattern);
    if (relationshipMatch && relationshipMatch[1]) {
      result.relationship = relationshipMatch[1].trim();
    }
    
    // Extract event type for 8-K
    const eventTypePattern = /(?:event|item)\s*[:\-]\s*([^\n\r,\.]{3,100})/i;
    const eventTypeMatch = text.match(eventTypePattern);
    if (eventTypeMatch && eventTypeMatch[1]) {
      result.eventType = eventTypeMatch[1].trim();
    }
    
    return result;
  } catch (error) {
    logger.error(`Error extracting partial data: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

/**
 * Extract filer name from response text
 */
function extractFilerName(text: string): string | null {
  const patterns = [
    /(?:by|filer|reporting person|insider|officer|director)[\s:]+((?:[A-Z][A-Za-z\-\.\s]+){1,5})/i,
    /(?:name of|reporting)\s+(?:person|insider|filer)\s*[:\-]\s*([^\n\r,\.]{3,50})/i,
    /([A-Z][A-Za-z\s\.\-]+)\s+(?:is|was|has|reported|filed|submitted)/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].trim().length > 2) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Extract relationship from response text
 */
function extractRelationship(text: string): string | null {
  const patterns = [
    /(?:relationship|position|title)[\s:]+((?:[A-Za-z\-\.\s]+){1,5})/i,
    /(?:serves|serving)\s+as\s+(?:the\s+)?([^\n\r,\.]{3,30})/i,
    /(?:is|was)\s+(?:a|the)\s+([^\n\r,\.]{3,30})\s+of\s+the\s+(?:company|issuer)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].trim().length > 2) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Extract event type from 8-K response text
 */
function extractEventType(text: string): string | null {
  const patterns = [
    /(?:event|item)\s*(?:type)?\s*[:\-]\s*([^\n\r,\.]{3,100})/i,
    /(?:form|report)\s+8-K\s+(?:was\s+filed\s+)?(?:to\s+)?(?:report|announce|disclose)\s+([^\n\r,\.]{3,100})/i,
    /(?:announced|reported|disclosed)\s+([^\n\r,\.]{3,100})\s+(?:in|through|via)\s+(?:a|this|the|their)\s+(?:form\s+)?8-K/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].trim().length > 3) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Extract bullet points from text
 * 
 * @param text - The text to extract bullet points from
 * @param filter - Optional keyword to filter points (e.g., 'positive', 'concern')
 * @returns Array of bullet points
 */
function extractBulletPoints(text: string, filter?: string): string[] {
  const bulletPoints: string[] = [];
  const bulletRegex = /(?:^|\n)\s*(?:-|\*|\d+\.)\s+([^\n]+)/g;
  
  let match;
  while ((match = bulletRegex.exec(text)) !== null) {
    if (match[1] && match[1].trim()) {
      const point = match[1].trim();
      
      // Apply filter if specified
      if (filter) {
        const filterRegex = new RegExp(filter, 'i');
        if (filterRegex.test(point)) {
          bulletPoints.push(point);
        }
      } else {
        bulletPoints.push(point);
      }
    }
  }
  
  // If no bullet points found or too few, try to extract sentences
  if (bulletPoints.length < 2 && !filter) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 200)
      .slice(0, 5);
  }
  
  return bulletPoints;
}

/**
 * Extract investor name from Schedule 13G/D response text
 */
function extractInvestor(text: string): string | null {
  const patterns = [
    /(?:investor|reporting person|filer)[\s:]+((?:[A-Z][A-Za-z\-\.\s]+){1,5})/i,
    /([A-Z][A-Za-z\s\.\-]+)\s+(?:has|reported|filed|submitted)\s+(?:a|an)\s+(?:Schedule\s+13G|13G|ownership)/i,
    /([A-Z][A-Za-z\s\.\-]+)\s+(?:disclosed|reported)\s+(?:a|an)\s+([\d\.]+)%\s+(?:stake|ownership|position)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].trim().length > 2) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Extract ownership percentage from Schedule 13G/D response text
 */
function extractPercentage(text: string): string | null {
  const patterns = [
    /(?:owns|holding|stake|ownership|position)\s+(?:of\s+)?([\d\.]+)%/i,
    /([\d\.]+)%\s+(?:stake|ownership|position)/i,
    /(?:owns|holding|stake|ownership|position)\s+(?:of\s+)?([\d\.]+)\s+percent/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return `${match[1]}%`;
    }
  }
  
  return null;
}

/**
 * Extract fiscal period (year/quarter) from 10-K/10-Q response text
 */
function extractFiscalPeriod(text: string): string | null {
  const patterns = [
    /(?:fiscal|financial)\s+(?:year|quarter)\s+(?:ended|ending)\s+([^\n\r,\.]{5,20})/i,
    /(?:for\s+the\s+)(?:fiscal|financial)?\s+(?:year|quarter)\s+(?:ended|ending)\s+([^\n\r,\.]{5,20})/i,
    /(?:period|quarter|year)\s+(?:ended|ending)\s+([^\n\r,\.]{5,20})/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Try to find a year
  const yearMatch = text.match(/(?:20\d{2}|19\d{2})/);
  if (yearMatch) {
    return `Fiscal Year ${yearMatch[0]}`;
  }
  
  return null;
}
