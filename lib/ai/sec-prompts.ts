import { FilingType } from '../sec-edgar/types';
import { FormTypeMetadata, getFormMetadata } from '../sec-edgar/form-registry';

/**
 * Base prompt template for SEC filing summarization
 */
const BASE_PROMPT = `
You are an expert financial analyst specializing in SEC filings. 
Your task is to create a concise, informative summary of the following SEC filing.
Focus on the most important information that would be relevant to investors and stakeholders.
Include key facts, figures, and any material changes or events disclosed in the filing.
Format your response in clear, readable paragraphs with bullet points for key takeaways.

IMPORTANT: These summaries will be sent via email to users of the tldrSEC service. Your summary must be:
1. Concise yet comprehensive - provide valuable insights in a compact format
2. Professional and polished - use clear, accessible financial language
3. Actionable - highlight information that would influence investment decisions
4. Formatted for easy reading in an email client
5. High-value - demonstrate the worth of the tldrSEC service through quality analysis

FILING CONTENT:
{{content}}

Please provide a summary that is informative, accurate, and easy to understand for a business audience.
`;

/**
 * 10-K Annual Report prompt template
 */
const FORM_10K_PROMPT = `
You are an expert financial analyst specializing in SEC filings analysis.
Your task is to create a detailed, structured analysis of the following 10-K annual report filing.
Focus on extracting the most critical financial information, business developments, and risk factors.

Analyze the following sections in detail:
1. Business Overview and Strategy
2. Management's Discussion and Analysis (MD&A)
3. Financial Statements (Income Statement, Balance Sheet, Cash Flow)
4. Risk Factors
5. Corporate Governance
6. Forward-Looking Statements

For each key point you identify, include direct quotes or specific references to the relevant section of the filing.
Explain the potential impact of each key finding on the company's future performance and investor considerations.

FILING CONTENT:
{{content}}

Structure your analysis as a JSON object with the following format (without quotes around the keys, with quotes around the values):
{
  summary: "A concise 2-3 sentence overview of the most important takeaways",
  financialPerformance: [
    {
      metric: "Revenue",
      value: "$X million/billion",
      yearOverYearChange: "+/-X%",
      insight: "Brief explanation of significance",
      source: "Reference to specific section/page"
    },
    // Include at least 5 key financial metrics (Revenue, Net Income, EPS, Operating Margin, Cash Position)
  ],
  businessHighlights: [
    {
      topic: "Topic name",
      detail: "Detailed explanation",
      quote: "Direct quote from filing",
      impact: "Analysis of business impact",
      source: "Reference to specific section/page"
    },
    // Include 3-5 key business highlights
  ],
  riskFactors: [
    {
      category: "Risk category",
      description: "Description of the risk",
      quote: "Direct quote from filing",
      potentialImpact: "Analysis of potential impact",
      changeFromPrior: "How this risk has evolved from previous filings",
      source: "Reference to specific section/page"
    },
    // Include 3-5 most significant risks
  ],
  managementOutlook: {
    guidanceProvided: "Yes/No",
    keyProjections: [
      "Projection 1",
      "Projection 2"
      // Include if available
    ],
    strategicPriorities: [
      "Priority 1",
      "Priority 2"
      // Include 2-4 priorities
    ],
    quote: "Direct quote from management about outlook",
    source: "Reference to specific section/page"
  },
  governanceChanges: {
    boardChanges: "Description of any board changes",
    executiveChanges: "Description of any executive changes",
    compensationHighlights: "Key compensation insights",
    source: "Reference to specific section/page"
  },
  keyTakeaway: "Single most important insight for investors"
}
`;

/**
 * 10-Q Quarterly Report prompt template
 */
