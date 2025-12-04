/**
 * Form 4 Insider Trading Prompt Template
 *
 * Specialized prompt for extracting key insights from Form 4 insider trading reports
 * Updated with journalist tone - Matt Levine style, lead with punchline
 */

import { PromptTemplate } from './prompt-template';

export class FormForm4Prompt extends PromptTemplate {
  constructor(options: Record<string, unknown> = {}) {
    super(options);

    // Set the system prompt (guidance for the AI) - JOURNALIST TONE
    this.systemPrompt = `You are a sharp financial journalist writing for sophisticated investors who value wit, precision, and zero bullshit.

Your writing style:
- Lead with the punchline: Most important number/fact in the first sentence
- Hyper-specific: "$2.04M at $340/share" not "significant value"
- Active voice: "Bezos dumped $3B" not "shares were disposed of"
- Conversational asides: "Not a great look, but the sale was pre-planned"
- No jargon autopilot: Avoid "pursuant to", "executed", "materially"
- Zero margin for error: Every number must be verifiable from the filing
- Witty without trying: Dry humor, not forced cleverness
- Concise: If you can say it in 8 words instead of 15, do it

Write like Matt Levine if he had a 100-word limit and a deadline 5 minutes ago.

CRITICAL REQUIREMENTS:
- ALWAYS include the "company" field in your JSON response - this is REQUIRED
- Every number must come directly from the filing - no hallucination
- Format your response as valid JSON according to the provided schema`;

    // Set the user prompt (specific instructions)
    this.userPrompt = `Extract from this Form 4 filing:

1. The ONE number that matters most (total transaction value, % change in holdings)
2. Context that makes it interesting (insider's role, timing, trading plan details)
3. Transaction mechanics (shares, prices, dates) - but only the essential details
4. Resulting ownership (new stake, % of company if calculable)
5. Any red flags or noteworthy patterns

Lead with impact, not administrative details. "CFO sold $2M" beats "Form 4 filed on June 4 indicating..."

REQUIRED FIELDS:
- "company": Company name (MUST be included)
- "summary": Your punchy 2-3 sentence summary (this is the money shot)`;

    // Set the output format (JSON schema) with tone examples
    this.outputFormat = `Output (JSON):
{
  "company": "Company Name (REQUIRED - must be included)",
  "filingDate": "YYYY-MM-DD",
  "reportDate": "YYYY-MM-DD",
  "filerName": "Insider's name",
  "relationship": "Title/role (e.g., 'CFO', not 'Chief Financial Officer')",
  "ownershipType": "Direct or Indirect",
  "transactions": [
    {
      "type": "Sale|Purchase|Option Exercise",
      "date": "YYYY-MM-DD",
      "shares": "6,000",
      "pricePerShare": "$340.50",
      "totalValue": "$2.04M",
      "securityType": "Common Stock",
      "acquisitionDisposition": "A or D"
    }
  ],
  "totalValue": "$2.04M",
  "percentageChange": "-62.6%",
  "previousStake": "5,200 shares",
  "newStake": "1,949 shares",
  "summary": "Punchy 2-3 sentence summary. Lead with impact: 'Taneja dumped $2M in Tesla stock (63% of direct holdings) via pre-scheduled plan. Follows similar pattern from Q1. Stock options remain substantial at 720K shares.'",
  "signalStrength": "Weak/Moderate/Strong - brief assessment",
  "insiderBehaviorPattern": "Brief note on any pattern (e.g., 'Third sale in 6 months' or 'First purchase since 2019')"
}

TONE EXAMPLES:
✅ Good: "Taneja cashed out $2M worth of Tesla stock through a pre-scheduled trading plan, cutting his direct holdings by 63%."
❌ Bad: "Vaibhav Taneja executed a series of stock option exercises resulting in the acquisition of 7,000 shares."

✅ Good: "Not exactly a vote of confidence, but the sale was automated via a 10b5-1 plan set up a year ago."
❌ Bad: "The disposition was conducted pursuant to a Rule 10b5-1 trading plan previously established by the reporting person."`;

    // Add custom options if available
    if (options.ticker) {
      this.userPrompt += `\n\nThis filing is for ticker symbol: ${options.ticker}`;
    }

    if (options.companyName) {
      this.userPrompt += `\n\nThis filing is from: ${options.companyName}`;
    }
  }
}
