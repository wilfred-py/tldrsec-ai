/**
 * Type definitions for SEC filing prompts
 */

import { ClaudeRequestOptions } from '../claude-client';

/**
 * Basic prompt template with variable substitution
 */
export interface PromptTemplate {
  template: string;
  variables: string[];
  defaultValues?: Record<string, string>;
}

/**
 * Basic prompt template with variable substitution
 */
export interface PromptTemplate {
  template: string;
  variables: string[];
  defaultValues?: Record<string, string>;
}

/**
 * SEC Filing Types supported by the system
 */
export type SECFilingType = 
  | '10-K'       // Annual report
  | '10-Q'       // Quarterly report
  | '8-K'        // Current report (material events)
  | 'DEF 14A'    // Proxy statement
  | '20-F'       // Annual report for foreign private issuers
  | '6-K'        // Report for foreign private issuers
  | 'S-1'        // Registration statement
  | 'S-4'        // Business combinations
  | '424B'       // Prospectus
  | '424B2'      // Prospectus filing
  | '424B3'      // Prospectus filing
  | '4'          // Statement of changes in beneficial ownership
  | '144'        // Notice of proposed sale of securities
  | 'SC 13G'     // Schedule 13G beneficial ownership report
  | 'SCHEDULE 13G' // Alternative spelling of Schedule 13G
  | 'SC 13D'     // Schedule 13D beneficial ownership report
  | 'Generic'; // Generic template for any filing type

/**
 * SEC Filing Sections that can be analyzed separately
 */
export type SECFilingSection =
  | 'Risk Factors'
  | 'Management Discussion'
  | 'Business Overview'
  | 'Financial Statements'
  | 'Quantitative and Qualitative Disclosures'
  | 'Legal Proceedings'
  | 'Controls and Procedures'
  | 'Corporate Governance'
  | 'Executive Compensation'
  | 'Material Changes'
  | 'Complete Document';

/**
 * Configuration for context window management
 */
export interface ContextWindowConfig {
  maxChunkSize: number;      // Maximum tokens per chunk
  overlapSize: number;       // Overlap between chunks in tokens
  useSemanticChunking: boolean; // Whether to use semantic boundaries
  chunkStrategy: 'fixed' | 'section-based' | 'adaptive'; // Chunking strategy
}

/**
 * Template for filing-specific prompts
 */
export interface FilingPromptTemplate {
  filingType: SECFilingType;
  description: string;
  systemPrompt: string;
  userPrompt: string;
  config: {
    maxInputTokens: number;
    maxOutputTokens: number;
    temperature: number;
    exampleIncluded: boolean;
    systemPrompt: string;
  };
  contextConfig: ContextWindowConfig;
}

/**
 * Request parameters for generating a prompt
 */
export interface PromptRequest {
  filingType: SECFilingType;
  content: string;
  companyName: string;
  ticker: string;
  filingDate: string;
  section?: SECFilingSection;
  fiscalYear?: string;
  fiscalQuarter?: string;
  accessionNumber?: string;
  promptConfig?: Partial<ClaudeRequestOptions>;
  contextConfig?: Partial<ContextWindowConfig>;
}