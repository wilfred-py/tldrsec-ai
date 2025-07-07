import { getFormMetadata } from '../../../lib/sec-edgar/form-registry';

/**
 * Returns a description of what a particular form type is used for
 * @param formType The SEC form type (e.g., '10-K', '8-K', etc.)
 * @returns A human-readable description of the form type
 */
export function getFormTypeDescription(formType: string): string {
  // Normalize the form type
  const normalizedFormType = formType.replace(/\//g, '-').toUpperCase();
  
  // Try to get the form metadata from the registry
  const formMetadata = getFormMetadata(normalizedFormType);
  if (formMetadata && formMetadata.description) {
    return formMetadata.description;
  }
  
  // Fallback descriptions for common form types
  const formDescriptions: Record<string, string> = {
    '10-K': 'Annual report providing a comprehensive overview of the company\'s business and financial condition.',
    '10-Q': 'Quarterly report providing a continuing view of the company\'s financial position during the year.',
    '8-K': 'Current report notifying investors of specific material events that are important to shareholders.',
    '144': 'Form filed by an affiliate of the issuer to report the proposed sale of restricted securities.',
    'SC 13G': 'Schedule 13G is filed by a person or group that acquires more than 5% of a company\'s securities for passive investment purposes.',
    'SC 13D': 'Schedule 13D is filed when a person or group acquires more than 5% of a voting class of a company\'s equity securities.',
    'DEF 14A': 'Definitive proxy statement containing information for shareholders ahead of a shareholder meeting.',
    '4': 'Statement of changes in beneficial ownership, reporting changes in ownership of company securities by insiders.',
    '3': 'Initial statement of beneficial ownership of securities, filed by company insiders.',
    '5': 'Annual statement of changes in beneficial ownership of securities.',
    'S-1': 'Registration statement for securities offerings, typically used for initial public offerings (IPOs).',
    'S-3': 'Registration statement for securities offerings by companies that already report to the SEC.',
    '424B': 'Prospectus filing under Rule 424(b), providing information about a securities offering.'
  };
  
  return formDescriptions[normalizedFormType] || `Form ${formType} is an SEC filing required for regulatory compliance.`;
}

/**
 * Normalizes a form type string to a standard format
 * @param formType The SEC form type to normalize
 * @returns Normalized form type string
 */
export function normalizeFormType(formType: string): string {
  if (!formType) return '';
  
  // Handle special cases first
  let normalizedType = formType.toUpperCase();
  
  // Handle Schedule 13G/A, Schedule 13D/A, etc.
  if (normalizedType.startsWith('SCHEDULE ')) {
    // Extract the base form type (e.g., '13G' from 'SCHEDULE 13G/A')
    const match = normalizedType.match(/SCHEDULE\s+(\d+[A-Z])(\/?[A-Z])?/);
    if (match) {
      const baseForm = match[1]; // e.g., '13G'
      const amendment = match[2] ? '-A' : ''; // Convert '/A' to '-A'
      return `SC ${baseForm}${amendment}`;
    }
  }
  
  // Handle Form 424B2, Form 424B3, etc.
  if (normalizedType.startsWith('FORM ')) {
    normalizedType = normalizedType.substring(5);
  }
  
  // Handle common replacements
  const replacements: Record<string, string> = {
    'SCHEDULE 13G/A': 'SC 13G-A',
    'SCHEDULE 13G': 'SC 13G',
    'SCHEDULE 13D/A': 'SC 13D-A',
    'SCHEDULE 13D': 'SC 13D',
    'FORM 144': '144'
  };
  
  if (replacements[normalizedType]) {
    return replacements[normalizedType];
  }
  
  // Convert to uppercase and replace slashes with hyphens
  return normalizedType.replace(/\//g, '-');
}

/**
 * Gets the display name for a form type
 * @param formType The SEC form type
 * @returns Human-friendly display name for the form type
 */
export function getFormTypeDisplayName(formType: string): string {
  const normalizedType = normalizeFormType(formType);
  const formMetadata = getFormMetadata(normalizedType);
  
  return formMetadata?.displayName || `Form ${formType}`;
}

/**
 * Determines if a form type is considered a priority form
 * @param formType The SEC form type to check
 * @returns Boolean indicating if this is a priority form type
 */
export function isPriorityFormType(formType: string): boolean {
  const normalizedType = normalizeFormType(formType);
  const priorityForms = ['10-K', '10-Q', '8-K', '6-K', '20-F', '40-F', 'DEF 14A'];
  
  return priorityForms.includes(normalizedType);
}
