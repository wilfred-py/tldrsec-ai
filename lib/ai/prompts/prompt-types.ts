/**
 * Type definitions for the prompt engineering module
 */

/**
 * SEC filing types that we support with specialized prompts
 */
export type SECFilingType = 
  | '10-K'  // Annual report
  | '10-Q'  // Quarterly report
  | '8-K'   // Current report (material events)
  | '20-F'  // Annual report for foreign private issuers
  | '6-K'   // Report for foreign private issuers
  | 'S-1'   // Registration statement
  | 'S-4'   // Registration for business combinations
  | '424B'  // Prospectus
  | 'DEF 14A' // Proxy statement
  | 'Generic'; // Generic prompt for any other filing type

/**
 * SEC filing sections that can be analyzed separately
 */
export type SECFilingSection =
  | 'Risk Factors'
  | 'Management Discussion'
  | 'Business Overview'
  | 'Financial Statements'
  | 'Legal Proceedings'
  | 'Controls and Procedures'
  | 'Corporate Governance'
  | 'Executive Compensation'
  | 'Material Changes'
  | 'Complete Document'; // For processing the entire document

/**
 * Prompt template with variables that can be replaced
 */
export interface PromptTemplate {
  template: string;
  variables: string[];
  defaultValues?: Record<string, string>;
}

/**
 * Configuration for prompt complexity and token usage
 */
export interface PromptConfig {
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
  exampleIncluded: boolean;
  systemPrompt: string;
}

/**
 * Context window management configuration
 */
export interface ContextWindowConfig {
  maxChunkSize: number;
  overlapSize: number;
  useSemanticChunking: boolean;
  chunkStrategy: 'fixed' | 'adaptive' | 'section-based';
}

/**
 * Complete prompt request with all needed parameters
 */
export interface PromptRequest {
  filingType: SECFilingType;
  section?: SECFilingSection;
  content: string;
  companyName: string;
  filingDate: string;
  ticker: string;
  fiscalYear?: string;
  fiscalQuarter?: string;
  customInstructions?: string;
  promptConfig?: Partial<PromptConfig>;
  contextConfig?: Partial<ContextWindowConfig>;
}

/**
 * The format for specialized SEC filing prompt templates
 */
export interface FilingPromptTemplate {
  filingType: SECFilingType;
  description: string;
  systemPrompt: string;
  userPrompt: PromptTemplate;
  config: PromptConfig;
  contextConfig: ContextWindowConfig;
} 