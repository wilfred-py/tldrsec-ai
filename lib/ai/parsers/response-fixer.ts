/**
 * Response Fixer for Claude API Responses
 * 
 * Provides utilities to fix common issues with Claude API responses
 * to ensure they meet minimum schema requirements.
 */

import { SECFilingType } from '../prompts/prompt-types';

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
): Record<string, any> {
  // Extract what appears to be the summary from the text response
  let summary = responseText;
  
  // Try to limit to first 2000 characters for summary
  if (summary.length > 2000) {
    summary = summary.substring(0, 2000) + '...';
  }
  
  // Try to extract company name from the response
  let company = fallbackCompany;
  const companyMatch = responseText.match(/(?:for|by)\s+([A-Z][A-Za-z0-9\s,\.]+?)(?:\(|on|filed|dated|dated on|report)/);
  if (companyMatch && companyMatch[1]) {
    company = companyMatch[1].trim();
  }
  
  // Create minimum valid object based on filing type
  switch (filingType) {
    case '4':
      return {
        company,
        filingDate: new Date().toISOString().split('T')[0],
        filerName: extractFilerName(responseText) || 'Unknown Filer',
        relationship: extractRelationship(responseText) || 'Company Insider',
        transactions: [],
        summary
      };
      
    case '8-K':
      return {
        company,
        reportDate: new Date().toISOString().split('T')[0],
        eventType: 'Corporate Event',
        summary,
        positiveDevelopments: [],
        potentialConcerns: []
      };
      
    case '144':
      return {
        company,
        filingDate: new Date().toISOString().split('T')[0],
        filerName: extractFilerName(responseText) || 'Unknown Filer',
        summary
      };
      
    default:
      return {
        company,
        filingType,
        filingDate: new Date().toISOString().split('T')[0],
        keyPoints: [summary.substring(0, 200) + '...'],
        summary
      };
  }
}

/**
 * Extract filer name from response text
 */
function extractFilerName(text: string): string | null {
  const filerMatch = text.match(/(?:by|filer|reporting person|insider|officer|director)[\s:]+((?:[A-Z][A-Za-z\-\.\s]+){1,5})/i);
  return filerMatch ? filerMatch[1].trim() : null;
}

/**
 * Extract relationship from response text
 */
function extractRelationship(text: string): string | null {
  const relationshipMatch = text.match(/(?:relationship|position|title)[\s:]+((?:[A-Za-z\-\.\s]+){1,5})/i);
  return relationshipMatch ? relationshipMatch[1].trim() : null;
}
