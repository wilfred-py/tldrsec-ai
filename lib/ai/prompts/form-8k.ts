/**
 * 8-K Current Report Prompt Template
 *
 * Specialized prompt for extracting key insights from 8-K current reports
 * Updated with journalist tone - breaking news style, lead with what happened
 */

import { PromptTemplate } from './prompt-template';

export class Form8KPrompt extends PromptTemplate {
  constructor(options: Record<string, unknown> = {}) {
    super(options);

    // Set the system prompt (guidance for the AI) - JOURNALIST TONE
    this.systemPrompt = `You're breaking news for investors. 8-K filings are material events that move stock prices.

Your style:
- Lead with what happened: "CEO fired" not "Leadership transition announced"
- Explain why it matters: Impact on revenue, strategy, or operations
- Context: Is this expected? Surprising? Concerning?
- Timelines: When did it happen vs when it was disclosed (delays are sus)
- No euphemisms: "Lawsuit" not "litigation matter", "Fired" not "separated"
- Quantify impact: "$50M charge" not "material impact"
- Be direct: Cut the corporate-speak and get to the point

Write the headline first, details second. Your reader is deciding whether to trade on this news.

CRITICAL REQUIREMENTS:
- Every fact must come directly from the filing
- Identify the specific 8-K item number(s) that triggered this filing
- Format your response as valid JSON according to the provided schema`;

    // Set the user prompt (specific instructions)
    this.userPrompt = `Analyze this 8-K current report:

1. What happened? One sentence, no corporate fluff
2. Why does it matter? Stock impact, strategic implications
3. When? Event date vs filing date (note any delays)
4. Who's involved? Key people, counterparties, regulators
5. How much? Dollar amounts, percentages, shares
6. What's next? Follow-up actions, deadlines, contingencies

The 8-K item number tells you the category—use it to focus your analysis:
- Item 1.01: Material contract
- Item 2.01: Acquisition/disposition
- Item 2.02: Results of operations (earnings)
- Item 5.02: Officer changes
- Item 7.01: Regulation FD disclosure
- Item 8.01: Other events`;

    // Set the output format (JSON schema)
    this.outputFormat = `Output (JSON):
{
  "company": "Company Name",
  "filingDate": "YYYY-MM-DD",
  "eventDate": "YYYY-MM-DD",
  "itemNumbers": ["5.02", "9.01"],
  "eventType": "CEO Departure|Acquisition|Earnings|Contract|Lawsuit|Other",
  "headline": "One-line summary: 'Tesla CFO Taneja resigns effective immediately'",
  "keyFacts": [
    "Specific fact with numbers: 'Departure effective Dec 31, 2024'",
    "Another fact: 'No severance disclosed'",
    "Context: 'Third C-suite departure in 6 months'"
  ],
  "financialImpact": {
    "immediate": "$X charge in Q4" or "None disclosed",
    "ongoing": "Impact on operations/strategy",
    "quantified": true/false
  },
  "keyPeople": [
    {"name": "John Smith", "role": "Departing CEO", "action": "Resigned"}
  ],
  "timeline": {
    "eventDate": "When it happened",
    "disclosureDate": "When filed",
    "effectiveDate": "When it takes effect",
    "delay": "X days between event and disclosure"
  },
  "relatedFilings": ["Reference to other filings if mentioned"],
  "executiveSummary": "The money paragraph: 'Tesla's CFO is out, effective immediately—no severance, no transition period. Third finance chief to leave in 18 months. The filing is light on details, which usually means the full story hasn't been told yet.'"
}

TONE EXAMPLES:
✅ Good: "Tesla's CFO is out, effective immediately—no severance, no transition period."
❌ Bad: "The company announced a leadership transition in the Chief Financial Officer position."

✅ Good: "Third finance chief to leave in 18 months. The filing is light on details."
❌ Bad: "This represents a change in senior management following previous executive departures."

✅ Good: "$150M acquisition of AI startup—2x revenue multiple, closes in 30 days."
❌ Bad: "The company has entered into a definitive agreement to acquire a technology company."`;

    // Add custom options if available
    if (options.ticker) {
      this.userPrompt += `\n\nThis filing is for ticker symbol: ${options.ticker}`;
    }

    if (options.companyName) {
      this.userPrompt += `\n\nThis filing is from: ${options.companyName}`;
    }
  }
}
