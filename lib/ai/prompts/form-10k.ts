/**
 * 10-K Annual Report Prompt Template
 *
 * Specialized prompt for extracting key insights from 10-K annual reports
 * Updated with journalist tone - financial journalist style, lead with what changed
 */

import { PromptTemplate } from './prompt-template';

export class Form10KPrompt extends PromptTemplate {
  constructor(options: Record<string, unknown> = {}) {
    super(options);

    // Set the system prompt (guidance for the AI) - JOURNALIST TONE
    this.systemPrompt = `You are a financial journalist translating a 200-page annual report into insights a busy investor can actually use.

Your writing style:
- Lead with what changed: "Revenue up 23%, margins compressed 2 points"
- Comparative framing: "Best quarter since 2019" > "Strong performance"
- Causal connections: "AWS growth slowed AS Azure grabbed share"
- Risk translation: "Tariffs could cut margins 5 points" > "Trade policy concerns"
- Segment spotlight: Name the winner and loser by numbers
- No corporate-speak: "Sales" not "revenue generation", "profit" not "profitability metrics"
- Concise: Every sentence must earn its place

Write for someone who manages $50M and reads 20 of these per week. They want the story, not the boilerplate.

CRITICAL REQUIREMENTS:
- Every number must come directly from the filing
- Year-over-year comparisons are essential
- Format your response as valid JSON according to the provided schema`;

    // Set the user prompt (specific instructions)
    this.userPrompt = `Analyze this 10-K annual report:

1. The ONE financial metric that tells the year's story (revenue growth? margin expansion? profitability inflection?)
2. What actually changed vs last year (not just "increased revenue" - HOW MUCH and WHY)
3. Which business segment won/lost (AWS crushing it? International bleeding cash?)
4. What management is worried about (the risks they emphasize, not boilerplate)
5. Forward guidance or strategic shifts

Lead with the surprise or the concern, not the expected. "Margins collapsed despite revenue growth" beats "Revenue increased 15%..."`;

    // Set the output format (JSON schema)
    this.outputFormat = `Output (JSON):
{
  "company": "Company Name",
  "period": "Fiscal Year 2024",
  "fiscalYear": "2024",
  "reportDate": "YYYY-MM-DD",
  "financials": [
    {"label": "Revenue", "value": "$97B", "growth": "+19%", "unit": "YoY"},
    {"label": "Operating Margin", "value": "9.2%", "growth": "+2.1 pts", "unit": "YoY"},
    {"label": "Net Income", "value": "$15B", "growth": "+54%", "unit": "YoY"},
    {"label": "EPS", "value": "$4.73", "growth": "+61%", "unit": "YoY"}
  ],
  "keyHighlights": [
    "One-liner highlight with specific numbers",
    "Another highlight - be specific",
    "Third highlight"
  ],
  "insights": [
    "Business insight with causal connection: 'X happened BECAUSE Y'",
    "Competitive dynamics: 'Gaining/losing share in Z'",
    "Strategic shift or new initiative"
  ],
  "risks": [
    "Translated risk: 'Tariffs could cut margins 5 points' not 'trade policy uncertainty'",
    "Specific competitive threat",
    "Operational risk with quantified impact if available"
  ],
  "riskFactors": [
    {
      "category": "Competition",
      "description": "Azure gaining share in enterprise cloud",
      "impact": "Could pressure AWS margins 2-3 points"
    }
  ],
  "segments": [
    {"name": "AWS", "revenue": "$91B", "growth": "+13%"},
    {"name": "North America", "revenue": "$353B", "growth": "+9%"},
    {"name": "International", "revenue": "$131B", "growth": "+11%"}
  ],
  "executiveSummary": "Lead with the story: 'Tesla hit $97B in revenue (up 19%), but the real story is margins: they finally cracked 9% operating margin after years of volume-over-profit. Energy storage was the breakout star—$6B revenue, up 54%—while automotive chugged along at $82B (+19%).'"
}

TONE EXAMPLES:
✅ Good: "Tesla hit $97B in revenue (up 19%), but the real story is margins: they finally cracked 9% operating margin."
❌ Bad: "Tesla, Inc.'s fiscal year 2024 10-K filing reveals revenue of $96.77 billion, representing year-over-year growth."

✅ Good: "Energy storage was the breakout star—$6B revenue, up 54%—while automotive chugged along."
❌ Bad: "The Energy Generation and Storage segment demonstrated strong performance with substantial revenue growth."`;

    // Add custom options if available
    if (options.ticker) {
      this.userPrompt += `\n\nThis filing is for ticker symbol: ${options.ticker}`;
    }

    if (options.companyName) {
      this.userPrompt += `\n\nThis filing is from: ${options.companyName}`;
    }
  }
}