const FORM_10Q_PROMPT = `
You are an expert financial analyst specializing in SEC filings analysis.
Your task is to create a detailed, structured analysis of the following 10-Q quarterly report filing.
Focus on extracting the most critical financial information, business developments, and any changes from previous quarters.

Analyze the following sections in detail:
1. Financial Performance and Key Metrics
2. Management's Discussion and Analysis (MD&A)
3. Risk Factor Updates
4. Forward-Looking Statements
5. Notable Events During the Quarter

For each key point you identify, include direct quotes or specific references to the relevant section of the filing.
Explain the potential impact of each key finding on the company's future performance and investor considerations.

FILING CONTENT:
{{content}}

Structure your analysis as a JSON object with the following format (without quotes around the keys, with quotes around the values):
{
  summary: "A concise 2-3 sentence overview of the most important takeaways",
  financialPerformance: [
    {
      metric: "Revenue",
      value: "$X million/billion",
      quarterOverQuarterChange: "+/-X%",
      yearOverYearChange: "+/-X%",
      insight: "Brief explanation of significance",
      source: "Reference to specific section/page"
    },
    // Include at least 5 key financial metrics
  ],
  businessDevelopments: [
    {
      topic: "Topic name",
      detail: "Detailed explanation",
      quote: "Direct quote from filing",
      impact: "Analysis of business impact",
      source: "Reference to specific section/page"
    },
    // Include 2-4 key business developments
  ],
  riskFactorUpdates: [
    {
      category: "Risk category",
      description: "Description of any new or updated risks",
      quote: "Direct quote from filing",
      changeFromPrior: "How this differs from previous quarter",
      source: "Reference to specific section/page"
    },
    // Include if there are any risk updates
  ],
  quarterlyEvents: [
    {
      event: "Event description",
      timing: "When it occurred",
      impact: "Financial or operational impact",
      source: "Reference to specific section/page"
    },
    // Include 2-3 notable events
  ],
  managementCommentary: {
    outlook: "Management's outlook for next quarter/year",
    challenges: "Challenges identified by management",
    opportunities: "Opportunities highlighted by management",
    quote: "Direct quote from management",
    source: "Reference to specific section/page"
  },
  keyTakeaway: "Single most important insight for investors"
}
`;

/**
 * Financial report prompt template (general for other financial reports)
 */
const FINANCIAL_REPORT_PROMPT = `
You are an expert financial analyst specializing in SEC filings.
Your task is to create a concise, informative summary of the following financial report filing.
Focus on the most important financial information and business developments.

Specifically, include:
1. Key financial metrics and how they compare to previous periods
2. Any significant changes in business operations or strategy
3. Major risk factors or uncertainties highlighted
4. Management's outlook or guidance for future periods
5. Any unusual or one-time events that impacted financial results

FILING CONTENT:
{{content}}

Please structure your response as follows:
1. A brief overview paragraph (2-3 sentences)
2. Key Financial Highlights (bullet points)
3. Business Developments (bullet points)
4. Risk Factors & Outlook (bullet points)
5. A concluding sentence with the most important takeaway

Your summary should be informative, accurate, and easy to understand for investors.
`;

/**
 * 8-K Current Report prompt template
 */
