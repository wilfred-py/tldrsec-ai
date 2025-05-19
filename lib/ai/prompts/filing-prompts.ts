/**
 * SEC Filing Prompts
 * 
 * This module provides specialized prompts for different SEC filing types,
 * optimized for Claude AI to extract relevant information.
 */

import { 
  ClaudeMessage,
  ClaudeRequestOptions
} from '../claude-client';
import { 
  ContextWindowConfig,
  FilingPromptTemplate, 
  PromptRequest, 
  SECFilingSection, 
  SECFilingType 
} from './prompt-types';
import { 
  ANNUAL_REPORT_TEMPLATE, 
  BASE_SYSTEM_PROMPT, 
  CURRENT_REPORT_TEMPLATE, 
  GENERIC_FILING_TEMPLATE, 
  PROXY_STATEMENT_TEMPLATE, 
  QUARTERLY_REPORT_TEMPLATE, 
  RISK_ANALYSIS_SYSTEM_PROMPT, 
  fillTemplate 
} from './prompt-templates';
import { getContextConfig, needsChunking, splitDocumentIntoChunks } from './context-manager';

// Mapping of filing types to their specialized templates
const FILING_TEMPLATES: Record<SECFilingType, FilingPromptTemplate> = {
  '10-K': {
    filingType: '10-K',
    description: 'Annual report',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: ANNUAL_REPORT_TEMPLATE,
    config: {
      maxInputTokens: 12000,
      maxOutputTokens: 4000,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('10-K')
  },
  '10-Q': {
    filingType: '10-Q',
    description: 'Quarterly report',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: QUARTERLY_REPORT_TEMPLATE,
    config: {
      maxInputTokens: 8000,
      maxOutputTokens: 3000,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('10-Q')
  },
  '8-K': {
    filingType: '8-K',
    description: 'Current report (material events)',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: CURRENT_REPORT_TEMPLATE,
    config: {
      maxInputTokens: 4000,
      maxOutputTokens: 2000,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('8-K')
  },
  'DEF 14A': {
    filingType: 'DEF 14A',
    description: 'Proxy statement',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: PROXY_STATEMENT_TEMPLATE,
    config: {
      maxInputTokens: 8000,
      maxOutputTokens: 3000,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('DEF 14A')
  },
  // Generic template for all other filing types
  'Generic': {
    filingType: 'Generic',
    description: 'Generic template for any filing type',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: GENERIC_FILING_TEMPLATE,
    config: {
      maxInputTokens: 6000,
      maxOutputTokens: 2500,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('Generic')
  },
  // Add other filing types with simplified configurations
  '20-F': {
    filingType: '20-F',
    description: 'Annual report for foreign private issuers',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: ANNUAL_REPORT_TEMPLATE, // Reuse annual report template
    config: {
      maxInputTokens: 12000,
      maxOutputTokens: 4000,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('20-F')
  },
  '6-K': {
    filingType: '6-K',
    description: 'Report for foreign private issuers',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: QUARTERLY_REPORT_TEMPLATE, // Similar structure to 10-Q
    config: {
      maxInputTokens: 8000,
      maxOutputTokens: 3000,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('6-K')
  },
  'S-1': {
    filingType: 'S-1',
    description: 'Registration statement',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: GENERIC_FILING_TEMPLATE,
    config: {
      maxInputTokens: 10000,
      maxOutputTokens: 4000,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('S-1')
  },
  'S-4': {
    filingType: 'S-4',
    description: 'Registration for business combinations',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: GENERIC_FILING_TEMPLATE,
    config: {
      maxInputTokens: 10000,
      maxOutputTokens: 4000,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('S-4')
  },
  '424B': {
    filingType: '424B',
    description: 'Prospectus',
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt: GENERIC_FILING_TEMPLATE,
    config: {
      maxInputTokens: 8000,
      maxOutputTokens: 3000,
      temperature: 0.2,
      exampleIncluded: false,
      systemPrompt: BASE_SYSTEM_PROMPT
    },
    contextConfig: getContextConfig('424B')
  }
};

// Section-specific system prompts
const SECTION_SYSTEM_PROMPTS: Partial<Record<SECFilingSection, string>> = {
  'Risk Factors': RISK_ANALYSIS_SYSTEM_PROMPT.template,
  // Add other section-specific system prompts as needed
};

/**
 * Get the appropriate template for a specific filing type
 */
export function getFilingTemplate(filingType: SECFilingType): FilingPromptTemplate {
  return FILING_TEMPLATES[filingType] || FILING_TEMPLATES.Generic;
}

/**
 * Create Claude API request options based on filing parameters
 */
export function createRequestOptions(
  promptConfig: Partial<PromptRequest['promptConfig']> = {}
): ClaudeRequestOptions {
  return {
    maxTokens: promptConfig.maxOutputTokens || 3000,
    temperature: promptConfig.temperature || 0.2,
    system: promptConfig.systemPrompt || BASE_SYSTEM_PROMPT,
  };
}

/**
 * Generate a prompt for a SEC filing
 * 
 * @param request The prompt request with filing details
 * @returns The Claude messages and request options
 */
export function generateFilingPrompt(
  request: PromptRequest
): { messages: ClaudeMessage[], options: ClaudeRequestOptions } {
  const { 
    filingType, 
    section, 
    content, 
    companyName, 
    filingDate, 
    ticker,
    fiscalYear,
    fiscalQuarter,
    promptConfig,
    contextConfig
  } = request;
  
  // Get the template for this filing type
  const template = getFilingTemplate(filingType);
  
  // Apply any custom system prompt for this section
  let systemPrompt = template.config.systemPrompt;
  if (section && SECTION_SYSTEM_PROMPTS[section]) {
    systemPrompt = SECTION_SYSTEM_PROMPTS[section] || systemPrompt;
  }
  
  // Apply any user-provided configuration
  const finalConfig = {
    ...template.config,
    ...promptConfig,
    systemPrompt
  };
  
  // Prepare values for the template
  const values: Record<string, string> = {
    filingType,
    companyName,
    ticker,
    filingDate,
    content,
    customInstructions: '',
  };
  
  // Add optional fields if provided
  if (section) values.section = section;
  if (fiscalYear) values.fiscalYear = fiscalYear;
  if (fiscalQuarter) values.fiscalQuarter = fiscalQuarter;
  
  // Fill the template with values
  const promptText = fillTemplate(template.userPrompt, values);
  
  // Create Claude API request options
  const options = createRequestOptions(finalConfig);
  
  // Create messages array for Claude
  const messages: ClaudeMessage[] = [
    {
      role: 'user',
      content: promptText
    }
  ];
  
  return { messages, options };
}

/**
 * Generate prompts for a document that needs to be split into chunks
 * 
 * @param request The prompt request with filing details
 * @returns Array of prompt requests, one for each chunk
 */
export function generateChunkedPrompts(
  request: PromptRequest
): Array<{ chunkIndex: number, totalChunks: number, messages: ClaudeMessage[], options: ClaudeRequestOptions }> {
  const { content, filingType, section } = request;
  
  // Get context configuration with complete required properties
  const baseConfig = request.contextConfig || getContextConfig(filingType, section);
  const contextConfig: ContextWindowConfig = {
    maxChunkSize: baseConfig.maxChunkSize || 6000,
    overlapSize: baseConfig.overlapSize || 600,
    useSemanticChunking: baseConfig.useSemanticChunking || false,
    chunkStrategy: baseConfig.chunkStrategy || 'fixed'
  };
  
  // Check if we need chunking
  if (!needsChunking(content, filingType, section)) {
    const { messages, options } = generateFilingPrompt(request);
    return [{ chunkIndex: 0, totalChunks: 1, messages, options }];
  }
  
  // Split the document into chunks
  const chunks = splitDocumentIntoChunks(content, contextConfig);
  
  // Generate a prompt for each chunk
  return chunks.map((chunkContent, index) => {
    // Create a modified request for this chunk with proper type
    const chunkRequest: PromptRequest = {
      ...request,
      content: chunkContent
    };
    
    // Add chunk context as a custom instruction
    const chunkNote = `Note: This is part ${index + 1} of ${chunks.length} of the document.`;
    const values: Record<string, string> = {
      filingType: chunkRequest.filingType,
      companyName: chunkRequest.companyName,
      ticker: chunkRequest.ticker,
      filingDate: chunkRequest.filingDate,
      content: chunkContent,
      customInstructions: chunkNote
    };
    
    // Add optional fields if provided
    if (chunkRequest.section) values.section = chunkRequest.section;
    if (chunkRequest.fiscalYear) values.fiscalYear = chunkRequest.fiscalYear;
    if (chunkRequest.fiscalQuarter) values.fiscalQuarter = chunkRequest.fiscalQuarter;
    
    // Get the template and fill it manually
    const template = getFilingTemplate(chunkRequest.filingType);
    const promptText = fillTemplate(template.userPrompt, values);
    
    // Create Claude API request options
    const options = createRequestOptions(chunkRequest.promptConfig);
    
    // Create messages array for Claude
    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: promptText
      }
    ];
    
    return {
      chunkIndex: index,
      totalChunks: chunks.length,
      messages,
      options
    };
  });
} 