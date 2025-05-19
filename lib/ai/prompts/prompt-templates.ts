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

Guidelines:
- Focus on factual information from the document
- Prioritize material information that would impact investment decisions
- Highlight risks, changes, and new developments
- Maintain objectivity and avoid speculation
- Organize information in a structured, easy-to-understand format
- Use bullet points for clarity when appropriate
- Present financial data accurately with proper context
`;

/**
 * System prompt template for risk analysis
 */
export const RISK_ANALYSIS_SYSTEM_PROMPT: PromptTemplate = {
  template: `
${BASE_SYSTEM_PROMPT}

When analyzing risk factors:
- Categorize risks by type (operational, financial, regulatory, etc.)
- Focus on new or substantially changed risk factors
- Identify the potential impact of each risk
- Note any mitigating factors the company mentions
- {{customInstructions}}
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

Provide a detailed summary that includes:
1. Key financial results and metrics compared to the previous year
2. Significant business developments and strategic changes
3. Material risks and challenges
4. Management's outlook and forward-looking statements
5. Any notable accounting changes or one-time events

Format the response as a structured analysis with clear headings and bullet points where appropriate.
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

Provide a focused summary that includes:
1. Key quarterly financial results compared to the same quarter last year
2. Significant developments during the quarter
3. Changes in risks or outlook since the last quarterly or annual report
4. Management's commentary on quarterly performance
5. Any notable events occurring after the quarter ended but before filing

Format the response as a concise analysis that highlights quarter-specific information and changes.
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

Provide a focused summary that:
1. Identifies the specific material event(s) being reported
2. Explains the significance and potential impact of each event
3. Notes any financial implications mentioned
4. Highlights any leadership changes, acquisitions, or major business developments
5. Summarizes any exhibits or additional documents included with the filing

Focus on clarity and explaining why this event triggered an 8-K filing requirement.
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

Provide a focused summary that includes:
1. Key proposals being submitted for shareholder vote
2. Analysis of executive compensation arrangements and changes
3. Board composition, changes, and notable governance matters
4. Shareholder proposals, if any, and the board's recommendations
5. Important dates for shareholders (meeting date, record date)

Format the response as a structured analysis that shareholders would find helpful when deciding how to vote.
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

Provide a comprehensive summary that captures the key information, notable developments, and important details from this filing. Format the response in a clear, structured manner that highlights the most significant points.
{{customInstructions}}
`,
  variables: ['filingType', 'companyName', 'ticker', 'filingDate', 'content', 'customInstructions'],
  defaultValues: {
    customInstructions: ''
  }
}; 