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
  items?: SchemaProperty | { type: string; properties?: Record<string, SchemaProperty>; required?: string[] };
  properties?: Record<string, SchemaProperty>;
  required?: string[];
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
// Common Sub-Schemas - Reusable across form types
// =============================================================================

/**
 * Financial highlight item schema with label, value, and optional change fields.
 * Used in 10-K and 10-Q schemas for consistent financial metric representation.
 */
const FINANCIAL_HIGHLIGHT_ITEM: SchemaProperty = {
  type: 'object',
  description: 'Financial metric with value and change',
  properties: {
    label: { type: 'string', description: 'Metric name (e.g., "Revenue", "Net Income")', maxLength: 50 },
    value: { type: 'string', description: 'Value with units (e.g., "$50.5B")', maxLength: 30 },
    change: { type: 'string', description: 'YoY change (e.g., "+15%", "-3%")', maxLength: 20 }
  },
  required: ['label', 'value']
};

/**
 * Business segment performance item schema.
 * Used in 10-K schemas for segment-level revenue breakdowns.
 */
const SEGMENT_ITEM: SchemaProperty = {
  type: 'object',
  description: 'Business segment with revenue and growth',
  properties: {
    name: { type: 'string', description: 'Segment name', maxLength: 50 },
    revenue: { type: 'string', description: 'Segment revenue', maxLength: 30 },
    growth: { type: 'string', description: 'Growth rate', maxLength: 20 }
  },
  required: ['name', 'revenue']
};

/**
 * Risk factor item - simple string array for material risks.
 * Used across 10-K, 10-Q, and other filing types.
 */
const RISK_FACTOR_ITEM: SchemaProperty = {
  type: 'string',
  description: 'Single risk factor',
  maxLength: 200
};

/**
 * Key point item - simple string array for general takeaways.
 * Used as fallback when structured financial data is sparse.
 */
const KEY_POINT_ITEM: SchemaProperty = {
  type: 'string',
  description: 'Single key point',
  maxLength: 200
};

// =============================================================================
// Form-Specific Schemas
// =============================================================================

/**
 * All form type schemas with their required fields and properties.
 * Each schema defines the JSON structure that AI must generate for that filing type.
 *
 * Key design principles:
 * - Field names match email template expectations exactly
 * - All arrays have maxItems to prevent oversized output
 * - All strings have maxLength to ensure consistent sizing
 * - Required fields are explicitly listed
 */
