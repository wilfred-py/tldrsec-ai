import { FilingType } from './types';

/**
 * Metadata for SEC form types
 */
export interface FormTypeMetadata {
  id: FilingType;
  displayName: string;
  description: string;
  category: 'annual' | 'quarterly' | 'current' | 'insider' | 'beneficial' | 'registration' | 'proxy' | 'other';
  importance: 'high' | 'medium' | 'low';
  parsingStrategy: 'detailed' | 'standard' | 'simple';
  summaryPromptType: 'financial' | 'event' | 'ownership' | 'registration' | 'generic';
}

/**
 * Registry of all supported SEC form types with metadata
 */
export const FORM_REGISTRY: Record<FilingType, FormTypeMetadata> = {
  // Annual Reports
  '10-K': {
    id: '10-K',
    displayName: 'Annual Report (10-K)',
    description: 'Comprehensive report of a company\'s performance submitted annually to the SEC',
    category: 'annual',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'financial'
  },
  '10-K/A': {
    id: '10-K/A',
    displayName: 'Annual Report Amendment (10-K/A)',
    description: 'Amendment to a previously filed 10-K annual report',
    category: 'annual',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'financial'
  },
  '20-F': {
    id: '20-F',
    displayName: 'Annual Report for Foreign Issuers (20-F)',
    description: 'Annual report for foreign private issuers',
    category: 'annual',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'financial'
  },
  '40-F': {
    id: '40-F',
    displayName: 'Annual Report for Canadian Issuers (40-F)',
    description: 'Annual report for Canadian companies registered with the SEC',
    category: 'annual',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'financial'
  },
  'N-CSR': {
    id: 'N-CSR',
    displayName: 'Investment Company Annual Report (N-CSR)',
    description: 'Annual report for registered investment companies',
    category: 'annual',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'financial'
  },
  'N-CSRS': {
    id: 'N-CSRS',
    displayName: 'Investment Company Semi-Annual Report (N-CSRS)',
    description: 'Semi-annual report for registered investment companies',
    category: 'annual',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'financial'
  },

  // Quarterly Reports
  '10-Q': {
    id: '10-Q',
    displayName: 'Quarterly Report (10-Q)',
    description: 'Quarterly report of a company\'s performance',
    category: 'quarterly',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'financial'
  },
  '10-Q/A': {
    id: '10-Q/A',
    displayName: 'Quarterly Report Amendment (10-Q/A)',
    description: 'Amendment to a previously filed 10-Q quarterly report',
    category: 'quarterly',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'financial'
  },
  '6-K': {
    id: '6-K',
    displayName: 'Foreign Issuer Current Report (6-K)',
    description: 'Current report for foreign private issuers',
    category: 'quarterly',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'financial'
  },

  // Current Reports
  '8-K': {
    id: '8-K',
    displayName: 'Current Report (8-K)',
    description: 'Report of unscheduled material events or corporate changes',
    category: 'current',
    importance: 'high',
    parsingStrategy: 'standard',
    summaryPromptType: 'event'
  },

  // Insider Trading Forms
  'Form4': {
    id: 'Form4',
    displayName: 'Statement of Changes in Beneficial Ownership (Form 4)',
    description: 'Report of changes in ownership of securities by company insiders',
    category: 'insider',
    importance: 'high',
    parsingStrategy: 'simple',
    summaryPromptType: 'ownership'
  },
  '4': {
    id: '4',
    displayName: 'Statement of Changes in Beneficial Ownership (Form 4)',
    description: 'Report of changes in ownership of securities by company insiders',
    category: 'insider',
    importance: 'high',
    parsingStrategy: 'simple',
    summaryPromptType: 'ownership'
  },
  'Form3': {
    id: 'Form3',
    displayName: 'Initial Statement of Beneficial Ownership (Form 3)',
    description: 'Initial filing of ownership by company insiders',
    category: 'insider',
    importance: 'medium',
    parsingStrategy: 'simple',
    summaryPromptType: 'ownership'
  },
  '3': {
    id: '3',
    displayName: 'Initial Statement of Beneficial Ownership (Form 3)',
    description: 'Initial filing of ownership by company insiders',
    category: 'insider',
    importance: 'medium',
    parsingStrategy: 'simple',
    summaryPromptType: 'ownership'
  },
  'Form5': {
    id: 'Form5',
    displayName: 'Annual Statement of Beneficial Ownership (Form 5)',
    description: 'Annual filing of ownership changes by company insiders',
    category: 'insider',
    importance: 'medium',
    parsingStrategy: 'simple',
    summaryPromptType: 'ownership'
  },
  '5': {
    id: '5',
    displayName: 'Annual Statement of Beneficial Ownership (Form 5)',
    description: 'Annual filing of ownership changes by company insiders',
    category: 'insider',
    importance: 'medium',
    parsingStrategy: 'simple',
    summaryPromptType: 'ownership'
  },

  // Form 144
  'Form 144': {
    id: 'Form 144',
    displayName: 'Notice of Proposed Sale of Securities (Form 144)',
    description: 'Notice of proposed sale of restricted securities',
    category: 'insider',
    importance: 'high',
    parsingStrategy: 'simple',
    summaryPromptType: 'ownership'
  },
  '144': {
    id: '144',
    displayName: 'Notice of Proposed Sale of Securities (Form 144)',
    description: 'Notice of proposed sale of restricted securities',
    category: 'insider',
    importance: 'high',
    parsingStrategy: 'simple',
    summaryPromptType: 'ownership'
  },

  // Beneficial Ownership Reports
  'SC 13D': {
    id: 'SC 13D',
    displayName: 'Beneficial Ownership Report (Schedule 13D)',
    description: 'Filed when a person or group acquires more than 5% of a voting class of a company\'s equity securities',
    category: 'beneficial',
    importance: 'high',
    parsingStrategy: 'standard',
    summaryPromptType: 'ownership'
  },
  'SC13D': {
    id: 'SC13D',
    displayName: 'Beneficial Ownership Report (Schedule 13D)',
    description: 'Filed when a person or group acquires more than 5% of a voting class of a company\'s equity securities',
    category: 'beneficial',
    importance: 'high',
    parsingStrategy: 'standard',
    summaryPromptType: 'ownership'
  },
  'SC 13G': {
    id: 'SC 13G',
    displayName: 'Beneficial Ownership Report (Schedule 13G)',
    description: 'Short-form beneficial ownership report for passive investors',
    category: 'beneficial',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'ownership'
  },
  'SC13G': {
    id: 'SC13G',
    displayName: 'Beneficial Ownership Report (Schedule 13G)',
    description: 'Short-form beneficial ownership report for passive investors',
    category: 'beneficial',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'ownership'
  },
  '13F': {
    id: '13F',
    displayName: 'Institutional Investment Manager Holdings Report (13F)',
    description: 'Report of equity holdings by institutional investment managers',
    category: 'beneficial',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'ownership'
  },
  '13F-HR': {
    id: '13F-HR',
    displayName: 'Institutional Investment Manager Holdings Report (13F-HR)',
    description: 'Report of equity holdings by institutional investment managers',
    category: 'beneficial',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'ownership'
  },
  '13F-NT': {
    id: '13F-NT',
    displayName: 'Notice of Institutional Investment Manager (13F-NT)',
    description: 'Notice report filed by institutional investment managers',
    category: 'beneficial',
    importance: 'low',
    parsingStrategy: 'simple',
    summaryPromptType: 'ownership'
  },

  // Proxy Materials
  'DEFA14A': {
    id: 'DEFA14A',
    displayName: 'Definitive Additional Proxy Materials (DEFA14A)',
    description: 'Additional definitive proxy materials',
    category: 'proxy',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'event'
  },
  'DEF 14A': {
    id: 'DEF 14A',
    displayName: 'Definitive Proxy Statement (DEF 14A)',
    description: 'Definitive proxy statement for shareholder meetings',
    category: 'proxy',
    importance: 'high',
    parsingStrategy: 'standard',
    summaryPromptType: 'event'
  },
  'PRE 14A': {
    id: 'PRE 14A',
    displayName: 'Preliminary Proxy Statement (PRE 14A)',
    description: 'Preliminary proxy statement for shareholder meetings',
    category: 'proxy',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'event'
  },
  'DEF 14C': {
    id: 'DEF 14C',
    displayName: 'Definitive Information Statement (DEF 14C)',
    description: 'Definitive information statement for shareholder meetings',
    category: 'proxy',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'event'
  },
  'PRE 14C': {
    id: 'PRE 14C',
    displayName: 'Preliminary Information Statement (PRE 14C)',
    description: 'Preliminary information statement for shareholder meetings',
    category: 'proxy',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'event'
  },

  // Registration Statements
  'S-1': {
    id: 'S-1',
    displayName: 'Registration Statement (S-1)',
    description: 'Initial registration statement for new securities',
    category: 'registration',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'registration'
  },
  'S-3': {
    id: 'S-3',
    displayName: 'Simplified Registration Statement (S-3)',
    description: 'Simplified registration statement for well-known seasoned issuers',
    category: 'registration',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'registration'
  },
  'S-4': {
    id: 'S-4',
    displayName: 'Business Combination Registration Statement (S-4)',
    description: 'Registration statement for business combinations',
    category: 'registration',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'registration'
  },
  'S-8': {
    id: 'S-8',
    displayName: 'Employee Benefit Plan Registration Statement (S-8)',
    description: 'Registration statement for securities offered to employees through benefit plans',
    category: 'registration',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'registration'
  },
  'F-1': {
    id: 'F-1',
    displayName: 'Foreign Issuer Registration Statement (F-1)',
    description: 'Registration statement for foreign issuers',
    category: 'registration',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'registration'
  },
  'F-3': {
    id: 'F-3',
    displayName: 'Foreign Issuer Simplified Registration Statement (F-3)',
    description: 'Simplified registration statement for foreign issuers',
    category: 'registration',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'registration'
  },
  'F-4': {
    id: 'F-4',
    displayName: 'Foreign Issuer Business Combination Registration Statement (F-4)',
    description: 'Registration statement for business combinations involving foreign issuers',
    category: 'registration',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'registration'
  },

  // Investment Company Forms
  'N-1A': {
    id: 'N-1A',
    displayName: 'Mutual Fund Registration Statement (N-1A)',
    description: 'Registration statement for open-end management investment companies',
    category: 'other',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'financial'
  },
  'N-2': {
    id: 'N-2',
    displayName: 'Closed-End Fund Registration Statement (N-2)',
    description: 'Registration statement for closed-end management investment companies',
    category: 'other',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'financial'
  },
  'N-MFP': {
    id: 'N-MFP',
    displayName: 'Money Market Fund Portfolio Holdings (N-MFP)',
    description: 'Monthly schedule of portfolio holdings of money market funds',
    category: 'other',
    importance: 'low',
    parsingStrategy: 'simple',
    summaryPromptType: 'financial'
  },
  'N-PORT': {
    id: 'N-PORT',
    displayName: 'Investment Company Portfolio Holdings (N-PORT)',
    description: 'Monthly report of portfolio holdings of registered investment companies',
    category: 'other',
    importance: 'low',
    parsingStrategy: 'simple',
    summaryPromptType: 'financial'
  },
  'N-PX': {
    id: 'N-PX',
    displayName: 'Investment Company Proxy Voting Record (N-PX)',
    description: 'Annual report of proxy voting record of registered investment companies',
    category: 'other',
    importance: 'low',
    parsingStrategy: 'simple',
    summaryPromptType: 'event'
  },

  // Other Important Forms
  'ARS': {
    id: 'ARS',
    displayName: 'Annual Report to Shareholders (ARS)',
    description: 'Annual report to shareholders',
    category: 'other',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'financial'
  },
  'SD': {
    id: 'SD',
    displayName: 'Specialized Disclosure Report (SD)',
    description: 'Specialized disclosure report (e.g., conflict minerals)',
    category: 'other',
    importance: 'low',
    parsingStrategy: 'simple',
    summaryPromptType: 'event'
  },
  'D': {
    id: 'D',
    displayName: 'Notice of Exempt Offering of Securities (Form D)',
    description: 'Notice of an exempt offering of securities',
    category: 'other',
    importance: 'medium',
    parsingStrategy: 'simple',
    summaryPromptType: 'registration'
  },
  'POS AM': {
    id: 'POS AM',
    displayName: 'Post-Effective Amendment to Registration Statement (POS AM)',
    description: 'Post-effective amendment to a registration statement',
    category: 'registration',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'registration'
  },
  '424B2': {
    id: '424B2',
    displayName: 'Prospectus Filing (424B2)',
    description: 'Prospectus filed pursuant to Rule 424(b)(2)',
    category: 'registration',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'registration'
  },
  '424B3': {
    id: '424B3',
    displayName: 'Prospectus Filing (424B3)',
    description: 'Prospectus filed pursuant to Rule 424(b)(3)',
    category: 'registration',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'registration'
  },
  '424B5': {
    id: '424B5',
    displayName: 'Prospectus Filing (424B5)',
    description: 'Prospectus filed pursuant to Rule 424(b)(5)',
    category: 'registration',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'registration'
  },
  '497': {
    id: '497',
    displayName: 'Investment Company Filings (497)',
    description: 'Definitive materials filed under Rule 497',
    category: 'other',
    importance: 'low',
    parsingStrategy: 'simple',
    summaryPromptType: 'financial'
  },
  'FWP': {
    id: 'FWP',
    displayName: 'Free Writing Prospectus (FWP)',
    description: 'Free writing prospectus',
    category: 'registration',
    importance: 'medium',
    parsingStrategy: 'standard',
    summaryPromptType: 'registration'
  }
};

