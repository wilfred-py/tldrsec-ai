/**
 * 10-Q Quarterly Report Prompt Template
 * 
 * Specialized prompt for extracting key insights from 10-Q quarterly reports
 */

import { PromptTemplate } from './prompt-template';

export class Form10QPrompt extends PromptTemplate {
  constructor(options: Record<string, any> = {}) {
    super(options);
    
    // Set the system prompt (guidance for the AI)
    this.systemPrompt = `You are an expert financial analyst specializing in SEC 10-Q quarterly reports. Your task is to extract key financial information, business insights, and risk factors from a 10-Q filing.

Your analysis must be objective, data-driven, and focused on quarter-over-quarter and year-over-year comparisons.

You must:
1. Accurately identify the company and quarter
2. Extract key financial metrics with appropriate comparisons
3. Identify the most significant business insights from the quarter
4. Extract critical risk factors or changes from the previous quarter
5. Note any guidance changes or outlook statements
6. Format your response as valid JSON according to the provided schema
7. Be precise and quantitative whenever possible`;
    
    // Set the user prompt (specific instructions)
    this.userPrompt = `Analyze this SEC 10-Q filing and provide:

1. Company identification and specific quarter (e.g., "Q1 2023")
2. Key financial metrics with quarter-over-quarter and year-over-year comparisons:
   - Revenue
   - Operating margin
   - Net income
   - EPS
   - Key segment performance
3. 3-5 key business insights or developments from the quarter
4. 3-5 critical risk factors that could materially impact operations
5. Any changes to guidance or outlook statements
6. Quarterly trends and observations`;
    
    // Set the output format (JSON schema)
    this.outputFormat = `Output (JSON):
{
  "company": "Company Name",
  "period": "Q# YYYY",
  "quarterEnding": "YYYY-MM-DD",
  "reportDate": "YYYY-MM-DD",
  "financials": [
    {"label": "Revenue", "value": "$X.XX billion", "growth": "+/-X.X%", "unit": "YoY"},
    {"label": "Operating Margin", "value": "X.X%", "growth": "+/-X.X%", "unit": "YoY"},
    {"label": "Net Income", "value": "$X.XX billion", "growth": "+/-X.X%", "unit": "YoY"},
    {"label": "EPS", "value": "$X.XX", "growth": "+/-X.X%", "unit": "YoY"},
    {"label": "Key Segment", "value": "$X.XX billion", "growth": "+/-X.X%", "unit": "YoY"}
  ],
  "keyHighlights": [
    "Highlight 1",
    "Highlight 2",
    "Highlight 3"
  ],
  "insights": [
    "Business insight 1",
    "Business insight 2",
    "Business insight 3"
  ],
  "risks": [
    "Risk factor 1",
    "Risk factor 2",
    "Risk factor 3"
  ],
  "quarterlyTrends": [
    "Trend 1",
    "Trend 2",
    "Trend 3"
  ],
  "guidanceChanges": "Description of any changes to previous guidance",
  "outlook": "Management's outlook for coming quarters",
  "executiveSummary": "Single paragraph executive summary of the quarterly report"
}`;
    
    // Add custom options if available
    if (options.ticker) {
      this.userPrompt += `\n\nThis filing is for ticker symbol: ${options.ticker}`;
    }
    
    if (options.companyName) {
      this.userPrompt += `\n\nThis filing is from: ${options.companyName}`;
    }
  }
} 