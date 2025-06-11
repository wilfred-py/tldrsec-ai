/**
 * Prompt Templates Module
 * 
 * Provides utilities for creating and managing prompt templates with variable substitution.
 */

import { PromptTemplate } from './prompt-types';

/**
 * Fill a template with variable values
 * 
 * @param template The prompt template to fill
 * @param values Values for the variables
 * @returns The filled template with variables replaced
 */
export function fillTemplate(
  template: PromptTemplate,
  values: Record<string, string>
): string {
  let filledTemplate = template.template;
  
  // Get all variables mentioned in the template
  for (const variable of template.variables) {
    // Check if a value was provided
    const value = values[variable];
    
    // If not, check for a default value
    const replacementValue = value ?? template.defaultValues?.[variable] ?? '';
    
    // Replace all occurrences of the variable
    const variablePattern = new RegExp(`{{${variable}}}`, 'g');
    filledTemplate = filledTemplate.replace(variablePattern, replacementValue);
  }
  
  return filledTemplate;
}

/**
 * Basic system prompt for SEC filing analysis
 */
export const BASE_SYSTEM_PROMPT = `
You are a specialized AI assistant for analyzing SEC filings and extracting key information. 
Your task is to analyze the provided filing text and produce a comprehensive yet concise summary.

You MUST return your response as a JSON object with the following structure:
{
  "ticker": string,           // Company ticker symbol
  "companyName": string,     // Full company name
  "filingType": string,      // Type of filing (e.g., "10-K", "10-Q", "8-K")
  "filingDate": string,      // Filing date in YYYY-MM-DD format
  "accessionNumber": string, // SEC filing accession number
  "summaryText": string,     // Main summary text
  "keyPoints": string[],     // Array of key bullet points
  "url": string,            // SEC HTML viewer URL
  "processingStatus": string // Status of the processing ("completed" or "partial")
}

Guidelines:
- Focus on factual information from the document
- Prioritize material information that would impact investment decisions
- Highlight risks, changes, and new developments
- Maintain objectivity and avoid speculation
- Organize information in a structured, easy-to-understand format
- Use bullet points for clarity when appropriate
- Present financial data accurately with proper context
- ALWAYS return your response as a valid JSON object matching the required structure
- If you cannot extract certain required fields, use placeholder values but mark processingStatus as "partial"
`;

/**
 * System prompt template for risk analysis
 */
export const RISK_ANALYSIS_SYSTEM_PROMPT: PromptTemplate = {
  template: `
${BASE_SYSTEM_PROMPT}

When analyzing risk factors:
1. Categorize risks by type (operational, financial, regulatory, etc.)
2. Focus on new or substantially changed risk factors
3. Identify the potential impact of each risk
4. Note any mitigating factors the company mentions

You MUST format your response as a JSON object with:
- summaryText: A structured analysis of risk factors by category
- keyPoints: Array of bullet points highlighting the most significant risks
- All other required fields as specified in the system prompt
{{customInstructions}}
`,
  variables: ['customInstructions'],
  defaultValues: {
    customInstructions: ''
  }
};

/**
 * Template for 10-K annual report analysis
 */
export const ANNUAL_REPORT_TEMPLATE: PromptTemplate = {
  template: `
I need a comprehensive analysis of the following 10-K annual report for {{companyName}} ({{ticker}}), filed on {{filingDate}} for the fiscal year {{fiscalYear}}.

Please analyze this content from the {{section}} section:

"""
{{content}}
"""

Analyze the following aspects:
1. Key financial results and metrics compared to the previous year
2. Significant business developments and strategic changes
3. Material risks and challenges
4. Management's outlook and forward-looking statements
5. Any notable accounting changes or one-time events

You MUST format your response as a JSON object with:
- summaryText: A well-structured analysis with clear headings
- keyPoints: Array of bullet points covering the most important findings
- All other required fields as specified in the system prompt
{{customInstructions}}
`,
  variables: ['companyName', 'ticker', 'filingDate', 'fiscalYear', 'section', 'content', 'customInstructions'],
  defaultValues: {
    customInstructions: ''
  }
};