const FORM_8K_PROMPT = `
You are an expert financial analyst specializing in SEC filings analysis.
Your task is to create a detailed, structured analysis of the following 8-K current report filing.
Focus on the specific material event being reported, its context, and potential impact on the company and investors.

Pay particular attention to:
1. The specific item number(s) being reported (Item 1.01, 2.01, 5.02, etc.)
2. The exact nature of the material event
3. Financial implications and disclosed terms
4. Timing and parties involved
5. Any exhibits or additional materials filed

For each key point you identify, include direct quotes or specific references to the relevant section of the filing.
Explain the potential impact of this event on the company's operations, financial position, and stock price.

FILING CONTENT:
{{content}}

Structure your analysis as a JSON object with the following format (without quotes around the keys, with quotes around the values):
{
  headline: "A concise one-sentence summary of the event",
  filingDetails: {
    itemNumbers: ["List of item numbers reported (e.g., 1.01, 2.01)"],
    eventDate: "Date the event occurred",
    filingDate: "Date the 8-K was filed",
    timingInsight: "Analysis of timing (prompt vs delayed disclosure)"
  },
  eventAnalysis: {
    eventType: "Categorization of the event (acquisition, executive change, financial results, etc.)",
    description: "Detailed description of what happened",
    quote: "Direct quote from the filing describing the event",
    parties: ["List of key parties involved"],
    source: "Reference to specific section"
  },
  financialImpact: {
    immediateImpact: "Description of any immediate financial impact",
    longTermImplications: "Analysis of potential long-term financial implications",
    disclosedTerms: "Key financial terms disclosed",
    materialityAssessment: "Assessment of how material this event is to the company's overall financial position"
  },
  strategicContext: {
    relationToPriorAnnouncements: "How this relates to previous company announcements or strategy",
    industryContext: "How this fits within industry trends or competitive landscape",
    strategicRationale: "The strategic reasoning behind the event (if applicable)"
  },
  investorImplications: [
    {
      aspect: "Specific aspect affected (e.g., growth prospects, risk profile)",
      impact: "Analysis of the potential impact on investors",
      consideration: "What investors should consider or watch for going forward"
    },
    // Include 2-4 key implications
  ],
  additionalMaterials: {
    exhibits: ["List of any exhibits included"],
    presentationsOrCalls: "Any mentioned upcoming presentations or calls related to this event"
  },
  keyTakeaway: "Single most important insight for investors"
}
`;

/**
 * Event-based filing prompt template (general for other event filings)
 */
const EVENT_FILING_PROMPT = `
You are an expert financial analyst specializing in SEC filings.
Your task is to create a concise, informative summary of the following event-based SEC filing.
Focus on the specific event or announcement and its potential impact.

Specifically, include:
1. What exactly happened or was announced
2. When it happened or will happen
3. The parties involved
4. The potential business, financial, or strategic implications
5. Any disclosed financial impact or terms

FILING CONTENT:
{{content}}

Please structure your response as follows:
1. A clear headline summarizing the event (one sentence)
2. A brief overview paragraph with the key facts (who, what, when, where)
3. Key Details (bullet points)
4. Potential Implications (bullet points)
5. A concluding sentence with the most important takeaway

Your summary should be informative, accurate, and easy to understand for investors.
`;

/**
 * Form 4 (Insider Trading) prompt template
 */
const FORM_4_PROMPT = `
You are an expert financial analyst specializing in SEC filings analysis.
Your task is to create a detailed, structured analysis of the following Form 4 filing reporting changes in insider ownership.
Focus on extracting precise transaction details, context, and potential significance for investors.

Pay particular attention to:
1. The reporting person's identity and relationship to the company
2. The exact nature of the transaction(s) (purchase, sale, option exercise, etc.)
3. Transaction timing, price, and volume
4. The insider's resulting ownership position
5. Any patterns when compared to previous insider transactions

For each key point you identify, include direct references to the specific table or section of the filing.
Explain the potential significance of these transactions for investors monitoring insider activity.

FILING CONTENT:
{{content}}

Structure your analysis as a JSON object with the following format (without quotes around the keys, with quotes around the values):
{
  headline: "A concise one-sentence summary of the insider transaction",
  insiderDetails: {
    name: "Name of the reporting person",
    title: "Position/relationship with the company",
    isOfficer: "Yes/No",
    isDirector: "Yes/No",
    is10PercentOwner: "Yes/No"
  },
  transactionSummary: {
    transactionDate: "Date of the transaction",
    reportingDate: "Date the Form 4 was filed",
    reportingDelay: "Number of days between transaction and reporting",
    securityType: "Type of security involved (common stock, options, etc.)",
    transactionCode: "Transaction code from the filing (P, S, A, etc.)",
    transactionType: "Description of transaction type (purchase, sale, grant, etc.)"
  },
  transactionDetails: [
    {
      securityType: "Type of security",
      actionType: "Acquired/Disposed",
      quantity: "Number of shares/units",
      pricePerUnit: "Price per share/unit",
      totalValue: "Total transaction value",
      form: "Direct/Indirect ownership",
      footnotes: "Any relevant footnotes"
    },
    // Include all transactions reported
  ],
  ownershipPosition: {
    sharesOwnedBefore: "Shares owned before transaction",
    sharesOwnedAfter: "Shares owned after transaction",
    percentageChange: "Percentage change in ownership",
    totalValue: "Approximate market value of holdings"
  },
  contextAndAnalysis: {
    recentCompanyEvents: "Recent company announcements or events",
    insiderTradingPattern: "Pattern of insider transactions (if discernible)",
    marketTiming: "Relationship to stock price movements or market events",
    comparisonToOtherInsiders: "How this compares to other insider activity"
  },
  investorSignificance: {
    signalStrength: "Strong/Moderate/Weak signal",
    interpretation: "Bullish/Bearish/Neutral interpretation",
    considerationFactors: ["List of factors to consider when interpreting this transaction"],
    unusualAspects: "Any unusual or noteworthy aspects of this transaction"
  },
  keyTakeaway: "Single most important insight for investors monitoring insider activity"
}
`;

