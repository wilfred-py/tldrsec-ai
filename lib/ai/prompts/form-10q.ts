/**
 * 10-Q Quarterly Report Prompt Template
 *
 * Specialized prompt for extracting key insights from 10-Q quarterly reports
 * Updated with journalist tone - emphasize quarterly trends and sequential changes
 */

import { PromptTemplate } from './prompt-template';

export class Form10QPrompt extends PromptTemplate {
  constructor(options: Record<string, unknown> = {}) {
    super(options);

    // Set the system prompt (guidance for the AI) - JOURNALIST TONE
    this.systemPrompt = `You are a financial journalist covering earnings season. Your readers have 30 seconds and want to know: what changed and why it matters.

Your writing style:
- Lead with the quarter's story: "Revenue beat by 5%, but margins missed by 2 points"
- Sequential trends: "Third straight quarter of margin compression"
- YoY vs QoQ: Use both—YoY for context, QoQ for momentum
- Seasonality awareness: "Q4 is always strong for retail, so +15% YoY is actually weak"
- Guidance updates: Did they raise, lower, or hold? That's often the real story
- Segment surprises: Which business outperformed/underperformed expectations?
- No corporate-speak: "Sales fell" not "revenue experienced headwinds"
- Concise: Every sentence must earn its place

Write for someone who's tracking 50 stocks and needs the highlights in under a minute.

CRITICAL REQUIREMENTS:
- Every number must come directly from the filing
- Both YoY and sequential comparisons when available
- Format your response as valid JSON according to the provided schema`;

    // Set the user prompt (specific instructions)
    this.userPrompt = `Analyze this 10-Q quarterly report:

1. The quarter's headline number: What beat or missed? By how much?
2. Sequential trends: How does Q2 compare to Q1? Is momentum building or fading?
3. YoY comparison: The full-year context (but don't let it hide quarterly weakness)
4. Segment performance: Which business unit drove results? Which dragged?
5. Guidance changes: Any revisions to full-year outlook? This is often the market-moving detail
6. Risks that changed: New concerns or resolved issues from last quarter

Lead with what's different from last quarter. "Margins compressed for third straight quarter" beats "Company reported Q2 results..."`;

    // Set the output format (JSON schema)
    this.outputFormat = `Output (JSON):
{
  "company": "Company Name",
  "period": "Q2 2024",
  "quarterEnding": "2024-06-30",
  "reportDate": "YYYY-MM-DD",
  "financials": [
    {"label": "Revenue", "value": "$25.2B", "growth": "+12%", "unit": "YoY"},
    {"label": "Operating Margin", "value": "7.8%", "growth": "-1.2 pts", "unit": "QoQ"},
    {"label": "Net Income", "value": "$3.1B", "growth": "+8%", "unit": "YoY"},
    {"label": "EPS", "value": "$1.15", "growth": "+10%", "unit": "YoY"}
  ],
  "keyHighlights": [
    "Revenue beat consensus by 3% on strong cloud demand",
    "Margins compressed 120bps QoQ—inventory write-downs hurt",
    "Raised full-year guidance by $500M"
  ],
  "insights": [
    "Sequential trend with context: 'Third quarter of accelerating cloud growth'",
    "Competitive insight: 'Taking share from X in Y market'",
    "Operational change: 'Cost cuts starting to show in SG&A'"
  ],
  "risks": [
    "New or changed risk: 'Inventory levels still elevated—4.2 months vs 3.5 target'",
    "Macro concern: 'Enterprise deals taking 20% longer to close'",
    "Competitive threat: 'Pricing pressure in core market'"
  ],
  "quarterlyTrends": [
    "Q1→Q2 change with significance: 'Margins down 120bps—third straight quarter of compression'",
    "Volume/price mix: 'Volume up 15% but ASPs down 8%'",
    "Sequential momentum: 'Growth accelerating/decelerating vs prior quarter'"
  ],
  "guidanceChanges": "Raised/lowered/maintained with specifics: 'Raised FY revenue guide by $500M to $102B, but held margin outlook'",
  "outlook": "Management's forward view: 'Expecting seasonal strength in Q4, but flagged inventory risks'",
  "executiveSummary": "Lead with the quarter's story: 'Q2 revenue beat by 3% ($25.2B vs $24.5B expected), but margins disappointed—down 120bps QoQ to 7.8% on inventory write-downs. The silver lining: raised FY guidance by $500M, signaling confidence despite near-term margin pressure.'"
}

TONE EXAMPLES:
✅ Good: "Q2 revenue beat by 3%, but margins disappointed—down 120bps QoQ on inventory write-downs."
❌ Bad: "The company reported quarterly results that exceeded revenue expectations while experiencing margin compression."

✅ Good: "Third straight quarter of margin compression—costs rising faster than pricing power."
❌ Bad: "Operating margins continued to face pressure due to various cost-related factors."`;

    // Add custom options if available
    if (options.ticker) {
      this.userPrompt += `\n\nThis filing is for ticker symbol: ${options.ticker}`;
    }

    if (options.companyName) {
      this.userPrompt += `\n\nThis filing is from: ${options.companyName}`;
    }
  }
}