/**
 * Template for 10-Q quarterly report analysis
 */
export const QUARTERLY_REPORT_TEMPLATE: PromptTemplate = {
  template: `
I need an analysis of the following 10-Q quarterly report for {{companyName}} ({{ticker}}), filed on {{filingDate}} for Q{{fiscalQuarter}} {{fiscalYear}}.

Please analyze this content from the {{section}} section:

"""
{{content}}
"""

Analyze the following aspects:
1. Key quarterly financial results compared to the same quarter last year
2. Significant developments during the quarter
3. Changes in risks or outlook since the last quarterly or annual report
4. Management's commentary on quarterly performance
5. Any notable events occurring after the quarter ended but before filing

You MUST format your response as a JSON object with:
- summaryText: A concise analysis highlighting quarter-specific information and changes
- keyPoints: Array of bullet points covering the most important quarterly developments
- All other required fields as specified in the system prompt
{{customInstructions}}
`,
  variables: ['companyName', 'ticker', 'filingDate', 'fiscalYear', 'fiscalQuarter', 'section', 'content', 'customInstructions'],
  defaultValues: {
    fiscalQuarter: '',
    customInstructions: ''
  }
};

/**
 * Template for 8-K current report analysis (material events)
 */
export const CURRENT_REPORT_TEMPLATE: PromptTemplate = {
  template: `
I need an analysis of the following 8-K current report for {{companyName}} ({{ticker}}), filed on {{filingDate}}.

Please analyze this content:

"""
{{content}}
"""

Analyze the following aspects:
1. Specific material event(s) being reported
2. Significance and potential impact of each event
3. Financial implications mentioned
4. Leadership changes, acquisitions, or major business developments
5. Exhibits or additional documents included with the filing

You MUST format your response as a JSON object with:
- summaryText: A clear explanation of the events and why they triggered an 8-K filing
- keyPoints: Array of bullet points covering each material event and its implications
- All other required fields as specified in the system prompt
{{customInstructions}}
`,
  variables: ['companyName', 'ticker', 'filingDate', 'content', 'customInstructions'],
  defaultValues: {
    customInstructions: ''
  }
};

/**
 * Template for proxy statement (DEF 14A) analysis
 */
export const PROXY_STATEMENT_TEMPLATE: PromptTemplate = {
  template: `
I need an analysis of the following proxy statement (DEF 14A) for {{companyName}} ({{ticker}}), filed on {{filingDate}}.

Please analyze this content from the {{section}} section:

"""
{{content}}
"""

Analyze the following aspects:
1. Key proposals being submitted for shareholder vote
2. Executive compensation arrangements and changes
3. Board composition, changes, and notable governance matters
4. Shareholder proposals and board recommendations
5. Important dates for shareholders (meeting date, record date)

You MUST format your response as a JSON object with:
- summaryText: A structured analysis helping shareholders make voting decisions
- keyPoints: Array of bullet points covering each proposal and important governance matter
- All other required fields as specified in the system prompt
{{customInstructions}}
`,
  variables: ['companyName', 'ticker', 'filingDate', 'section', 'content', 'customInstructions'],
  defaultValues: {
    section: 'Complete Document',
    customInstructions: ''
  }
};

/**
 * Generic template for any SEC filing type
 */
export const GENERIC_FILING_TEMPLATE: PromptTemplate = {
  template: `
I need an analysis of the following {{filingType}} filing for {{companyName}} ({{ticker}}), filed on {{filingDate}}.

Please analyze this content:

"""
{{content}}
"""

Provide a comprehensive analysis that captures:
1. Key information and facts
2. Notable developments or changes
3. Important details and implications
4. Significant risks or challenges
5. Any forward-looking statements

You MUST format your response as a JSON object with:
- summaryText: A clear, structured summary highlighting the most significant points
- keyPoints: Array of bullet points covering the key findings
- All other required fields as specified in the system prompt
{{customInstructions}}
`,
  variables: ['filingType', 'companyName', 'ticker', 'filingDate', 'content', 'customInstructions'],
  defaultValues: {
    customInstructions: ''
  }
}; 