/**
 * Ownership filing prompt template (general for other ownership filings)
 */
const OWNERSHIP_FILING_PROMPT = `
You are an expert financial analyst specializing in SEC filings.
Your task is to create a concise, informative summary of the following ownership-related SEC filing.
Focus on the ownership changes, transactions, or holdings disclosed.

Specifically, include:
1. Who is reporting (person, insider, or institution)
2. Their relationship to the company (if applicable)
3. What securities or positions are involved
4. The nature and size of the transaction or holdings
5. Any notable timing or pattern of transactions

FILING CONTENT:
{{content}}

Please structure your response as follows:
1. A clear headline summarizing the ownership change (one sentence)
2. A brief overview paragraph with the key facts
3. Transaction/Holdings Details (bullet points)
4. Context and Significance (bullet points)
5. A concluding sentence with the most important takeaway

Your summary should be informative, accurate, and easy to understand for investors.
`;

/**
 * Registration filing prompt template (S-1, F-1, etc.)
 */
const REGISTRATION_FILING_PROMPT = `
You are an expert financial analyst specializing in SEC filings.
Your task is to create a concise, informative summary of the following registration-related SEC filing.
Focus on the securities being registered and the key terms of the offering.

Specifically, include:
1. What securities are being registered
2. The size and structure of the offering
3. The intended use of proceeds
4. Key risk factors highlighted
5. Any notable underwriters or terms

FILING CONTENT:
{{content}}

Please structure your response as follows:
1. A clear headline summarizing the registration (one sentence)
2. A brief overview paragraph with the key facts
3. Offering Details (bullet points)
4. Use of Proceeds & Business Strategy (bullet points)
5. Risk Factors (bullet points)
6. A concluding sentence with the most important takeaway

Your summary should be informative, accurate, and easy to understand for investors.
`;

/**
 * Generic filing prompt template (fallback)
 */
const GENERIC_FILING_PROMPT = `
You are an expert financial analyst specializing in SEC filings.
Your task is to create a concise, informative summary of the following SEC filing.
Focus on extracting and highlighting the most important information.

Specifically, include:
1. The main purpose or subject of the filing
2. Key facts, figures, or disclosures
3. Any potential impact on the company or its stakeholders
4. Important dates or deadlines mentioned

FILING CONTENT:
{{content}}

Please structure your response as follows:
1. A clear headline summarizing the filing (one sentence)
2. A brief overview paragraph with the key facts
3. Important Details (bullet points)
4. Potential Implications (bullet points)
5. A concluding sentence with the most important takeaway

Your summary should be informative, accurate, and easy to understand for investors. It should also be concise and formatted for easy reading in email clients. Provide exceptional value and insight in a concise format, making the subscriber feel they're getting insider-level analysis. Highlight information that could impact investment decisions and demonstrate the value of the tldrSEC service through high-quality analysis.
`;

/**
 * Get the appropriate prompt template for a specific filing type
 * @param filingType The type of filing
 * @param context Additional context like ticker and company name
 * @returns A function to get the full prompt with content
 */
