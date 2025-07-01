/**
 * Form 4 Insider Trading Prompt Template
 * 
 * Specialized prompt for extracting key insights from Form 4 insider trading reports
 */

import { PromptTemplate } from './prompt-template';

export class FormForm4Prompt extends PromptTemplate {
  constructor(options: Record<string, any> = {}) {
    super(options);
    
    // Set the system prompt (guidance for the AI)
    this.systemPrompt = `You are an expert financial analyst specializing in SEC Form 4 insider trading reports. Your task is to extract key information about insider transactions and provide a structured analysis.

Your analysis must be objective, data-driven, and focused on the materiality of the transactions.

You must:
1. Accurately identify the company, insider, and their relationship to the company
2. Extract details about each transaction (type, date, shares, price, etc.)
3. Calculate the total value and ownership changes
4. Assess the significance of the transactions
5. Format your response as valid JSON according to the provided schema
6. Be precise and quantitative whenever possible
7. ALWAYS include the "company" field in your JSON response - this is required
8. Ensure your JSON output is complete and valid, with all required fields`;
    
    // Set the user prompt (specific instructions)
    this.userPrompt = `Analyze this SEC Form 4 filing and provide:

1. Company name (REQUIRED - must be included in the "company" field)
2. Insider identification (name, position/relationship)
3. Ownership type (direct, indirect)
4. Details of each transaction:
   - Transaction type (purchase, sale, option exercise, etc.)
   - Date
   - Number of shares
   - Price per share
   - Total value
   - Type of security
   - Whether it was an acquisition (A) or disposition (D)
5. Calculation of total transaction value
6. Percentage change in ownership (if derivable)
7. Previous and new stake information (if available)
8. A concise summary of the insider trading activity and its significance

IMPORTANT: Your JSON response MUST include the "company" field with the company name, even if you have to extract it from context. This field is required for proper processing.`;
    
    // Set the output format (JSON schema)
    this.outputFormat = `Output (JSON):
{
  "company": "Company Name", // REQUIRED - This field must be included
  "filingDate": "YYYY-MM-DD",
  "reportDate": "YYYY-MM-DD",
  "filerName": "Name of the insider",
  "relationship": "Position or relationship to the company",
  "ownershipType": "Direct or Indirect",
  "transactions": [
    {
      "type": "Purchase/Sale/Option Exercise/etc.",
      "date": "YYYY-MM-DD",
      "shares": "Number of shares",
      "pricePerShare": "$XX.XX",
      "totalValue": "$XX,XXX",
      "securityType": "Common Stock/Option/etc.",
      "acquisitionDisposition": "A or D"
    }
  ],
  "totalValue": "Total value of all transactions",
  "percentageChange": "Percentage change in ownership",
  "previousStake": "Previous ownership stake",
  "newStake": "New ownership stake",
  "summary": "Concise summary of the insider trading activity", // REQUIRED - This field must be included
  "signalStrength": "Assessment of the strength of the insider signal",
  "insiderBehaviorPattern": "Note on any pattern of insider behavior"
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