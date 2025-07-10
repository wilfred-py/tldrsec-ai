import { FilingType } from '../../types/sec/filing';
import { getFormMetadata } from '../../lib/sec-edgar/form-registry';

/**
 * Normalizes a form type string to a standard format
 * @param formType The form type string to normalize
 * @returns Normalized form type
 */
export function normalizeFormType(formType: string): FilingType {
  if (!formType) return 'UNKNOWN' as FilingType;
  
  // Normalize the form type
  let normalizedFormType = formType.replace(/\//g, '-').toUpperCase();
  
  // Handle special cases
  if (normalizedFormType.includes('144') || normalizedFormType === 'FORM 144') {
    normalizedFormType = '144';
  } else if (normalizedFormType.includes('8-K') || normalizedFormType === 'FORM 8K') {
    normalizedFormType = '8-K';
  } else if (normalizedFormType.includes('10-K') || normalizedFormType === 'FORM 10K') {
    normalizedFormType = '10-K';
  } else if (normalizedFormType.includes('10-Q') || normalizedFormType === 'FORM 10Q') {
    normalizedFormType = '10-Q';
  } else if (normalizedFormType.includes('13F') || normalizedFormType === 'FORM 13F') {
    normalizedFormType = '13F-HR';
  } else if (normalizedFormType.includes('13D') || normalizedFormType === 'FORM 13D') {
    normalizedFormType = 'SC 13D';
  } else if (normalizedFormType.includes('13G') || normalizedFormType === 'FORM 13G') {
    normalizedFormType = 'SC 13G';
  }
  
  return normalizedFormType as FilingType;
}

/**
 * Returns a description of what a particular form type is used for
 * @param formType The form type to get a description for
 * @returns HTML description of the form type
 */
export function getFormTypeDescription(formType: string): string {
  const formDescriptions: Record<string, string> = {
    '10-K': '<p>Form 10-K is an annual report required by the SEC that gives a comprehensive summary of a company\'s financial performance. It includes audited financial statements, a discussion of the company\'s business and market risks, and disclosures about executive compensation, among other information.</p>',
    '10-Q': '<p>Form 10-Q is a quarterly report required by the SEC that includes unaudited financial statements and provides a continuing view of the company\'s financial position during the year. It is less comprehensive than the annual 10-K report.</p>',
    '8-K': '<p>Form 8-K is a "current report" that companies must file with the SEC to announce major events that shareholders should know about, such as acquisitions, bankruptcy, resignation of directors, or changes in fiscal year.</p>',
    '144': '<p>Form 144 is a notice of the proposed sale of securities when an affiliate of the issuer (such as an officer, director, or large shareholder) intends to sell restricted or control securities.</p>',
    '13F-HR': '<p>Form 13F is a quarterly report that institutional investment managers with over $100 million in qualifying assets must file with the SEC. It discloses their equity holdings and can provide insights into what the smart money is doing.</p>',
    'SC 13D': '<p>Schedule 13D is a filing with the SEC that must be submitted when a person or group acquires more than 5% of a company\'s outstanding shares. It provides information about the acquirer and their intentions.</p>',
    'SC 13G': '<p>Schedule 13G is a shorter version of Schedule 13D that can be filed by certain investors who acquire more than 5% of a company\'s shares but are passive investors with no intention of changing or influencing control of the issuer.</p>',
    'DEF 14A': '<p>Form DEF 14A, or the definitive proxy statement, provides shareholders with information necessary to make informed votes on issues that will be brought up at an annual or special shareholder meeting.</p>',
    '4': '<p>Form 4 is a document that must be filed with the SEC whenever there is a material change in the holdings of company insiders. It reports purchases, sales, and holdings of the company\'s securities by directors, officers, and principal shareholders.</p>',
    '5': '<p>Form 5 is an annual statement of changes in beneficial ownership of securities. It is used to report transactions that should have been reported on Form 4 during the issuer\'s fiscal year or were eligible for deferred reporting.</p>',
  };
  
  return formDescriptions[formType] || `<p>This is a ${formType.replace('-', ' ')} filing.</p>`;
}

/**
 * Determines if a form type is considered a major filing type
 * @param formType The form type to check
 * @returns True if the form type is a major filing
 */
export function isMajorFilingType(formType: string): boolean {
  const majorTypes = ['10-K', '10-Q', '8-K', '144', '13F-HR', 'SC 13D', 'SC 13G', 'DEF 14A', '4', '5'];
  return majorTypes.includes(formType);
}
