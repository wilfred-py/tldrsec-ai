import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key',
});

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const CLAUDE_MODEL = 'claude-3-7-sonnet-20250219';

// Maximum token limit for Claude API
const MAX_TOKENS = 100000;

type FilingSummaryResult = {
  summary: string;
  structuredData: Record<string, any>;
} | null;

export async function summarizeFilingContent(content: string, formType: string): Promise<FilingSummaryResult> {
  try {
    // Truncate content if it's too long
    const truncatedContent = content.slice(0, MAX_TOKENS);
    
    // Get the appropriate prompt for this filing type
    const prompt = getPromptForFilingType(formType, truncatedContent);
    
    // Call Claude API for summarization
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    
    // Parse the response
    const responseText = response.content[0].text;
    
    // Try to extract structured data (JSON)
    const structuredData = extractStructuredData(responseText);
    
    return {
      summary: responseText,
      structuredData,
    };
  } catch (error) {
    console.error('Error calling Claude API:', error);
    return null;
  }
}

function getPromptForFilingType(formType: string, content: string): string {
  // Adjust prompt based on filing type
  if (formType === '10-K' || formType === '10-Q') {
    return `Analyze this SEC filing document and provide:
**Object**:
    1. **Business Impact Analysis**:
        - Identify upside opportunities and risk factors impacting operating margins.
        - For each:
            - Headline (max 15 words).
            - Direct quote as evidence (with section/page reference).
            - One-sentence margin impact explanation.
        - Focus on quantifiable, company-specific impacts.

Please output in this format:

UPSIDE OPPORTUNITIES:
[Headline]
Source: [exact quote] (Section X)
Impact: [One sentence on margin effect]

RISK FACTORS:
[Headline]
Source: [exact quote] (Section X)
Impact: [One sentence on margin effect]

Additionally, provide the following structured data in JSON format:

{
  "company": "",
  "period": "QX YYYY",
  "financials": [
    {"label": "Revenue", "value": "$", "growth": "", "unit": "% YoY"},
    {"label": "Operating Margin", "value": "$", "growth": "", "unit": "% YoY"},
    {"label": "[Key Segment]", "value": "$", "growth": "", "unit": "% YoY"}
  ],
  "insights": ["", "", ""],
  "risks": ["", "", ""]
}

Here is the SEC filing to analyze:

${content}`;
  } else if (formType === '8-K') {
    return `Analyze this 8-K SEC filing and provide:
**Object**:
    1. **Material Event Analysis**:
        - Identify positive developments, potential concerns, and structural changes.
        - For each:
            - Headline (max 15 words).
            - Direct quote (with item number).
            - One-sentence business impact explanation.
        - Focus on material, quantifiable events.

Please output in this format:

POSITIVE DEVELOPMENTS:
[Headline]
Event: [exact quote] (Item X.XX)
Impact: [One sentence on business/financial effect]

POTENTIAL CONCERNS:
[Headline]
Event: [exact quote] (Item X.XX)
Impact: [One sentence on business/financial effect]

STRUCTURAL CHANGES:
[Headline]
Change: [exact quote] (Item X.XX)
Impact: [One sentence on organizational effect]

Additionally, provide the following structured data in JSON format:

{
  "company": "",
  "reportDate": "DD MMM YYYY",
  "eventType": "",
  "summary": "",
  "positiveDevelopments": "",
  "potentialConcerns": "",
  "structuralChanges": "",
  "additionalNotes": ""
}

Here is the 8-K filing to analyze:

${content}`;
  } else if (formType === '4') {
    return `Analyze this Form 4 SEC filing and provide:
**Object**:
    1. **Transaction Analysis**:
        - Summarize insider trading activity (purchases, sales, options).
        - For each:
            - Structured data with shares, price, total value, code, ownership.
        - Include net position changes and context.

Please output in this format:

TRANSACTION OVERVIEW:
Insider Name: [Name and Title]
Transaction Date: [Date]
Security Type: [Common Stock/Options/etc.]

TRANSACTION DETAILS:
Type: [Purchase/Sale/Option Exercise]
Shares: [Number]
Price: [$X.XX]
Total Value: [$XXX,XXX]
Transaction Code: [P/S/M/etc.]
Ownership: [Direct/Indirect]

POSITION SUMMARY:
Previous Holdings: [Number]
Current Holdings: [Number]
Net Change: [Number and Percentage]

CONTEXT AND PATTERNS:
[Notes on 10b5-1, patterns, timing]

Additionally, provide the following structured data in JSON format:

{
  "company": "",
  "filingDate": "DD MMM YYYY",
  "filerName": "",
  "relationship": "",
  "ownershipType": "",
  "totalValue": "$",
  "percentageChange": "%",
  "previousStake": "",
  "newStake": "",
  "summary": ""
}

Here is the Form 4 filing to analyze:

${content}`;
  } else {
    // Default prompt for other filing types
    return `Please provide a concise summary of this SEC filing document. Extract key financial data, important events, and highlight any potential risks or opportunities. Include dollar amounts, percentages, and dates where relevant.

Here is the SEC filing:

${content}`;
  }
}

function extractStructuredData(text: string): Record<string, any> {
  try {
    // Look for JSON object in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {};
  } catch (error) {
    console.error('Error extracting structured data:', error);
    return {};
  }
}
