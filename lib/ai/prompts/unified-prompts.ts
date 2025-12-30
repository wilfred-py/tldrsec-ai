/**
 * Unified Prompt System for SEC Filing Summarization
 *
 * Design Principles:
 * 1. JSON schema BEFORE content - AI sees structure requirements first
 * 2. Explicit field names (no synonyms) - Prevent field name variations
 * 3. Length constraints on all text - Ensure predictable output size
 * 4. No markdown wrapping allowed - Raw JSON only
 * 5. Form-specific required fields - Tailored for each SEC form type
 *
 * This replaces the legacy dual-prompt system with a single, bulletproof
 * architecture that guarantees clean JSON output from AI models.
 *
 * @module unified-prompts
 */

/**
 * Configuration for generating a filing prompt
 */
export interface FilingPromptConfig {
  /** SEC form type (e.g., '10-K', '8-K', '4') */
  formType: string;
  /** Company name */
  company?: string;
  /** Stock ticker symbol */
  ticker?: string;
  /** Filing date in YYYY-MM-DD format */
  filingDate?: string;
  /** The actual filing content to summarize */
  filingContent?: string;
}

/**
 * Output from prompt generation
 */
export interface PromptOutput {
  /** System prompt with strict JSON requirements */
  systemPrompt: string;
  /** User prompt with schema and content */
  userPrompt: string;
  /** The JSON schema for this form type */
  schema: JSONSchema;
}

/**
 * JSON Schema definition for filing summaries
 */
export interface JSONSchema {
  type: 'object';
  required: string[];
  properties: Record<string, SchemaProperty>;
}

/**
 * Individual property in a JSON Schema
 */
export interface SchemaProperty {
  type: string;
  description: string;
  maxLength?: number;
  maxItems?: number;
  enum?: string[];
  items?: SchemaProperty | { type: string; properties?: Record<string, SchemaProperty> };
  properties?: Record<string, SchemaProperty>;
}

// =============================================================================
// Base Schema - Shared by all filing types
// =============================================================================

const BASE_SCHEMA_PROPERTIES: Record<string, SchemaProperty> = {
  company: {
    type: 'string',
    description: 'Company name exactly as it appears in the filing header (max 100 chars)',
    maxLength: 100
  },
  summary: {
    type: 'string',
    description: 'Complete executive summary. MUST mention the company ticker symbol (e.g., "NVDA reported..."). 2-3 sentences, must end with period. Include key numbers/amounts.',
    maxLength: 500
  },
  filingDate: {
    type: 'string',
    description: 'Filing date in YYYY-MM-DD format'
  }
};

// =============================================================================
// Form-Specific Schemas
// =============================================================================

/**
 * All form type schemas with their required fields and properties
 */