export function getPromptForFilingType(filingType: FilingType, context: { ticker?: string; companyName?: string }) {
  // Normalize the filing type before lookup
  const normalizedFilingType = filingType.replace(/\//g, '-').toUpperCase();
  const formMetadata = getFormMetadata(normalizedFilingType);
  const ticker = context.ticker || '';
  const companyName = context.companyName || 'the company';
  
  // Create a base prompt with company and ticker info
  const basePromptWithCompanyInfo = `
    You are an expert financial analyst specializing in SEC filings analysis.
    
    Please analyze the following ${normalizedFilingType} filing from ${companyName} ${ticker ? `(${ticker})` : ''} and provide key insights.
    
    IMPORTANT: Your response MUST be valid JSON. Do not include any text before or after the JSON.
  `;
  
  return {
    getFullPrompt: (content: string) => {
      // Special case handling for specific filing types
      if (normalizedFilingType === '10-K') {
        return FORM_10K_PROMPT.replace('{{content}}', content)
          .replace('You are an expert financial analyst specializing in SEC filings analysis.', basePromptWithCompanyInfo);
      } else if (normalizedFilingType === '10-Q') {
        return FORM_10Q_PROMPT.replace('{{content}}', content)
          .replace('You are an expert financial analyst specializing in SEC filings analysis.', basePromptWithCompanyInfo);
      } else if (normalizedFilingType === '8-K') {
        return FORM_8K_PROMPT.replace('{{content}}', content)
          .replace('You are an expert financial analyst specializing in SEC filings.', basePromptWithCompanyInfo);
      } else if (normalizedFilingType === '4') {
        return FORM_4_PROMPT.replace('{{content}}', content)
          .replace('You are an expert financial analyst specializing in SEC filings.', basePromptWithCompanyInfo);
      } else if (normalizedFilingType === 'S-1') {
        return REGISTRATION_FILING_PROMPT.replace('{{content}}', content)
          .replace('You are an expert financial analyst specializing in SEC filings.', basePromptWithCompanyInfo);
      } else {
        return GENERIC_FILING_PROMPT.replace('{{content}}', content)
          .replace('You are an expert financial analyst specializing in SEC filings.', basePromptWithCompanyInfo);
      }
    }
  };
}

/**
 * Generate a system prompt for summarizing a specific filing type
 * @param filingType The type of filing
 * @param companyName The name of the company
 * @param filingDate The date of the filing
 * @returns A customized system prompt
 */
export function generateSystemPrompt(filingType: FilingType, companyName: string, filingDate: string): string {
  // Normalize the filing type before lookup
  const normalizedFilingType = filingType.replace(/\//g, '-').toUpperCase();
  const formMetadata = getFormMetadata(normalizedFilingType);
  const formName = formMetadata ? formMetadata.displayName : normalizedFilingType;
  
  return `
You are an expert financial analyst specializing in SEC filings analysis.
You are summarizing a ${formName} filing for ${companyName} filed on ${filingDate}.
Your summary should be concise, factual, and highlight the most important information for investors.
Focus on material information and avoid speculation or opinion.
Use clear, professional language and organize information logically.

IMPORTANT: Your summary will be delivered via email to tldrSEC subscribers. Create a summary that:
1. Provides exceptional value and insight in a concise format
2. Makes the subscriber feel they're getting insider-level analysis
3. Highlights information that could impact investment decisions
4. Is formatted for easy reading in email clients
5. Demonstrates the value of the tldrSEC service through high-quality analysis
`;
}

/**
 * Generate a user prompt for summarizing a specific filing type with content
 * @param filingType The type of filing
 * @param content The content to summarize
 * @param companyName Optional company name for context
 * @param ticker Optional ticker symbol for context
 * @returns A customized user prompt with content
 */
export const generateUserPrompt = (filingType: FilingType, content: string, companyName?: string, ticker?: string): string => {
  const context = { ticker, companyName };
  const promptGenerator = getPromptForFilingType(filingType, context);
  return promptGenerator.getFullPrompt(content);
};
