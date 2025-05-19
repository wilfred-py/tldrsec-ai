/**
 * 10-K Annual Report Prompt Template
 * 
 * Specialized prompt for extracting key insights from 10-K annual reports
 */

import { PromptTemplate } from './prompt-template';

export class Form10KPrompt extends PromptTemplate {
  constructor(options: Record<string, any> = {}) {
    super(options);
    
    // Set the system prompt (guidance for the AI)
    this.systemPrompt = `You are an expert financial analyst specializing in SEC 10-K annual reports. Your task is to extract key financial information, business insights, and risk factors from a 10-K filing.

Your analysis must be objective, data-driven, and focused on year-over-year comparisons and material information for investors.

You must:
1. Accurately identify the company and fiscal period
2. Extract key financial metrics with year-over-year comparisons
3. Identify the most significant business insights and strategic developments
4. Extract critical risk factors that could impact operations
5. Format your response as valid JSON according to the provided schema
6. Be precise and quantitative whenever possible`;
    
    // Set the user prompt (specific instructions)
    this.userPrompt = `Analyze this SEC 10-K filing and provide:

1. Company identification and fiscal period/year
2. Key financial metrics with year-over-year comparisons:
   - Revenue
   - Operating margin
   - Net income
   - EPS
   - Key segment performance
3. 3-5 key business insights or developments from the Management Discussion
4. 3-5 critical risk factors that could materially impact operations
5. Business segment breakdown (if available)`;
    
    // Set the output format (JSON schema)
    this.outputFormat = `Output (JSON):
{
  "company": "Company Name",
  "period": "Fiscal Year YYYY",
  "fiscalYear": "YYYY",
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
  "riskFactors": [
    {
      "category": "Category name",
      "description": "Risk description",
      "impact": "Potential business impact"
    }
  ],
  "segments": [
    {"name": "Segment 1", "revenue": "$X.XX billion", "growth": "+/-X.X%"},
    {"name": "Segment 2", "revenue": "$X.XX billion", "growth": "+/-X.X%"}
  ],
  "executiveSummary": "Single paragraph executive summary of the annual report"
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