export const FORM_SCHEMAS: Record<string, JSONSchema> = {
  '10-K': {
    type: 'object',
    required: ['company', 'summary', 'fiscalYear', 'keyHighlights'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      fiscalYear: {
        type: 'string',
        description: 'Fiscal year (e.g., "2024")'
      },
      keyHighlights: {
        type: 'array',
        description: 'Top 3-5 key points with specific numbers (max 5 items)',
        maxItems: 5,
        items: { type: 'string', description: 'Single key point', maxLength: 200 }
      },
      risks: {
        type: 'array',
        description: 'Top 3 material risks with quantified impact (max 3 items)',
        maxItems: 3,
        items: { type: 'string', description: 'Single risk factor', maxLength: 200 }
      },
      revenue: {
        type: 'string',
        description: 'Total revenue with currency symbol (e.g., "$45.2B")',
        maxLength: 50
      },
      netIncome: {
        type: 'string',
        description: 'Net income with currency symbol (e.g., "$2.1B")',
        maxLength: 50
      }
    }
  },

  '10-Q': {
    type: 'object',
    required: ['company', 'summary', 'fiscalQuarter', 'keyHighlights'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      fiscalQuarter: {
        type: 'string',
        description: 'Fiscal quarter (e.g., "Q3 2024")'
      },
      keyHighlights: {
        type: 'array',
        description: 'Top 3-5 key points with specific numbers (max 5 items)',
        maxItems: 5,
        items: { type: 'string', description: 'Single key point', maxLength: 200 }
      },
      revenue: {
        type: 'string',
        description: 'Quarterly revenue with currency symbol',
        maxLength: 50
      },
      quarterOverQuarterChange: {
        type: 'string',
        description: 'Quarter-over-quarter change percentage (e.g., "+5.2%")',
        maxLength: 20
      }
    }
  },

  '8-K': {
    type: 'object',
    required: ['company', 'summary', 'eventType', 'keyHighlights', 'sentiment'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      eventType: {
        type: 'string',
        description: 'Primary event type (e.g., "Earnings Results", "Leadership Change", "Acquisition")',
        maxLength: 50
      },
      reportDate: {
        type: 'string',
        description: 'Report date in YYYY-MM-DD format'
      },
      sentiment: {
        type: 'string',
        enum: ['positive', 'negative', 'neutral', 'mixed'],
        description: 'Overall market sentiment signal based on the news (positive=good for shareholders, negative=concerning, neutral=informational, mixed=both good and bad elements)'
      },
      itemNumbers: {
        type: 'array',
        description: 'SEC item numbers reported (e.g., ["2.02", "9.01"])',
        items: { type: 'string', description: 'Item number', maxLength: 10 }
      },
      keyHighlights: {
        type: 'array',
        description: 'Top 3-5 material facts with specific numbers. Lead with the most important.',
        maxItems: 5,
        items: { type: 'string', description: 'Single key fact with number', maxLength: 150 }
      },
      financialImpact: {
        type: 'string',
        description: 'Specific financial impact with dollar amounts and percentages (e.g., "Revenue of $12.5B, up 15% YoY")',
        maxLength: 250
      },
      managementCommentary: {
        type: 'string',
        description: 'Key quote or statement from management if available',
        maxLength: 200
      },
      forwardGuidance: {
        type: 'string',
        description: 'Any forward-looking guidance provided (e.g., "Q4 revenue expected $13-14B")',
        maxLength: 150
      }
    }
  },

  '4': {
    type: 'object',
    required: ['company', 'summary', 'filerName', 'transactions'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      filerName: {
        type: 'string',
        description: 'Insider name exactly from "Name of Reporting Person" field',
        maxLength: 100
      },
      relationship: {
        type: 'string',
        description: 'Title/role from "Relationship of Reporting Person" (e.g., "CEO", "10% Owner", "Director")',
        maxLength: 100
      },
      transactions: {
        type: 'array',
        description: 'List of ALL transactions from Table I and Table II - MUST include price',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Transaction type: A=Acquisition, D=Disposition, P=Purchase, S=Sale, G=Gift, M=Exercise' },
            shares: { type: 'string', description: 'Number of shares with commas (from column 5)' },
            price: { type: 'string', description: 'Price per share with $ from column 4 - if $0, check if this is a gift/grant. Never leave blank.' },
            date: { type: 'string', description: 'Transaction date from column 2 (YYYY-MM-DD)' },
            acquisitionDisposition: { type: 'string', description: 'A for acquired, D for disposed' }
          }
        }
      },
      totalValue: {
        type: 'string',
        description: 'Calculate: sum of (shares × price) for each transaction. Format as "$X,XXX,XXX"',
        maxLength: 50
      },
      signalStrength: {
        type: 'string',
        description: 'Assess insider signal: "Strong Buy Signal", "Routine Sale", "10b5-1 Plan", "Option Exercise"',
        maxLength: 50
      },
      percentageChange: {
        type: 'string',
        description: 'Percentage change in holdings (e.g., "+5.2%" or "-12.3%")',
        maxLength: 20
      }
    }
  },

  '144': {
    type: 'object',
    required: ['company', 'summary', 'filerName', 'shares', 'estimatedValue', 'signalStrength'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      filerName: {
        type: 'string',
        description: 'Name of the selling security holder exactly as shown',
        maxLength: 100
      },
      filerRole: {
        type: 'string',
        description: 'Title/role (e.g., "CEO", "Director", "CFO", "10% Owner")',
        maxLength: 100
      },
      shares: {
        type: 'string',
        description: 'Number of shares to be sold with commas (e.g., "40,000")',
        maxLength: 50
      },
      estimatedValue: {
        type: 'string',
        description: 'Estimated sale value with $ (e.g., "$9.9M" or "$9,916,000")',
        maxLength: 50
      },
      pricePerShare: {
        type: 'string',
        description: 'Approximate price per share with $ (e.g., "$248")',
        maxLength: 30
      },
      percentOfHoldings: {
        type: 'string',
        description: 'Percentage of insider total holdings if calculable (e.g., "15%")',
        maxLength: 20
      },
      broker: {
        type: 'string',
        description: 'Broker/dealer handling the sale if mentioned',
        maxLength: 100
      },
      tradingPlan: {
        type: 'string',
        description: '10b5-1 plan details if applicable (e.g., "10b5-1 plan adopted 8/15/2025")',
        maxLength: 100
      },
      recentActivity: {
        type: 'string',
        description: 'Brief context on recent related insider sales if mentioned',
        maxLength: 200
      },
      remainingHoldings: {
        type: 'string',
        description: 'Amount of Securities Beneficially Owned Following Reported Transaction(s) - total shares still held after sale (e.g., "1,500,000")',
        maxLength: 50
      },
      signalStrength: {
        type: 'string',
        description: 'Signal assessment: "Notable Sale" (large/unusual), "Routine 10b5-1" (pre-planned), "Significant Divestiture" (pattern of sales)',
        maxLength: 50
      },
      securityType: {
        type: 'string',
        description: 'Type of securities (e.g., "Common Stock")',
        maxLength: 50
      }
    }
  },

  'SC 13G': {
    type: 'object',
    required: ['company', 'summary', 'filerName', 'ownershipPercentage'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      filerName: {
        type: 'string',
        description: 'Name of the reporting entity/institution',
        maxLength: 150
      },
      ownershipPercentage: {
        type: 'string',
        description: 'Beneficial ownership percentage (e.g., "7.5%")',
        maxLength: 20
      },
      sharesOwned: {
        type: 'string',
        description: 'Number of shares owned (e.g., "15,000,000")',
        maxLength: 50
      },
      filingPurpose: {
        type: 'string',
        description: 'Purpose of filing (Initial/Amendment)',
        maxLength: 50
      }
    }
  },

  'SC 13D': {
    type: 'object',
    required: ['company', 'summary', 'filerName', 'ownershipPercentage'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      filerName: {
        type: 'string',
        description: 'Name of the activist/acquiring entity',
        maxLength: 150
      },
      ownershipPercentage: {
        type: 'string',
        description: 'Beneficial ownership percentage (e.g., "12.3%")',
        maxLength: 20
      },
      sharesOwned: {
        type: 'string',
        description: 'Number of shares owned',
        maxLength: 50
      },
      purpose: {
        type: 'string',
        description: 'Stated purpose (e.g., "Investment", "Seek board representation")',
        maxLength: 200
      }
    }
  },

  '424B2': {
    type: 'object',
    required: ['company', 'summary', 'offeringType'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      offeringType: {
        type: 'string',
        description: 'Type of offering (e.g., "Debt", "Equity", "Structured Notes")',
        maxLength: 50
      },
      offeringAmount: {
        type: 'string',
        description: 'Total offering amount with $ (e.g., "$500,000,000")',
        maxLength: 50
      },
      maturityDate: {
        type: 'string',
        description: 'Maturity date if applicable (YYYY-MM-DD)',
        maxLength: 20
      },
      interestRate: {
        type: 'string',
        description: 'Interest rate if applicable (e.g., "5.25%")',
        maxLength: 20
      }
    }
  },

  // Generic fallback for unsupported form types
  'Generic': {
    type: 'object',
    required: ['company', 'summary'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      keyPoints: {
        type: 'array',
        description: 'Key points from the filing (max 5 items)',
        maxItems: 5,
        items: { type: 'string', description: 'Single key point', maxLength: 200 }
      }
    }
  }
};