export const FORM_SCHEMAS: Record<string, JSONSchema> = {
  '10-K': {
    type: 'object',
    required: ['company', 'summary', 'fiscalYear', 'financialHighlights'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      fiscalYear: {
        type: 'string',
        description: 'Fiscal year (e.g., "2024")'
      },
      financialHighlights: {
        type: 'array',
        maxItems: 6,
        description: 'Key financial metrics with YoY changes',
        items: FINANCIAL_HIGHLIGHT_ITEM
      },
      segments: {
        type: 'array',
        maxItems: 5,
        description: 'Business segment performance',
        items: SEGMENT_ITEM
      },
      riskFactors: {
        type: 'array',
        maxItems: 3,
        description: 'Top 3 material risks with quantified impact',
        items: RISK_FACTOR_ITEM
      },
      keyPoints: {
        type: 'array',
        maxItems: 5,
        description: 'Additional key takeaways (fallback if financialHighlights sparse)',
        items: KEY_POINT_ITEM
      }
    }
  },

  '10-Q': {
    type: 'object',
    required: ['company', 'summary', 'fiscalQuarter', 'financialHighlights'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      fiscalQuarter: {
        type: 'string',
        description: 'Fiscal quarter (e.g., "Q3 2024")'
      },
      financialHighlights: {
        type: 'array',
        maxItems: 6,
        description: 'Key quarterly financial metrics with YoY and QoQ changes',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Metric name (e.g., "Revenue", "EPS")', maxLength: 50 },
            value: { type: 'string', description: 'Value with units (e.g., "$12.5B")', maxLength: 30 },
            change: { type: 'string', description: 'YoY change (e.g., "+15%", "-3%")', maxLength: 20 },
            qoqChange: { type: 'string', description: 'QoQ change (e.g., "+5%", "-2%")', maxLength: 20 }
          },
          required: ['label', 'value']
        }
      },
      quarterlyTrends: {
        type: 'array',
        maxItems: 4,
        description: 'Quarter-over-quarter trend indicators',
        items: {
          type: 'object',
          properties: {
            metric: { type: 'string', description: 'Metric name', maxLength: 50 },
            current: { type: 'string', description: 'Current quarter value', maxLength: 30 },
            trend: { type: 'string', description: 'Trend direction: up, down, or flat', enum: ['up', 'down', 'flat'] }
          },
          required: ['metric', 'current', 'trend']
        }
      },
      guidanceUpdates: {
        type: 'array',
        maxItems: 3,
        description: 'Forward-looking guidance updates from management',
        items: { type: 'string', description: 'Single guidance update', maxLength: 200 }
      },
      riskFactors: {
        type: 'array',
        maxItems: 3,
        description: 'Key risks or concerns highlighted this quarter',
        items: RISK_FACTOR_ITEM
      },
      keyPoints: {
        type: 'array',
        maxItems: 5,
        description: 'Additional key takeaways (fallback if financialHighlights sparse)',
        items: KEY_POINT_ITEM
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
      filerRole: {
        type: 'string',
        description: 'Title/role from "Relationship of Reporting Person" (e.g., "CEO", "10% Owner", "Director")',
        maxLength: 100
      },
      transactions: {
        type: 'array',
        description: 'List of ALL transactions from Table I and Table II - MUST include shares and price',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Transaction type: A=Acquisition, D=Disposition, P=Purchase, S=Sale, G=Gift, M=Exercise' },
            shares: { type: 'string', description: 'REQUIRED: Number of shares with commas (from column 5). Never leave blank - extract from table or calculate from value/price.' },
            price: { type: 'string', description: 'REQUIRED: Price per share with $ from column 4 - if $0, check if this is a gift/grant. Never leave blank.' },
            date: { type: 'string', description: 'Transaction date from column 2 (YYYY-MM-DD)' },
            acquisitionDisposition: { type: 'string', description: 'A for acquired, D for disposed' }
          },
          required: ['type', 'shares', 'price']
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
      },
      has10b51Plan: {
        type: 'boolean',
        description: 'CRITICAL: Check footnotes/explanations for 10b5-1 trading plan. Set true if: "pursuant to a 10b5-1", "pre-arranged trading plan", "Rule 10b5-1", "prearranged trading agreement". Set false if: "no 10b5-1", "not pursuant to", or no mention.'
      }
    }
  },

  '144': {
    type: 'object',
    required: ['company', 'summary', 'filerName', 'shares', 'estimatedValue', 'remainingHoldings', 'signalStrength'],
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

  // =============================================================================
  // Reddit Filing Types - Phase 4 Addition
  // =============================================================================

  /**
   * Form S-1: IPO Registration Statement
   * Filed when a company is going public for the first time.
   * Contains business description, financial data, use of proceeds, and risk factors.
   */
  'S-1': {
    type: 'object',
    required: ['company', 'summary', 'offeringSize'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      offeringSize: {
        type: 'string',
        description: 'Total offering size with $ (e.g., "$500M", "$1.2B")',
        maxLength: 30
      },
      priceRange: {
        type: 'string',
        description: 'Expected price range (e.g., "$18-$21 per share")',
        maxLength: 50
      },
      sharesOffered: {
        type: 'string',
        description: 'Number of shares being offered (e.g., "25,000,000")',
        maxLength: 30
      },
      useOfProceeds: {
        type: 'array',
        maxItems: 4,
        description: 'How IPO proceeds will be used',
        items: { type: 'string', description: 'Single use of proceeds', maxLength: 150 }
      },
      businessDescription: {
        type: 'string',
        description: 'One-line business description',
        maxLength: 200
      },
      financialHighlights: {
        type: 'array',
        maxItems: 4,
        description: 'Key pre-IPO financial metrics',
        items: FINANCIAL_HIGHLIGHT_ITEM
      },
      riskFactors: {
        type: 'array',
        maxItems: 3,
        description: 'Top IPO risks for investors',
        items: RISK_FACTOR_ITEM
      },
      underwriters: {
        type: 'array',
        maxItems: 5,
        description: 'Lead underwriters for the IPO',
        items: { type: 'string', description: 'Underwriter name', maxLength: 100 }
      },
      expectedTradingDate: {
        type: 'string',
        description: 'Expected trading start date if disclosed',
        maxLength: 30
      },
      exchangeListing: {
        type: 'string',
        description: 'Exchange where shares will be listed (e.g., "NYSE", "NASDAQ")',
        maxLength: 30
      }
    }
  },

  /**
   * Form S-3: Secondary Offering Registration Statement
   * Filed for secondary offerings by companies already public.
   * Can be shelf registration for future offerings or specific secondary offerings.
   */
  'S-3': {
    type: 'object',
    required: ['company', 'summary', 'offeringType'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      offeringType: {
        type: 'string',
        description: 'Type of offering (e.g., "Primary", "Secondary", "Shelf Registration", "ATM Program")',
        maxLength: 50
      },
      offeringAmount: {
        type: 'string',
        description: 'Total offering amount with $ (e.g., "$500M")',
        maxLength: 50
      },
      sharesOffered: {
        type: 'string',
        description: 'Number of shares being registered (e.g., "10,000,000")',
        maxLength: 30
      },
      dilutionImpact: {
        type: 'string',
        description: 'Estimated dilution impact on existing shareholders (e.g., "5% dilution")',
        maxLength: 50
      },
      sellingShareholders: {
        type: 'array',
        maxItems: 5,
        description: 'Selling shareholders if secondary sale',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Shareholder name', maxLength: 100 },
            shares: { type: 'string', description: 'Shares being sold', maxLength: 30 }
          },
          required: ['name', 'shares']
        }
      },
      shelfRegistration: {
        type: 'object',
        description: 'Shelf registration details if applicable',
        properties: {
          totalAuthorized: { type: 'string', description: 'Total amount authorized', maxLength: 50 },
          remainingCapacity: { type: 'string', description: 'Remaining capacity', maxLength: 50 },
          expirationDate: { type: 'string', description: 'Shelf expiration date', maxLength: 20 }
        }
      },
      useOfProceeds: {
        type: 'array',
        maxItems: 3,
        description: 'Intended use of proceeds',
        items: { type: 'string', description: 'Use of proceeds', maxLength: 150 }
      },
      pricePerShare: {
        type: 'string',
        description: 'Price per share if fixed (e.g., "$45.00")',
        maxLength: 30
      }
    }
  },

  /**
   * DEF 14A: Definitive Proxy Statement
   * Filed before shareholder meetings with voting matters.
   * Contains executive compensation, board proposals, and shareholder proposals.
   */
  'DEF 14A': {
    type: 'object',
    required: ['company', 'summary', 'meetingDate'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      meetingDate: {
        type: 'string',
        description: 'Annual/special meeting date (YYYY-MM-DD)',
        maxLength: 20
      },
      meetingType: {
        type: 'string',
        description: 'Type of meeting (e.g., "Annual Meeting", "Special Meeting")',
        maxLength: 50
      },
      recordDate: {
        type: 'string',
        description: 'Record date for voting eligibility (YYYY-MM-DD)',
        maxLength: 20
      },
      executiveCompensation: {
        type: 'array',
        maxItems: 5,
        description: 'Top executive compensation packages',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Executive name', maxLength: 100 },
            title: { type: 'string', description: 'Executive title', maxLength: 50 },
            totalCompensation: { type: 'string', description: 'Total compensation (e.g., "$15.2M")', maxLength: 30 }
          },
          required: ['name', 'totalCompensation']
        }
      },
      ceoPayRatio: {
        type: 'string',
        description: 'CEO to median employee pay ratio (e.g., "287:1")',
        maxLength: 30
      },
      boardProposals: {
        type: 'array',
        maxItems: 6,
        description: 'Management/board proposals for shareholder vote',
        items: {
          type: 'object',
          properties: {
            number: { type: 'string', description: 'Proposal number', maxLength: 10 },
            description: { type: 'string', description: 'Proposal description', maxLength: 200 },
            recommendation: { type: 'string', description: 'Board recommendation (FOR/AGAINST)', maxLength: 20 }
          },
          required: ['description', 'recommendation']
        }
      },
      shareholderProposals: {
        type: 'array',
        maxItems: 4,
        description: 'Shareholder-submitted proposals',
        items: {
          type: 'object',
          properties: {
            number: { type: 'string', description: 'Proposal number', maxLength: 10 },
            description: { type: 'string', description: 'Proposal description', maxLength: 200 },
            recommendation: { type: 'string', description: 'Board recommendation (usually AGAINST)', maxLength: 20 }
          },
          required: ['description', 'recommendation']
        }
      },
      directorNominees: {
        type: 'array',
        maxItems: 15,
        description: 'Director nominees for election',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nominee name', maxLength: 100 },
            independent: { type: 'string', description: 'Independence status', maxLength: 20 },
            tenure: { type: 'string', description: 'Years on board', maxLength: 20 }
          },
          required: ['name']
        }
      },
      sayOnPay: {
        type: 'object',
        description: 'Say-on-pay advisory vote details',
        properties: {
          included: { type: 'string', description: 'Whether included (Yes/No)', maxLength: 10 },
          recommendation: { type: 'string', description: 'Board recommendation', maxLength: 20 },
          frequency: { type: 'string', description: 'Vote frequency (Annual/Biennial/Triennial)', maxLength: 20 }
        }
      },
      auditorRatification: {
        type: 'object',
        description: 'Auditor ratification proposal',
        properties: {
          firm: { type: 'string', description: 'Audit firm name', maxLength: 100 },
          fees: { type: 'string', description: 'Audit fees paid', maxLength: 30 }
        }
      }
    }
  },

  /**
   * Form 11-K: Employee Stock Purchase/Savings Plan Annual Report
   * Annual report for employee benefit plans.
   * Contains plan assets, contributions, and financial statements.
   */
  '11-K': {
    type: 'object',
    required: ['company', 'summary', 'planAssets'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      planName: {
        type: 'string',
        description: 'Full name of the employee benefit plan',
        maxLength: 200
      },
      planFiscalYear: {
        type: 'string',
        description: 'Plan fiscal year end (e.g., "December 31, 2024")',
        maxLength: 30
      },
      planAssets: {
        type: 'string',
        description: 'Total plan assets (e.g., "$2.5B")',
        maxLength: 30
      },
      netAssetsChange: {
        type: 'string',
        description: 'Change in net assets during year (e.g., "+$150M", "-5%")',
        maxLength: 30
      },
      participantCount: {
        type: 'string',
        description: 'Number of plan participants (e.g., "45,000")',
        maxLength: 30
      },
      contributionsReceived: {
        type: 'string',
        description: 'Total contributions received during year (e.g., "$350M")',
        maxLength: 30
      },
      employerContributions: {
        type: 'string',
        description: 'Employer matching contributions (e.g., "$125M")',
        maxLength: 30
      },
      benefitsDistributed: {
        type: 'string',
        description: 'Benefits paid to participants (e.g., "$200M")',
        maxLength: 30
      },
      investmentOptions: {
        type: 'array',
        maxItems: 10,
        description: 'Available investment options in the plan',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Fund/option name', maxLength: 100 },
            allocation: { type: 'string', description: 'Percentage of assets', maxLength: 20 },
            return: { type: 'string', description: 'Annual return', maxLength: 20 }
          },
          required: ['name']
        }
      },
      companyStockHoldings: {
        type: 'string',
        description: 'Amount held in company stock if ESOP (e.g., "$500M", "25% of assets")',
        maxLength: 50
      },
      planType: {
        type: 'string',
        description: 'Type of plan (e.g., "401(k)", "ESOP", "Profit Sharing")',
        maxLength: 50
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
  '10-K': `10-K ANNUAL REPORT EXTRACTION RULES:
- REQUIRED FINANCIAL METRICS (must include ALL of these in financialHighlights):
  1. Revenue - Total annual revenue with YoY change (e.g., "$130.5B (+114%)")
  2. Net Income - Annual net income with YoY change
  3. Gross Margin - ALWAYS calculate and include (Revenue - COGS) / Revenue as percentage (e.g., "75.0%")
  4. EPS - Earnings per share (diluted) with YoY change
  5. Operating Income - If materially different from net income
  6. Free Cash Flow - If disclosed
- Gross margin is a KEY METRIC for investors - if not explicitly stated, calculate it from revenue and cost of revenue/COGS
- Include segment breakdown if the company has multiple business units
- For fiscal year, extract the EXACT year (e.g., "2024" or "FY2025")
- Risk factors should be specific and quantified where possible (e.g., "Tariff exposure could reduce margins by 5%")
- The summary MUST lead with: company name, total revenue, and profitability highlight`,

  '10-Q': `10-Q QUARTERLY REPORT EXTRACTION RULES:
- REQUIRED FINANCIAL METRICS (must include ALL of these in financialHighlights):
  1. Revenue - Quarterly revenue with YoY AND QoQ changes (e.g., "$28.1B (+12% YoY, +3% QoQ)")
  2. Net Income - Quarterly net income with YoY change
  3. Gross Margin - ALWAYS calculate and include as percentage (e.g., "18%") - this is MANDATORY
  4. EPS - Earnings per share (diluted) with YoY change
  5. Operating Margin or Operating Income - If disclosed
  6. Cash Flow from Operations - If materially significant
- Gross margin is CRITICAL for quarterly comparisons - if not explicitly stated, derive from (Revenue - Cost of Revenue) / Revenue
- Include quarterly trends (up/down/flat) for key metrics
- Extract guidance updates if management provides forward-looking statements
- For fiscal quarter, format as "Q3 2024" or "Q1 FY2025"
- The summary MUST lead with: company name, quarterly revenue, and margin performance`,

  '4': `FORM 4 EXTRACTION RULES:
- Look for "Table I - Non-Derivative Securities" and "Table II - Derivative Securities"
- CRITICAL: Column 5 has the number of shares - ALWAYS extract this value. Never leave blank.
- Column 4 has the transaction price - if blank or $0, note this is likely a gift or grant
- Transaction code in column 3: P=Purchase, S=Sale, A=Award, G=Gift, M=Exercise
- Column 8 (A or D) indicates Acquisition or Disposition
- Calculate total value = shares × price for each transaction
- If shares field is missing but total value is available, calculate shares = totalValue / price
- The summary MUST include: ticker, insider name, transaction type, SHARE COUNT, dollar amount, and signal assessment
- 10b5-1 DETECTION: Check footnotes and explanation sections for pre-arranged trading plan language:
  * "pursuant to a 10b5-1" or "Rule 10b5-1" = has10b51Plan: true
  * "pre-arranged trading plan" or "prearranged trading agreement" = has10b51Plan: true
  * "adopted on [date]" referring to trading plan = has10b51Plan: true
  * If no mention of trading plan = has10b51Plan: false`,

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
- CRITICAL: Find the EXACT number of shares proposed for sale - look for "Amount of Securities to be Sold" or similar. Format with commas (e.g., "56,820")
- Calculate estimated value (shares × approx price per share) and format as "$X.XM" or "$X,XXX,XXX"
- REQUIRED: Extract "Amount of Securities Beneficially Owned Following Reported Transaction(s)" as remainingHoldings - this is the total shares the filer will STILL OWN after the proposed sale
- Look for 10b5-1 trading plan references - if mentioned, note plan adoption date
- Check if filing mentions recent related sales by same insider for context
- The summary MUST lead with: ticker, insider name, shares count, and dollar value
- Signal assessment (2-level system):
  * "Notable Sale" - Use when: >$10M value, >5% of holdings, unusual timing, or part of large divestiture pattern
  * "Routine 10b5-1" - Use when: pre-planned under 10b5-1 trading plan, regular/scheduled sale, or small relative to holdings
- Write summary as: "[Name] ([Role]) proposes to sell [shares] [TICKER] shares worth [value]. Following this transaction, they will still hold [remainingHoldings] shares."`,

  'S-1': `FORM S-1 IPO REGISTRATION EXTRACTION RULES:
- This is an IPO REGISTRATION - company is going public for the first time
- REQUIRED FIELDS:
  1. offeringSize - Total dollar amount being raised (e.g., "$500M")
  2. priceRange - IPO price range (e.g., "$18-$21 per share")
  3. sharesOffered - Number of shares being offered
  4. businessDescription - One-line company description
- Extract underwriters (lead left, joint bookrunners) - usually Goldman, Morgan Stanley, JPMorgan, etc.
- Extract use of proceeds - typically: general corporate purposes, R&D, sales/marketing, debt repayment
- Extract key financial highlights: Revenue, Net Income (or Net Loss), Gross Margin
- For loss-making companies (common in IPOs), note the net loss and path to profitability if mentioned
- Extract risk factors - focus on company-specific risks, not boilerplate
- Note the exchange listing (NYSE/NASDAQ) and proposed ticker symbol
- The summary MUST lead with: company name, what they do, offering size, and notable metrics`,

  'S-3': `FORM S-3 SECONDARY OFFERING EXTRACTION RULES:
- S-3 is used by ALREADY PUBLIC companies for secondary offerings
- Determine the type: Primary (company selling new shares), Secondary (existing shareholders selling), or Shelf Registration (registering for future use)
- REQUIRED FIELDS:
  1. offeringType - Primary, Secondary, Shelf, or ATM (at-the-market) program
  2. offeringAmount - Total dollar amount or number of shares
  3. dilutionImpact - Calculate approximate dilution to existing shareholders
- For shelf registrations: Note total capacity, remaining capacity, and expiration date
- For ATM programs: Note the agent/dealer and any daily/weekly limits
- Extract selling shareholders if this is a secondary sale (insiders, VCs, PE firms)
- Note use of proceeds if primary offering
- The summary MUST lead with: type of offering, amount, and dilution impact`,

  'DEF 14A': `DEF 14A PROXY STATEMENT EXTRACTION RULES:
- Proxy statements precede shareholder meetings for voting
- REQUIRED FIELDS:
  1. meetingDate - When is the annual/special meeting
  2. executiveCompensation - CEO and NEO (named executive officer) total compensation
  3. ceoPayRatio - CEO to median employee pay ratio (e.g., "287:1")
  4. boardProposals - Management proposals requiring vote (director election, say-on-pay, auditor ratification)
  5. shareholderProposals - Any shareholder-submitted proposals
- For executive compensation: Extract total compensation for top 5 executives (salary + bonus + stock + options + other)
- Note say-on-pay vote recommendation and any concerns raised
- For director nominees: Note any contested elections or activist board candidates
- Extract any related party transactions or conflicts of interest
- The summary MUST lead with: meeting date, key proposals, and notable compensation figures`,

  '11-K': `FORM 11-K EMPLOYEE PLAN EXTRACTION RULES:
- Form 11-K is the annual report for employee benefit plans (401(k), ESOP, etc.)
- REQUIRED FIELDS:
  1. planName - Full name of the benefit plan
  2. planAssets - Total plan assets (net assets available for benefits)
  3. participantCount - Number of active participants
  4. contributionsReceived - Employee contributions during the year
  5. benefitsDistributed - Benefits/withdrawals paid out
- Extract employer matching contribution amount
- Note investment returns and any significant losses
- For ESOPs: Extract company stock holdings as percentage of total assets
- Look for any audit findings or compliance issues
- Note the plan type: 401(k), profit sharing, ESOP, pension, etc.
- The summary MUST lead with: plan name, total assets, and net change in assets`,
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
