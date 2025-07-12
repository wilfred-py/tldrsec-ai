import { SecFiling } from '../../../types/sec';
import { getFormTypeDescription } from '../utils/formTypeService';
import { logger } from '../../../lib/logging';

// Define a simplified Company type for this module
interface Company {
  name: string;
  ticker?: string;
  cik?: string;
  description?: string;
}

/**
 * Generates a fallback summary when document content cannot be retrieved or AI summarization fails
 * @param filing SEC filing information
 * @param company Company information
 * @param formType The form type
 * @returns A generated fallback summary string
 */
export function generateFallbackSummary(filing: SecFiling, company: Company, formType: string): string {
  try {
    const companyName = company.name || 'Unknown Company';
    const ticker = company.ticker || '';
    const filingDate = filing.filingDate ? new Date(filing.filingDate).toLocaleDateString() : 'Unknown date';
    
    // Get the form type description
    const formDescription = getFormTypeDescription(formType);
    
    // Build the summary
    let summary = `${companyName}`;
    if (ticker) {
      summary += ` (${ticker})`;
    }
    summary += ` filed a ${formType} on ${filingDate}. `;
    
    // Add form type description (without HTML tags)
    const plainDescription = formDescription.replace(/<\/?[^>]+(>|$)/g, '');
    summary += plainDescription;
    
    // Add filing-specific details if available
    if (filing.description) {
      summary += ` The filing is described as: ${filing.description}.`;
    }
    
    // Check for period of report (may not exist on all filing types)
    if ('periodOfReport' in filing && (filing as any).periodOfReport) {
      const periodDate = new Date((filing as any).periodOfReport).toLocaleDateString();
      summary += ` This report covers the period ending ${periodDate}.`;
    }
    
    // Add company description if available
    if (company.description) {
      summary += ` ${companyName} ${company.description}`;
    }
    
    // Add a note about this being a fallback summary
    summary += ' (Note: This is an automatically generated summary. For complete information, please review the original filing.)';
    
    return summary;
  } catch (error) {
    logger.error(`Error generating fallback summary: ${error instanceof Error ? error.message : String(error)}`);
    return `A ${formType} filing was submitted by ${company.name || 'a company'}${company.ticker ? ` (${company.ticker})` : ''}. Please review the original filing for details.`;
  }
}