// =============================================================================
// System Prompt - Guarantees JSON Output
// =============================================================================

/**
 * System prompt that enforces strict JSON output with no markdown or explanation
 */
const SYSTEM_PROMPT = `CRITICAL: You must respond with ONLY valid JSON. No other text.

RULES:
1. Output raw JSON only - no markdown code blocks (\`\`\`), no explanation
2. Start your response with { and end with }
3. Use exact field names from the schema - no synonyms
4. All text fields must be complete sentences ending with proper punctuation
5. Numbers should include units ($, %, shares)
6. Dates must be YYYY-MM-DD format
7. Arrays must not be empty - include at least one item
8. CRITICAL: Every [ MUST have a matching ]. Close all arrays BEFORE closing the object with }

STRUCTURE CHECK - Before outputting, verify:
- Count of { equals count of }
- Count of [ equals count of ]
- Response ends with ]} or }} (arrays closed before object)

FORBIDDEN:
- Do not wrap in \`\`\`json\`\`\`
- Do not say "Here is the JSON"
- Do not add any text before or after the JSON object
- Do not use "companyName", "issuerName" - use "company"
- Do not use "executiveSummary" - use "summary"
- Do not use markdown headers (###, ####, ##, #) inside JSON string values
- Do not use markdown lists (* or -) inside JSON string values
- Do not use markdown bold (**text**) inside JSON string values
- Write all text fields as plain prose sentences

WRITING STYLE:
- Write like a financial journalist at Morning Brew or Bloomberg
- Lead with the most important number or fact
- Be concise: prefer "Revenue hit $45B" over "The company reported total revenue of $45B"
- Use active voice: "CEO Smith sold" not "Shares were sold by CEO Smith"
- Include specific numbers with units ($, %, shares)
- For complex filings, structure as: [Headline fact] + [Key context] + [Significance]`;