/**
 * Get form metadata by filing type
 * @param filingType The filing type to get metadata for
 * @returns The form metadata or undefined if not found
 */
export function getFormMetadata(filingType: string): FormTypeMetadata | undefined {
  // Handle case where filingType might not be a valid key
  return FORM_REGISTRY[filingType as FilingType];
}

/**
 * Get all forms in a specific category
 * @param category The category to filter by
 * @returns Array of form metadata in the specified category
 */
export function getFormsByCategory(category: FormTypeMetadata['category']): FormTypeMetadata[] {
  return Object.values(FORM_REGISTRY).filter(form => form.category === category);
}

/**
 * Get all high importance forms
 * @returns Array of high importance form metadata
 */
export function getHighImportanceForms(): FormTypeMetadata[] {
  return Object.values(FORM_REGISTRY).filter(form => form.importance === 'high');
}

/**
 * Get all forms that use a specific parsing strategy
 * @param strategy The parsing strategy to filter by
 * @returns Array of form metadata using the specified parsing strategy
 */
export function getFormsByParsingStrategy(strategy: FormTypeMetadata['parsingStrategy']): FormTypeMetadata[] {
  return Object.values(FORM_REGISTRY).filter(form => form.parsingStrategy === strategy);
}

/**
 * Get all forms that use a specific summary prompt type
 * @param promptType The summary prompt type to filter by
 * @returns Array of form metadata using the specified summary prompt type
 */
export function getFormsBySummaryPromptType(promptType: FormTypeMetadata['summaryPromptType']): FormTypeMetadata[] {
  return Object.values(FORM_REGISTRY).filter(form => form.summaryPromptType === promptType);
}
