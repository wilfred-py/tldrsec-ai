import { SECFiling, Company } from '../shared-types';
import { getFormTypeDescription } from '../utils/formTypeUtils';

/**
 * Generates a fallback summary when document content cannot be retrieved
 * Uses available metadata to create a structured summary with filing information
 * 
 * @param filing The SEC filing object
 * @param company The company information
 * @param formType The form type
 * @returns A structured summary text
 */
export function generateFallbackSummary(filing: SECFiling, company: Company, formType: string): string {
  // Get form type description
  const formDescription = getFormTypeDescription(formType);
  
  // Format filing date if available
  const filingDate = filing.filingDate 
    ? new Date(filing.filingDate).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : 'an unknown date';
  
  // Format period of report if available
  const periodOfReport = (filing as any).periodOfReport
    ? new Date((filing as any).periodOfReport).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : null;
  
  // Build the summary
  let summary = `This is a Form ${formType} filing from ${company.name || 'the company'}`;
  
  if (company.ticker) {
    summary += ` (${company.ticker})`;
  }
  
  summary += ` submitted on ${filingDate}.`;
  
  // Add period of report if available
  if (periodOfReport) {
    summary += ` The filing covers the period ending ${periodOfReport}.`;
  }
  
  // Add form type description
  summary += `\n\n${formDescription}`;
  
  // Add filing details if available
  if (filing.description) {
    summary += `\n\nFiling description: ${filing.description}`;
  }
  
  // Add CIK if available
  if (filing.cik) {
    summary += `\n\nCIK: ${filing.cik}`;
  }
  
  // Add accession number if available
  if (filing.accessionNumber) {
    summary += `\n\nAccession Number: ${filing.accessionNumber}`;
  }
  
  // Add note about fallback summary
  summary += `\n\nNote: This is an automatically generated summary based on filing metadata. For complete details, please refer to the original filing document.`;
  
  return summary;
}

/**
 * Generates key points for a fallback summary
 * 
 * @param filing The SEC filing object
 * @param company The company information
 * @param formType The form type
 * @returns Array of key points
 */
export function generateFallbackKeyPoints(filing: SECFiling, company: Company, formType: string): string[] {
  const keyPoints = [
    `This is a Form ${formType} filing from ${company.name || 'the company'}${company.ticker ? ` (${company.ticker})` : ''}.`,
    `The filing was submitted on ${filing.filingDate ? new Date(filing.filingDate).toLocaleDateString() : 'an unknown date'}.`
  ];
  
  // Add period of report if available
  if ((filing as any).periodOfReport) {
    keyPoints.push(`The filing covers the period ending ${new Date((filing as any).periodOfReport).toLocaleDateString()}.`);
  }
  
  // Add form type specific key point
  switch (formType.toUpperCase().replace(/\//g, '-')) {
    case '10-K':
      keyPoints.push('This is an annual report that provides a comprehensive overview of the company\'s business and financial condition.');
      break;
    case '10-Q':
      keyPoints.push('This is a quarterly report that provides a continuing view of the company\'s financial position during the year.');
      break;
    case '8-K':
      keyPoints.push('This is a current report notifying investors of a specific material event that is important to shareholders.');
      break;
    case '144':
      keyPoints.push('This form reports the proposed sale of restricted securities by an affiliate of the issuer.');
      break;
    default:
      keyPoints.push(`This is a ${formType} filing required for regulatory compliance.`);
  }
  
  // Add note about fallback summary
  keyPoints.push('This summary was automatically generated based on filing metadata as the full document content was not available for analysis.');
  
  return keyPoints;
}