// =============================================================================
// Main Function - Generate Filing Prompt
// =============================================================================

/**
 * Generates a bulletproof prompt for SEC filing summarization
 *
 * @param config - Configuration with form type and optional filing content
 * @returns System prompt, user prompt, and schema
 *
 * @example
 * ```typescript
 * const { systemPrompt, userPrompt, schema } = generateFilingPrompt({
 *   formType: '10-K',
 *   company: 'Tesla, Inc.',
 *   filingContent: '... filing text ...'
 * });
 * ```
 */
/**
 * Form-specific extraction guidance to improve AI accuracy
 */
const FORM_EXTRACTION_GUIDANCE: Record<string, string> = {
  '4': `FORM 4 EXTRACTION RULES:
- Look for "Table I - Non-Derivative Securities" and "Table II - Derivative Securities"
- Column 4 has the transaction price - if blank or $0, note this is likely a gift or grant
- Transaction code in column 3: P=Purchase, S=Sale, A=Award, G=Gift, M=Exercise
- Column 8 (A or D) indicates Acquisition or Disposition
- Calculate total value = shares × price for each transaction
- The summary MUST include: ticker, insider name, transaction type, dollar amount, and signal assessment`,

  '8-K': `8-K EXTRACTION RULES:
- Item 2.02 (Results of Operations): Extract EXACT revenue, EPS, net income figures with YoY changes
- Item 7.01 (Regulation FD): Look for guidance or investor presentation highlights
- Item 8.01 (Other Events): Extract any material announcements, acquisitions, or strategic changes
- Item 5.02 (Director/Officer Changes): Note names, titles, and effective dates
- ALWAYS include: specific dollar amounts ($X.XB), percentage changes (+X% YoY), and key metrics
- Lead keyHighlights with the most investor-relevant fact
- If management provides a quote, include it in managementCommentary
- Sentiment: Set to "positive" for beats/good news, "negative" for misses/concerns, "neutral" for informational filings, "mixed" if both`,

  '144': `FORM 144 EXTRACTION RULES:
- Form 144 is a NOTICE OF PROPOSED SALE - shares haven't been sold yet, this is intent to sell
- Extract filer name exactly as shown, and their title/role (CEO, Director, CFO, etc.)
- Find the number of shares proposed for sale and calculate estimated value (shares × approx price)
- IMPORTANT: Extract "Amount of Securities Beneficially Owned Following Reported Transaction(s)" as remainingHoldings - this is how many shares the filer will still own after the proposed sale
- Look for 10b5-1 trading plan references - if mentioned, note plan adoption date
- Check if filing mentions recent related sales by same insider for context
- The summary MUST lead with: ticker, insider name, shares count, and dollar value
- Signal assessment (2-level system):
  * "Notable Sale" - Use when: >$10M value, >5% of holdings, unusual timing, or part of large divestiture pattern
  * "Routine 10b5-1" - Use when: pre-planned under 10b5-1 trading plan, regular/scheduled sale, or small relative to holdings
- Write summary as: "[Name] ([Role]) plans to sell [shares] [TICKER] shares worth [value]..."`,
};

