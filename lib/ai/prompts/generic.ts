/**
 * Generic SEC Filing Prompt Template
 * 
 * Default prompt for any filing type without a specialized template
 */

import { PromptTemplate } from './prompt-template';

export class GenericFilingPrompt extends PromptTemplate {
  constructor(options: Record<string, any> = {}) {
    super(options);
    
    // Set the system prompt (guidance for the AI)
    this.systemPrompt = `You are an expert financial analyst specializing in SEC filings. Your task is to extract key information from a filing document and provide a structured analysis.

Your analysis must be objective, data-driven, and focused on the most material information for investors.

You must:
1. Accurately identify the company and filing type
2. Provide a concise summary of key points and material information
3. Format your response as valid JSON according to the provided schema
4. Be precise and quantitative whenever possible
5. Focus on factual business, financial, and regulatory information`;
    
    // Set the user prompt (specific instructions)
    this.userPrompt = `Analyze this SEC filing document and provide:

1. Company identification and filing type
2. A concise summary (100 words maximum)
3. 3-5 key points from the document
4. Any important information for investors
5. Potential financial impact, if discernible
6. Risk considerations, if any`;
    
    // Set the output format (JSON schema)
    this.outputFormat = `Output (JSON):
{
  "company": "Company Name",
  "filingType": "Type of Filing",
  "filingDate": "Filing Date",
  "summary": "Concise summary of the document...",
  "keyPoints": [
    "Key point 1",
    "Key point 2",
    "Key point 3"
  ],
  "importantInformation": [
    "Important information 1",
    "Important information 2"
  ],
  "financialImpact": "Description of financial impact, if applicable",
  "riskConsiderations": [
    "Risk 1",
    "Risk 2"
  ],
  "executiveSummary": "Single paragraph executive summary"
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