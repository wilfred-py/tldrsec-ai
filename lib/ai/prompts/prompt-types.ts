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

/**
 * Type definitions for SEC filing prompts
 */

/**
 * SEC filing types supported by the system
 */
export type SECFilingType = '10-K' | '10-Q' | '8-K' | 'Form4' | 'generic';

/**
 * Schema structure for 10-K (Annual Report) filings
 */
export interface Form10KSchema {
  company: string;
  period: string;
  fiscalYear?: string;
  reportDate?: string;
  financials: {
    label: string;
    value: string;
    growth?: string;
    unit?: string;
  }[];
  keyHighlights: string[];
  insights: string[];
  risks: string[];
  riskFactors?: {
    category: string;
    description: string;
    impact: string;
  }[];
  segments?: {
    name: string;
    revenue: string;
    growth?: string;
  }[];
  executiveSummary?: string;
}

/**
 * Schema structure for 10-Q (Quarterly Report) filings
 */
export interface Form10QSchema {
  company: string;
  period: string;
  quarterEnding?: string;
  reportDate?: string;
  financials: {
    label: string;
    value: string;
    growth?: string;
    unit?: string;
  }[];
  keyHighlights: string[];
  insights: string[];
  risks: string[];
  quarterlyTrends?: string[];
  guidanceChanges?: string;
  outlook?: string;
  executiveSummary?: string;
}

/**
 * Schema structure for 8-K (Current Report) filings
 */
export interface Form8KSchema {
  company: string;
  reportDate: string;
  eventDate?: string;
  eventType: string;
  summary: string;
  positiveDevelopments: string | string[];
  potentialConcerns: string | string[];
  structuralChanges: string | string[];
  items?: {
    item: string;
    title: string;
    content: string;
  }[];
  materialityAssessment?: string;
  additionalNotes?: string;
  executiveSummary?: string;
}

/**
 * Schema structure for Form 4 (Insider Trading) filings
 */
export interface FormForm4Schema {
  company: string;
  filingDate: string;
  reportDate?: string;
  filerName: string;
  relationship: string;
  ownershipType: string;
  transactions: {
    type: string;
    date: string;
    shares: string;
    pricePerShare: string;
    totalValue: string;
    securityType: string;
    acquisitionDisposition: string;
  }[];
  totalValue: string;
  percentageChange?: string;
  previousStake?: string;
  newStake?: string;
  summary: string;
  signalStrength?: string;
  insiderBehaviorPattern?: string;
}

/**
 * Schema structure for generic filings
 */
export interface GenericFilingSchema {
  company: string;
  filingType: string;
  filingDate: string;
  summary: string;
  keyPoints: string[];
  importantInformation: string[];
  financialImpact?: string;
  riskConsiderations?: string[];
  executiveSummary?: string;
} 