export function generateFilingPrompt(config: FilingPromptConfig): PromptOutput {
  const { formType, filingContent } = config;

  // Get the schema for this form type, falling back to Generic
  const schema = FORM_SCHEMAS[formType] || FORM_SCHEMAS['Generic'];

  // Build the user prompt with schema FIRST, then content
  const schemaDescription = formatSchemaDescription(schema);

  // Get form-specific extraction guidance
  const extractionGuidance = FORM_EXTRACTION_GUIDANCE[formType] || '';

  let userPrompt = `JSON Schema (you MUST use these exact field names):
${schemaDescription}

Respond with ONLY a JSON object matching the schema above.`;

  // Add filing content if provided
  if (filingContent) {
    userPrompt = `JSON Schema (you MUST use these exact field names):
${schemaDescription}
${extractionGuidance ? `\n${extractionGuidance}\n` : ''}
Filing Content:
${filingContent}

Respond with ONLY a JSON object matching the schema above.`;
  }

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    schema
  };
}

/**
 * Formats a JSON schema into a human-readable description
 * that includes maxLength/maxItems constraints inline
 */
function formatSchemaDescription(schema: JSONSchema): string {
  const lines: string[] = ['{'];

  const requiredSet = new Set(schema.required);

  for (const [key, prop] of Object.entries(schema.properties)) {
    const isRequired = requiredSet.has(key);
    const requiredMarker = isRequired ? ' (REQUIRED)' : '';

    let constraint = '';
    if (prop.maxLength) {
      constraint = ` (max ${prop.maxLength} chars)`;
    } else if (prop.maxItems) {
      constraint = ` (max ${prop.maxItems} items)`;
    }

    if (prop.type === 'array' && prop.items) {
      lines.push(`  "${key}": [...]${requiredMarker}${constraint} - ${prop.description}`);
    } else if (prop.type === 'object') {
      lines.push(`  "${key}": {...}${requiredMarker} - ${prop.description}`);
    } else {
      lines.push(`  "${key}": "${prop.type}"${requiredMarker}${constraint} - ${prop.description}`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Gets the schema for a specific form type
 *
 * @param formType - SEC form type
 * @returns The JSON schema for that form type
 */
export function getSchemaForFormType(formType: string): JSONSchema {
  return FORM_SCHEMAS[formType] || FORM_SCHEMAS['Generic'];
}

/**
 * Checks if a form type is supported with a specific schema
 *
 * @param formType - SEC form type to check
 * @returns true if the form type has a dedicated schema
 */
export function isFormTypeSupported(formType: string): boolean {
  return formType in FORM_SCHEMAS && formType !== 'Generic';
}

/**
 * Gets all supported form types
 *
 * @returns Array of supported form type strings
 */
export function getSupportedFormTypes(): string[] {
  return Object.keys(FORM_SCHEMAS).filter(ft => ft !== 'Generic');
}
