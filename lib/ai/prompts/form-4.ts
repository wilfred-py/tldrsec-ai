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
6. Be precise and quantitative whenever possible`;
    
    // Set the user prompt (specific instructions)
    this.userPrompt = `Analyze this SEC Form 4 filing and provide:

1. Company and insider identification (name, position/relationship)
2. Ownership type (direct, indirect)
3. Details of each transaction:
   - Transaction type (purchase, sale, option exercise, etc.)
   - Date
   - Number of shares
   - Price per share
   - Total value
   - Type of security
   - Whether it was an acquisition (A) or disposition (D)
4. Calculation of total transaction value
5. Percentage change in ownership (if derivable)
6. Previous and new stake information (if available)
7. A concise summary of the insider trading activity and its significance`;
    
    // Set the output format (JSON schema)
    this.outputFormat = `Output (JSON):
{
  "company": "Company Name",
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
  "summary": "Concise summary of the insider trading activity",
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