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

import { canonicalizeFormType } from '../utils/form-type-utils';

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
  /**
   * When false/undefined, the materialitySignal field is stripped from
   * FORM_SCHEMAS['10-K' | '10-Q'] before the model sees it, and the
   * MATERIALITY SIGNAL section is stripped from the form's extraction
   * guidance. Production callers gate this via PostHog flag
   * `enable_earnings_mini_deep_dive` (see `isEarningsMiniDeepDiveEnabled`
   * in `lib/ai/enrichment-flags.ts`). Autoplan Decision #33 — schema/prompt
   * is the single feature-flag layer.
   */
  enableEarningsMiniDeepDive?: boolean;
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
// Field-description grounding helper (PR 3 of the anti-hallucination plan)
// =============================================================================

/**
 * Append the standard "leave null when not stated" anti-hallucination
 * boilerplate to a schema field's description. Centralizing the language
 * makes the pattern grep-able for audits and ensures every numeric field
 * gets the same treatment without copy/paste drift.
 *
 * Used for fields asking for a number, dollar amount, share count,
 * percentage, fiscal date, or transaction-specific code. The audit test
 * (grounding-prompt-coverage.test.ts) walks every string-typed schema
 * field whose description suggests a numeric value (contains $, %, shares,
 * or dollars) and asserts it carries this language.
 */
function withGroundingNote(originalDesc: string): string {
  return `${originalDesc} ONLY populate when the filing explicitly states this value. Leave null when not directly disclosed. Do not estimate or infer.`;
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
  },
  importanceScore: {
    type: 'string',
    description: 'How important is this filing to a shareholder? Rate based on materiality: "critical" = CEO change, acquisition, earnings miss >10%, large insider sell >$5M; "high" = material event, new risk factors, insider transactions >$1M; "medium" = routine quarterly update, standard vesting grant; "low" = administrative amendment, minor update.',
    enum: ['critical', 'high', 'medium', 'low']
  },
  headline: {
    type: 'string',
    description: 'A single compelling sentence (50-90 chars) summarizing the most important takeaway for a shareholder. No ticker prefix. No form type prefix. Just the news. Example: "Revenue surged 23% to $94.8B driven by AI infrastructure demand"',
    maxLength: 120
  },
  emailSubject: {
    type: 'string',
    description: 'Email subject line. HARD MAX 78 chars (Gmail truncates past ~80 in the reading-pane header). Target 40-70 chars. Format: "[TICKER] [FormType]: [key insight]". Must include the ticker symbol. Example: "NVDA 10-K: Revenue surged 23% to $94.8B". Do not stuff multiple facts — pick the single most material one.',
    maxLength: 78
  }
};

// =============================================================================
// Common Sub-Schemas - Reusable across form types
// =============================================================================

/**
 * Interpretive "why it matters" property reused across target schemas.
 * Opt-in per schema — not in BASE_SCHEMA_PROPERTIES because Form 4, Form 3, Form 144,
 * SC 13D/G, and Generic rely on label-based copy rather than AI interpretation.
 *
 * This is the LEGACY 180-char version. For 10-K / 10-Q when the
 * earnings-mini-deep-dive flag is on, `generateFilingPrompt` swaps in
 * `WHY_IT_MATTERS_PROPERTY_10K` / `WHY_IT_MATTERS_PROPERTY_10Q` below — both
 * carry a 400-char cap and form-specific guidance that explicitly forbids
 * metric restatement and routes the model to X-sentiment + web-search
 * enrichment context (now wired for 10-K/10-Q in `summarize.ts`).
 */
const WHY_IT_MATTERS_PROPERTY: SchemaProperty = {
  type: 'string',
  description: 'ONE SENTENCE (40-180 chars). If the reader reads only this line, what should they know that ISN\'T already in headline or summary? Add interpretation, not restatement — e.g., why terms are notable, what this means for the company, what comes next. If web-search ENRICHMENT context is provided above, use it to ground claims (rates, spreads, consensus, peer context). If you can\'t produce something specific and non-obvious, return empty string — the parser will coerce it to an absent field and a template fallback will render.',
  maxLength: 180
};

/**
 * 10-K-specific whyItMatters property — consolidated synthesis output.
 *
 * v12 rewrite per Wilfred 2026-05-17: the WIM field is now the ONE place
 * the email surfaces investor-grade interpretation. The "What to Watch"
 * section has been removed from rendering; the forward-looking risks
 * that used to live there are now folded INTO this prose, alongside the
 * material context and sentiment framing. Multi-paragraph output
 * supported. 1000-char cap accommodates real synthesis.
 *
 * `riskFactors` and `keyPoints` arrays are still extracted into the
 * schema for downstream consumers (DB storage, future analytics) but
 * are no longer rendered as their own email sections.
 */
const WHY_IT_MATTERS_PROPERTY_10K: SchemaProperty = {
  type: 'string',
  description:
    'CONSOLIDATED SYNTHESIS (200-1000 chars, 2-3 short paragraphs separated by blank lines). ' +
    'This is the ONE section in the email that combines material context with forward-looking interpretation. ' +
    'No standalone "What to Watch" section renders — the risks that would have gone there must be folded into this prose. ' +
    'STRUCTURE: ' +
    '(¶1) Material take — the single most important investor read of this filing, citing ONE specific cross-year inflection from MD&A or Item 1A risk factors. Reference dollar amounts, item numbers, named risks. NEVER just restate the scorecard metrics. ' +
    '(¶2) Forward-looking risks — synthesize the 2-3 most material risk factors / themes (from Item 1A) into a coherent "what bears watching" paragraph. Compare voices: filing\'s tone vs market sentiment (X-sentiment context above) vs peer/sector framing (web-search ENRICHMENT context above). Where do they agree, where do they diverge? ' +
    '(¶3, optional) Peer or sector framing — only if web-search ENRICHMENT context is provided. ' +
    'STRICT BAN: do not restate metric deltas already shown in the scorecard. Do not enumerate risks as a list — write prose that synthesizes the connections between them. If you cannot produce specific, non-obvious interpretation, return empty string.',
  maxLength: 1000,
};

/**
 * 10-Q-specific whyItMatters property — consolidated synthesis output.
 * Same shape as the 10-K variant but tuned for quarterly cadence:
 * QoQ inflections, management commentary deltas, consensus delta.
 */
const WHY_IT_MATTERS_PROPERTY_10Q: SchemaProperty = {
  type: 'string',
  description:
    'CONSOLIDATED SYNTHESIS (200-1000 chars, 2-3 short paragraphs separated by blank lines). ' +
    'This is the ONE section in the email that combines material context with forward-looking interpretation. ' +
    'No standalone "What to Watch" section renders — the risks that would have gone there must be folded into this prose. ' +
    'STRUCTURE: ' +
    '(¶1) Material take — the single most important investor read of this quarterly print, citing ONE specific QoQ inflection point or management commentary delta from MD&A. Reference dollar amounts, item numbers, named events. NEVER just restate the scorecard metrics. ' +
    '(¶2) Forward-looking risks — synthesize the 2-3 most material near-term concerns (from the quarter\'s risk factors / management commentary) into a coherent paragraph. Compare voices: management\'s tone in MD&A vs market sentiment (X-sentiment context above) vs consensus expectation (web-search ENRICHMENT context above). Where does the data confirm vs contradict each voice? ' +
    '(¶3, optional) Consensus or peer framing — only if web-search ENRICHMENT context is provided. Did the print beat/miss consensus? Did peers print similar dynamics this quarter? ' +
    'STRICT BAN: do not restate metric deltas. Do not enumerate risks — synthesize them as prose. Empty string beats vague prose.',
  maxLength: 1000,
};

/**
 * Materiality signal — 4-tier classification for 10-K and 10-Q filings.
 *
 * Optional (not in `required[]`) — extractors default to {score:'noise', rationale:'...'}
 * when absent to avoid the JSON-schema rejection cliff identified in autoplan
 * Decision #4. Validated against 30-filing labeled set at 76.7% accuracy via
 * `lib/ai/calibration/materiality-rubric.ts` calibration harness (gate ≥75%).
 *
 * Materiality is SYMMETRIC — a big upside beat is just as material as a big
 * downside miss. See FORM_EXTRACTION_GUIDANCE['10-K' | '10-Q'] for the full
 * rubric.
 */
const MATERIALITY_SIGNAL_PROPERTY: SchemaProperty = {
  type: 'object',
  description: 'Materiality classification using 4-tier scale (high / medium / low / noise). Score MUST be derived from filing evidence — revenue/earnings beats or misses, NEW risk factors vs prior period, guidance changes, leadership changes, control deficiencies, restatements, segment shifts, material acquisitions or divestitures. Materiality is SYMMETRIC: a +20% revenue beat is as material as a -5% miss. Never inflate to feel useful — most routine large-cap filings are LOW, not MEDIUM.',
  properties: {
    score: {
      type: 'string',
      description: 'One of: "high" | "medium" | "low" | "noise". MUST match exactly.',
      enum: ['high', 'medium', 'low', 'noise'],
    },
    rationale: {
      type: 'string',
      description: 'One sentence (40-400 chars) citing specific filing evidence — Item number, named section, or directly-quoted phrase. NOT generic prose. Example: "FY2025 net income +13% YoY to $30.5B per Item 7; Q4 retrospective accounting method change per Note 1."',
      maxLength: 400,
    },
  },
  required: ['score', 'rationale'],
};

/**
 * Financial highlight item schema with label, value, and optional change fields.
 * Used in 10-K and 10-Q schemas for consistent financial metric representation.
 */
const FINANCIAL_HIGHLIGHT_ITEM: SchemaProperty = {
  type: 'object',
  description: 'Financial metric with current value, prior-period value, and YoY change. The prior value enables side-by-side comparison rendering ([prior] → [current]) in the email scorecard.',
  properties: {
    label: { type: 'string', description: 'Metric name (e.g., "Revenue", "Net Income")', maxLength: 50 },
    value: { type: 'string', description: withGroundingNote('CURRENT-period value with units (e.g., "$50.5B"). Some 10-Q filings omit certain margins; do NOT compute from other figures or import from prior periods.'), maxLength: 30 },
    priorValue: { type: 'string', description: withGroundingNote('PRIOR-period value with units, formatted the same as `value` (e.g., "$44.0B" for prior-year revenue, "75.0%" for prior gross margin). The prior-period column is in the SAME table as the current value — for 10-K, prior fiscal year; for 10-Q, prior-year same quarter. Leave null when only the current period is stated.'), maxLength: 30 },
    change: { type: 'string', description: withGroundingNote('YoY change as stated in the filing or trivially computable from two stated period values (e.g., "+15%", "-3%"). Leave null when only one period\'s value is given.'), maxLength: 20 }
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
    revenue: { type: 'string', description: withGroundingNote('Segment revenue with units exactly as stated in the filing.'), maxLength: 30 },
    growth: { type: 'string', description: withGroundingNote('Segment growth rate as stated in the filing or trivially computable. Leave null when only one period\'s segment revenue is given.'), maxLength: 20 }
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
      },
      whyItMatters: WHY_IT_MATTERS_PROPERTY,
      materialitySignal: MATERIALITY_SIGNAL_PROPERTY
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
        description: 'Key quarterly financial metrics with current value, prior-year value, and YoY/QoQ changes. The prior value enables side-by-side comparison rendering ([prior] → [current]) in the email scorecard.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Metric name (e.g., "Revenue", "EPS")', maxLength: 50 },
            value: { type: 'string', description: 'CURRENT-quarter value with units (e.g., "$12.5B")', maxLength: 30 },
            priorValue: { type: 'string', description: 'PRIOR-YEAR same-quarter value with units (e.g., "$10.8B" for prior-year revenue, "30.3%" for prior margin). The prior-quarter column is in the SAME income statement table. Leave null when only the current quarter is stated.', maxLength: 30 },
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
      },
      whyItMatters: WHY_IT_MATTERS_PROPERTY,
      materialitySignal: MATERIALITY_SIGNAL_PROPERTY
    }
  },

  '8-K': {
    type: 'object',
    required: ['company', 'summary', 'eventType', 'keyHighlights', 'sentiment', 'itemNumbers'],
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
        description: 'REQUIRED. SEC item numbers reported (e.g., ["2.02", "9.01"]). Each item must match the pattern "N.NN" (digits.digits).',
        maxItems: 10,
        items: { type: 'string', description: 'Item number in "N.NN" format', maxLength: 10 }
      },
      itemDescriptions: {
        type: 'array',
        description: 'Human-readable description for each item number (e.g., [{"item": "2.02", "description": "Results of Operations and Financial Condition"}])',
        items: {
          type: 'object',
          properties: {
            item: { type: 'string', description: 'Item number (e.g., "2.02")', maxLength: 10 },
            description: { type: 'string', description: 'Human-readable description of the item', maxLength: 100 }
          },
          required: ['item', 'description']
        }
      },
      keyHighlights: {
        type: 'array',
        description: 'Top 3-5 material facts with specific numbers. Lead with the most important. For Item 2.03 (debt): DO NOT list per-tranche data here — use the structured `tranches` field instead.',
        maxItems: 5,
        items: { type: 'string', description: 'Single key fact with number', maxLength: 150 }
      },
      tranches: {
        type: 'array',
        description: 'ONLY for Item 2.03 (debt issuance). Array of debt tranches being issued, one entry per tranche. Omit entirely for any other item type (especially NOT for 2.04 covenant triggers).',
        maxItems: 25,
        items: {
          type: 'object',
          properties: {
            amountDisplay: { type: 'string', description: 'Pre-formatted display amount with currency symbol and unit. Examples: "¥128.9B", "$3B", "€500M". MUST match pattern: currency symbol optional, digits, optional comma/dot, optional unit letter (M/B/T).', maxLength: 20 },
            currency: { type: 'string', description: 'ISO currency code. Examples: "USD", "JPY", "EUR", "GBP".', maxLength: 8 },
            coupon: { type: 'string', description: 'Interest rate or floating reference. Examples: "2.077%", "SOFR + 125bps". Omit if not disclosed.', maxLength: 30 },
            yield: { type: 'string', description: 'Yield at pricing if disclosed (e.g., "2.095%"). Often same as coupon; omit if redundant.', maxLength: 30 },
            maturity: { type: 'string', description: 'Maturity year or full date. Examples: "2029", "2029-03-15", "Perpetual". Omit only if truly undisclosed.', maxLength: 30 },
            spread: { type: 'string', description: 'Spread over benchmark at pricing. Examples: "T+45bps", "MS+30bps". Omit if not disclosed.', maxLength: 30 }
          },
          required: ['amountDisplay', 'currency']
        }
      },
      dealTerms: {
        type: 'object',
        description: 'ONLY for Item 1.01 (Material Definitive Agreement, including M&A) or Item 2.01 (Completion of Acquisition). Structured deal summary. Omit for any other item type.',
        properties: {
          counterparty: { type: 'string', description: 'Name of the counterparty or target company. Be specific — use the legal name from the filing.', maxLength: 150 },
          dealValue: { type: 'string', description: 'Total deal value with currency symbol and unit. Examples: "$1.2B", "$475M cash + $250M stock".', maxLength: 50 },
          consideration: { type: 'string', description: 'Form of consideration: "all cash", "stock-for-stock", "mixed cash+stock", etc.', maxLength: 50 },
          closeDate: { type: 'string', description: 'Expected close date, quarter, or year. Examples: "Q2 2026", "2026-09-30", "H1 2026".', maxLength: 30 },
          approvals: {
            type: 'array',
            description: 'List of pending approvals (e.g., ["shareholder vote", "HSR clearance", "FCC approval"]). Max 5 items.',
            maxItems: 5,
            items: { type: 'string', description: 'Single approval gate', maxLength: 60 }
          },
          rationale: { type: 'string', description: 'One-sentence strategic rationale: why this deal matters to shareholders. What was previously captured in counterpartyContext.', maxLength: 200 }
        },
        required: ['counterparty']
      },
      financialImpact: {
        type: 'string',
        description: withGroundingNote('Specific financial impact with dollar amounts and percentages (e.g., "Revenue of $12.5B, up 15% YoY")'),
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
      },
      governanceContext: {
        type: 'string',
        description: 'For governance filings (Item 5.02, 5.07): Who are the directors involved, their background, and why the change matters to shareholders',
        maxLength: 300
      },
      whyItMatters: WHY_IT_MATTERS_PROPERTY,
      headline: {
        type: 'string',
        description: 'One compelling sentence (max 200 chars) summarizing the most material fact for email display. Be specific with names and numbers. Never start with "This filing..." or generic prefixes.',
        maxLength: 200
      },
      emailSubject: {
        type: 'string',
        description: 'Email subject line. Format: "TICKER: [key fact]". Must start with ticker symbol. For Item 2.03 (debt) and Item 1.01 (M&A): target ≤55 chars, omit filler verbs ("Issued", "Announced", "Prices", "Offers") — lead with raw amounts + tranche count (2.03) or counterparty + value (1.01). For other items: 40-80 chars. Must be compelling enough to open.',
        maxLength: 80
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
            code: { type: 'string', description: 'REQUIRED: Raw SEC transaction code letter from Column 3 (e.g., P, S, A, D, G, M, F, J, K, X, C, W). Single uppercase letter exactly as shown in the filing.' },
            type: { type: 'string', description: 'Human-readable transaction type: Purchase, Sale, Award/Grant, Gift, Exercise, Disposition, Transfer. Use the full word, not the letter code.' },
            shares: { type: 'string', description: withGroundingNote('REQUIRED: Number of shares with commas (from column 5). Extract from table or calculate from value/price as stated.') },
            pricePerShare: { type: 'string', description: withGroundingNote('REQUIRED: Price per share with $ from column 4 - if $0, check if this is a gift/grant.') },
            date: { type: 'string', description: 'Transaction date from column 2 (YYYY-MM-DD)' },
            acquisitionDisposition: { type: 'string', description: 'A for acquired, D for disposed' },
            sharesOwnedFollowing: { type: 'string', description: withGroundingNote('Amount of Securities Beneficially Owned Following Reported Transaction. For Table I use Column 5 (shares of common stock). For Table II use Column 11 (derivative securities remaining, e.g., stock options). Total shares/securities held after this transaction.') },
            securityType: { type: 'string', description: 'Security type exactly from filing table header: "Common Stock", "Stock Option (Right to Buy)", "Restricted Stock Unit", "Performance Stock Unit". Copy verbatim from the Title of Security column.' },
            ownershipForm: { type: 'string', description: 'D for Direct, I for Indirect ownership. From Column 7 of Table I or Table II.' },
            ownershipNature: { type: 'string', description: 'Nature of indirect ownership (e.g., "By Family Trust", "By LLC", "By Spouse"). From Column 8. Only populate for indirect ownership.' }
          },
          required: ['code', 'type', 'shares', 'pricePerShare', 'sharesOwnedFollowing']
        }
      },
      totalValue: {
        type: 'string',
        description: withGroundingNote('Sum of (shares × price) for each transaction, computed only when both shares and price are explicitly stated. Format as "$X,XXX,XXX".'),
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
      },
      vestingDetails: {
        type: 'string',
        description: 'Vesting schedule from footnotes if present (e.g., "25% vests annually starting March 15, 2026"). Include plan name and key dates. Empty string if no vesting info found.',
        maxLength: 300
      },
      postTransactionCommonShares: {
        type: 'string',
        description: 'AUTHORITATIVE post-transaction Common Stock holdings. Locate Table I (Non-Derivative Securities). Find the row whose Title of Security equals "Common Stock" (or "Class A Common Stock", etc.) AND whose Ownership Form (Column 7) is "D" (Direct). Take the value from Column 5 ("Amount of Securities Beneficially Owned Following Reported Transaction") of the LAST-DATED such row. Return digits only, no commas, no suffix (e.g., "14900"). CRITICAL: Do NOT use Table II (derivative) values like RSU or option counts. Do NOT use Indirect (I) holdings. If there is no Common Stock Direct row in Table I, leave empty string.',
        maxLength: 30
      }
    }
  },

  '144': {
    type: 'object',
    required: ['company', 'summary', 'filerName', 'shares', 'estimatedValue', 'remainingHoldings', 'signalStrength', 'sharesOutstanding'],
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
        description: withGroundingNote('Number of shares to be sold with commas (e.g., "40,000")'),
        maxLength: 50
      },
      estimatedValue: {
        type: 'string',
        description: withGroundingNote('Estimated sale value with $ (e.g., "$9.9M" or "$9,916,000")'),
        maxLength: 50
      },
      pricePerShare: {
        type: 'string',
        description: withGroundingNote('Approximate price per share with $ (e.g., "$248")'),
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
        description: withGroundingNote('Amount of Securities Beneficially Owned Following Reported Transaction(s) - total shares still held after sale (e.g., "1,500,000")'),
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
      },
      sharesOutstanding: {
        type: 'string',
        description: withGroundingNote('REQUIRED: "Number of Shares or Other Units of the Class Outstanding" - total shares outstanding for the security class (e.g., "3,700,000,000"). Extract from the securitiesInformation section.'),
        maxLength: 50
      }
    }
  },

  '3': {
    type: 'object',
    required: ['company', 'summary', 'filerName', 'ownershipPercentage'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      filerName: {
        type: 'string',
        description: 'Name of the reporting person (insider)',
        maxLength: 150
      },
      filerRole: {
        type: 'string',
        description: 'Relationship: Officer, Director, 10% Owner, or Other',
        maxLength: 100
      },
      ownershipPercentage: {
        type: 'string',
        description: 'Beneficial ownership percentage (e.g., "5.2%")',
        maxLength: 20
      },
      sharesOwned: {
        type: 'string',
        description: withGroundingNote('Number of shares beneficially owned (e.g., "500,000")'),
        maxLength: 50
      },
      securitiesHeld: {
        type: 'array',
        description: 'Securities held at time of becoming insider (Table I: non-derivative, Table II: derivative)',
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            securityType: { type: 'string', description: 'Type of security (e.g., "Common Stock", "Stock Option")' },
            shares: { type: 'string', description: withGroundingNote('Number of shares or units') },
            ownershipForm: { type: 'string', description: 'D for Direct, I for Indirect' }
          }
        }
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
        description: withGroundingNote('Number of shares owned (e.g., "15,000,000")'),
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
        description: withGroundingNote('Number of shares owned'),
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
        description: withGroundingNote('Total offering amount with $ (e.g., "$500,000,000")'),
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
      },
      whyItMatters: WHY_IT_MATTERS_PROPERTY
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
        description: withGroundingNote('Total offering size with $ (e.g., "$500M", "$1.2B")'),
        maxLength: 30
      },
      priceRange: {
        type: 'string',
        description: 'Expected price range (e.g., "$18-$21 per share")',
        maxLength: 50
      },
      sharesOffered: {
        type: 'string',
        description: withGroundingNote('Number of shares being offered (e.g., "25,000,000")'),
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
        description: 'Exchange where shares will be listed (e.g., "NYSE", "NASDAQ"). Leave null when not disclosed in the filing.',
        maxLength: 30
      },
      whyItMatters: WHY_IT_MATTERS_PROPERTY
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
        description: withGroundingNote('Total offering amount with $ (e.g., "$500M"). For shelf S-3s authorizing "any combination of securities" up to a single cap, use that cap; do not split across security types when not allocated.'),
        maxLength: 50
      },
      sharesOffered: {
        type: 'string',
        description: withGroundingNote('Number of shares being registered (e.g., "10,000,000")'),
        maxLength: 30
      },
      dilutionImpact: {
        type: 'string',
        description: withGroundingNote('Estimated dilution impact on existing shareholders (e.g., "5% dilution")'),
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
            shares: { type: 'string', description: withGroundingNote('Shares being sold'), maxLength: 30 }
          },
          required: ['name', 'shares']
        }
      },
      shelfRegistration: {
        type: 'object',
        description: 'Shelf registration details if applicable',
        properties: {
          totalAuthorized: { type: 'string', description: withGroundingNote('Total amount authorized'), maxLength: 50 },
          remainingCapacity: { type: 'string', description: withGroundingNote('Remaining capacity'), maxLength: 50 },
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
        description: withGroundingNote('Price per share if fixed (e.g., "$45.00")'),
        maxLength: 30
      },
      whyItMatters: WHY_IT_MATTERS_PROPERTY
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
      },
      whyItMatters: WHY_IT_MATTERS_PROPERTY
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

  'DEFA14A': {
    type: 'object',
    required: ['company', 'summary'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      materialType: {
        type: 'string',
        description: 'Type of supplemental material (shareholder letter, investor presentation, press release, supplemental disclosure)',
        maxLength: 100
      },
      meetingDate: {
        type: 'string',
        description: 'Annual/special meeting date this material relates to (YYYY-MM-DD)',
        maxLength: 20
      },
      filerIdentity: {
        type: 'string',
        description: 'Who filed this material: the company itself, or an activist/shareholder group (name them)',
        maxLength: 200
      },
      keyProposals: {
        type: 'array',
        description: 'Proposals being advocated for or against, with vote recommendations',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            proposal: { type: 'string', description: 'Description of the proposal' },
            recommendation: { type: 'string', description: 'FOR, AGAINST, or ABSTAIN' }
          }
        }
      },
      newInformation: {
        type: 'string',
        description: 'What this adds beyond the original proxy statement (updated figures, new recommendations, etc.)',
        maxLength: 500
      }
    }
  },

  'FWP': {
    type: 'object',
    required: ['company', 'summary', 'offeringType'],
    properties: {
      ...BASE_SCHEMA_PROPERTIES,
      offeringType: {
        type: 'string',
        description: 'Type of offering: IPO, follow-on equity, debt, structured notes, convertible',
        maxLength: 50
      },
      updatedTerms: {
        type: 'string',
        description: 'Updated pricing, deal size, or timing vs base prospectus',
        maxLength: 300
      },
      keyHighlights: {
        type: 'array',
        description: 'Key selling points or investor highlights from the FWP',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            highlight: { type: 'string', description: 'Key point or updated term' }
          }
        }
      },
      underlyingReference: {
        type: 'string',
        description: 'For structured notes: underlying index, stock, or commodity reference',
        maxLength: 100
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
/**
 * Universal grounding block (PR 3 of the anti-hallucination plan).
 *
 * Strict json_schema mode (Phase F) forces the model to emit values for
 * every required property. The strict-schema converter makes optional
 * fields `type: ['X', 'null']`, which means null IS a valid emission - but
 * the model needs to be reminded that null is the *preferred* emission for
 * unknowns. Without this universal block, anti-hallucination pressure
 * exists only in fields whose individual descriptions explicitly forbid
 * inference. The other ~25 numeric fields across all 12 schemas have no
 * such pressure.
 *
 * Gated on process.env.GROUNDING_PROMPT_ENABLED !== '0' so SREs can flip
 * the env without redeploy if the block makes the model emit nulls
 * everywhere (empty-field rate spike).
 */
const GROUNDING_BLOCK = `=== GROUNDING RULES (apply to every field) ===

1. NULL IS PREFERRED OVER INVENTED. For any optional or nullable field, emit null when the filing does not explicitly state the value. Inventing a "reasonable" number, date, percentage, or share count is a serious failure - the email pipeline ships your output to shareholders who will treat numbers as facts.

2. ONLY WHAT THE FILING LITERALLY STATES. Every dollar amount, share count, percentage, fiscal date, person's name, transaction code, and ticker symbol you emit must appear in the source document - either verbatim or as a trivially derived figure (e.g., "$5,000,000,000" -> "$5B" formatting is fine; computing "$5B from 1B shares times $5/share" when shares aren't stated is NOT fine).

3. NO EXTRAPOLATION. Do not "fill in" plausible numbers based on context, prior filings, industry benchmarks, or what a similar company did. If the document doesn't state the figure, the field is null.

4. WHEN UNSURE, ABSTAIN. If a field's value requires inference from context you don't have, emit null. The downstream renderer hides empty fields gracefully; it cannot detect a fabrication.

5. PROSE FIELDS (whyItMatters, summary, headline) MUST NOT INVENT FACTS. They synthesize what the filing literally says. Substituting a different company's name or ticker (e.g., "Tesla" or "$NVDA" in a JPMorgan filing) is a critical failure - the post-validator will reject the entire field.
`;

/**
 * S-3-specific grounding addendum. Most shelf S-3s authorize a single
 * combined cap across "any combination of securities" without breaking
 * down debt vs equity vs warrants. List the categories without amounts
 * when the filing doesn't allocate.
 *
 * Kept out of the universal block because the per-bucket rule is editorial
 * bias for one form type (the other 11 schemas don't have shelf-bucket
 * structure).
 */
const S3_GROUNDING_ADDENDUM = `
=== S-3 SHELF-SPECIFIC RULE ===

NO PER-BUCKET ALLOCATIONS THAT AREN'T DISCLOSED. Most shelf S-3s authorize a single combined cap across "any combination of securities" without breaking down debt vs equity vs warrants. List the categories without amounts when the filing doesn't allocate.
`;

const BASE_SYSTEM_PROMPT = `CRITICAL: You must respond with ONLY valid JSON. No other text.

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
- For complex filings, structure as: [Headline fact] + [Key context] + [Significance]
- Vary your verbs to avoid repetition:
  * Sales: "sold", "divested", "offloaded", "shed", "liquidated"
  * Purchases: "acquired", "bought", "purchased", "scooped up", "added"
  * Grants: "granted", "awarded", "received", "secured"
  * Avoid overusing any single verb - mix it up for readability
- Acronym usage:
  * Expand uncommon acronyms on first use: "TSR (Total Shareholder Return)", "PSU (Performance Stock Units)"
  * After expansion, subsequent use of the acronym alone is acceptable
  * Common acronyms OK without expansion: CEO, CFO, SEC, IPO, M&A
  * Financial metrics: Spell out "year-over-year" on first use, then "YoY"

NEVER use these words or phrases in summaries:
- "snag", "snagged", "snags" (use "acquired", "secured", "obtained")
- "game-changer", "game-changing" (use "significant", "transformative")
- "dive into", "deep dive" (use "examine", "analyze", "review")
- "boasts" (use "features", "includes", "offers")
- "whopping" (use the actual number - let it speak for itself)
- "in a nutshell" (just state the summary directly)
- "at the end of the day" (remove entirely - adds no value)
- "going forward" (use "in the future" or "next quarter")
- "robust" (use "strong", "resilient", "solid")
- "leverage" as a verb (use "use", "utilize", "employ")

EXAMPLES - BAD vs GOOD writing style:
BAD: "Tesla snagged a whopping $2B contract"
GOOD: "Tesla secured a $2B contract"

BAD: "This game-changing acquisition boasts robust synergies"
GOOD: "The $1.2B acquisition creates $200M in projected annual synergies"

BAD: "Let's dive into the company's robust revenue growth going forward"
GOOD: "Revenue grew 25% to $12.5B. Management expects 15-20% growth next quarter."`;

/**
 * Compose the runtime system prompt: optional grounding block prepended to
 * the base prompt. Gated on GROUNDING_PROMPT_ENABLED env so SREs can flip
 * without redeploy.
 */
function buildSystemPrompt(formType?: string): string {
  if (process.env.GROUNDING_PROMPT_ENABLED === '0') {
    return BASE_SYSTEM_PROMPT;
  }
  const blocks: string[] = [GROUNDING_BLOCK];
  if (formType === 'S-3') blocks.push(S3_GROUNDING_ADDENDUM);
  blocks.push(BASE_SYSTEM_PROMPT);
  return blocks.join('\n');
}


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
 * Updated: Phase 4 research findings integrated
 */
const FORM_EXTRACTION_GUIDANCE: Record<string, string> = {
  '10-K': `10-K ANNUAL REPORT EXTRACTION RULES:
- DOCUMENT STRUCTURE: 10-K has 4 parts with 16 items:
  * Part I (Items 1-4): Business, Risk Factors, Properties, Legal
  * Part II (Items 5-9A): Market, Selected Financial, MD&A, Financial Statements, Controls
  * Part III (Items 10-14): Directors/Exec Comp (often incorporated by reference to DEF 14A)
  * Part IV (Item 15): Exhibits and Financial Statement Schedules
- REQUIRED FINANCIAL METRICS (must include ALL of these in financialHighlights):
  1. Revenue - Total annual revenue with YoY change (e.g., "$130.5B (+114%)")
  2. Net Income - Annual net income with YoY change
  3. Gross Margin - ALWAYS calculate and include (Revenue - COGS) / Revenue as percentage (e.g., "75.0%")
  4. EPS - Earnings per share (diluted) with YoY change
  5. Operating Income - If materially different from net income
  6. Free Cash Flow - If disclosed
- MD&A KEY METRICS: Extract liquidity metrics (Days Sales Outstanding, Days Payable Outstanding), leverage ratios, and management's KPIs
- FOOTNOTE-FIRST APPROACH: Read financial statement footnotes carefully - they often contain critical context (accounting policy changes, contingent liabilities, segment detail)
- RISK FACTOR ANALYSIS: Compare to prior year - note NEW risks added and any removed. Risk factors should be specific and quantified (e.g., "Tariff exposure could reduce margins by 5%")
- HUMAN CAPITAL METRICS (required since 2020): Employee count, turnover rates, DEI metrics if disclosed
- Gross margin is a MANDATORY metric for investors - if not explicitly stated, calculate it from revenue and cost of revenue/COGS
- Include segment breakdown if the company has multiple business units
- For fiscal year, extract the EXACT year (e.g., "2024" or "FY2025")
- The summary MUST lead with: company name, total revenue, and profitability highlight
- DELTA-AWARE: Compare revenue, margins, and key metrics to the PRIOR fiscal year. State the direction and magnitude of change for each metric (e.g., "Revenue $130.5B, up 14% from $114.5B in FY2023")
- For each financial highlight, include the "change" field with the YoY delta (e.g., "+14.0%", "-2.3pp for margins")
- If historical context about this company is provided, highlight what is NEW or materially different vs the prior annual report

MATERIALITY SIGNAL (4-tier classification, symmetric — big beats are as material as big misses):
- HIGH    — Any of: (a) revenue or net income beats OR misses prior year by >10% in either direction, (b) NEW material risk factor not present in the prior 10-K, (c) going-concern language anywhere in Item 1A or auditor's report, (d) control deficiency disclosed in Item 9A, (e) CEO/CFO/Chair departure announced, (f) major segment write-down or impairment >5% of total assets, (g) major restatement of prior-year financials, (h) material acquisition or divestiture announced or closed during the period.
- MEDIUM  — Any of: (a) noteworthy guidance change or revised outlook in MD&A, (b) segment realignment or new segment introduced, (c) accounting principle change, (d) 5-10% YoY revenue or earnings shift in either direction, (e) new material legal proceeding short of "material adverse effect", (f) auditor change, (g) major new product line launched (not just routine product refresh).
- LOW     — Routine annual filing. Numbers in line with prior year (<5% variance in either direction). No new risk factors. No leadership change. No accounting change. Boilerplate MD&A.
- NOISE   — Filings with NO material content. Reserved for: amended 10-K/A correcting a single typo or administrative detail; shell-company or dormant-entity annual; transition reports with no operating results. Do NOT classify a routine large-cap annual as NOISE — that is LOW.
- RATIONALE: One sentence (40-400 chars) citing specific filing evidence — Item number, named section, or directly-quoted phrase. NEVER generic.

WHY-IT-MATTERS WRITING RULES (10-K):
- CRITICAL: whyItMatters is the ONLY interpretive prose in the email. The "What to Watch" section is no longer rendered — the forward-looking risks that would have lived there must be folded INTO this whyItMatters prose. Treat it as the consolidated synthesis section.
- Multi-paragraph output expected (2-3 short paragraphs separated by blank lines). Paragraph 1: material take (single most important read of the filing). Paragraph 2: forward-looking risks synthesized as prose (NOT a bulleted list). Paragraph 3 (optional): peer/sector framing from ENRICHMENT context.
- Compare voices across the inputs: the filing's own narrative tone in MD&A, vs market sentiment in the X-SENTIMENT block (factClaims + discussionSynthesis), vs peer/sector framing in the ENRICHMENT block. Note where they agree and where they diverge — that divergence is often the most material signal.
- Forward-looking risk paragraph: pull 2-3 specific risk factors from Item 1A (especially NEW ones not in the prior 10-K) and synthesize them. Do NOT list them as bullets. Do NOT just restate them. Write prose that connects the risks to the multi-year thesis.
- BAD: "Revenue grew 65% to $215.9B. Watch out for export controls, customer concentration, open-source models." (restatement + list)
- GOOD: "The $4.5B H20 write-down (Item 7) — biggest single-product charge in NVIDIA history — turns US-China export policy into a Tier-1 risk for the AI infrastructure thesis. The Street already priced the Data Center beat ($185B vs $172B consensus); bears are now pressing the new H200 25% US import tariff as the next leg of policy headwinds.\n\nThree forward concerns compound. Open-source frontier models appeared in Item 1A for the first time in any NVIDIA 10-K — a tacit admission that proprietary accelerator moats may be narrower than consensus assumes. Hyperscaler customer concentration (still unnamed in Item 1A but visible in the 10-K's revenue concentration disclosures) means a CSP capex pause hits revenue faster than the multi-product diversification narrative suggests. And the $17.5B in FY26 strategic investments in AI model makers is a bet that demand for accelerators is supply-constrained, not demand-constrained — a thesis that breaks if any of the model-maker bets fail to ship at expected scale."`,

  '10-Q': `10-Q QUARTERLY REPORT EXTRACTION RULES:
- DOCUMENT STRUCTURE: 10-Q has 2 parts:
  * Part I (Financial Information): Item 1 (Financial Statements), Item 2 (MD&A), Item 3 (Market Risk), Item 4 (Controls)
  * Part II (Other Information): Items 1-6 (Legal, Risk Factors, Sales, Defaults, Mine Safety, Other)
- ITEM 2 MD&A IS KEY: Most valuable section for investors - contains management's analysis of results

CRITICAL — CURRENT-PERIOD COLUMN ONLY:
- 10-Q income statements show MULTIPLE columns: current quarter, prior-year same quarter, current YTD, prior-year YTD. The "value" you report MUST be the CURRENT quarter (the period this 10-Q covers — matching the fiscalQuarter field), NEVER the prior-year comparison column.
- The current-period column is typically LEFTMOST, with the period-end date in the column header matching the filing date (e.g., "Three Months Ended November 30, 2025" — NOT "Three Months Ended November 30, 2024").
- If you see two dollar amounts side-by-side (e.g., "$611,256" then "$569,432"), the LEFT/FIRST is current — use that. The right is prior-year and is ONLY for computing YoY change.
- DO NOT copy figures from the "Historical Context" section at the top of the prompt — those are STALE summaries from PRIOR quarters. They are reference only; the authoritative numbers come from the current filing's financial statements.

REQUIRED FINANCIAL METRICS (must include ALL SIX in financialHighlights, in this exact order — the email scorecard renders them in order):
  1. Revenue - CURRENT quarter revenue with YoY AND QoQ % changes (e.g., "$611.02M (+7.07% YoY, +0.56% QoQ)")
  2. Gross Margin - (Revenue − COGS/Cost of services) ÷ Revenue, as percentage (e.g., "51.43%"). Report YoY/QoQ changes as percentage-point deltas formatted with a "%" suffix (e.g., "-1.33%", meaning the margin moved by 1.33 percentage points). If margin moved <0.005 percentage points, report "0.00%" not "flat".
  3. Operating Margin - Operating Income ÷ Revenue, as percentage (e.g., "30.27%"). Report YoY/QoQ changes as percentage-point deltas with "%" suffix. Do NOT include a separate "Operating Income $" row — the margin is more comparable.
  4. FCF Margin - Free Cash Flow ÷ Revenue, as percentage. FCF = Net cash from operating activities − capital expenditures (both from the Cash Flow Statement). Report YoY/QoQ changes as percentage-point deltas with "%" suffix.
     PERIOD MATCHING (this trips up most issuers):
     • Cash flow statements in 10-Qs are typically presented YTD only (e.g., "Six Months Ended February 28, 2026"), NOT for the 3-month current quarter.
     • If the cash flow statement shows a "Three Months Ended" column matching the current quarter, use it directly.
     • Otherwise, derive Q-only FCF: (current YTD FCF) − (prior-quarter YTD FCF from Historical Context summary). Then FCF Margin = Q-only FCF ÷ Q-only Revenue.
     • If neither path is reliable (no 3M column AND no prior-quarter Historical Context), return "N/A" for value/change/qoqChange — do NOT approximate from net income, and do NOT report YTD FCF margin as if it were Q-only.
     • "Capital expenditures" is the line typically labeled "Purchases of property, equipment, and leasehold improvements" or similar; if "Capitalized software" is also disclosed under investing activities, include it.
  5. Net Income - CURRENT quarter net income with YoY and QoQ % changes (e.g., "$133.06M (-8.15% YoY)")
  6. EPS (diluted) - Earnings per share, DILUTED (not basic) with YoY and QoQ % changes (e.g., "$3.59 (-6.75% YoY)")

VALUE FORMATTING (the "value" field, i.e. the "Latest" column):
- Dollar amounts MUST be reported to two decimal places: "$611.02M", "$133.06M", "$3.59" — NEVER "$611M" or "$3".
- Percentages (margins) MUST be reported to two decimal places: "51.43%" — NEVER "51%" or "51.4%".
- Use M/B suffixes for revenue / net income. Use raw dollar amount for EPS.
- For unavailable values, return the literal string "N/A".

YoY/QoQ COMPUTATION:
- YoY change = (current quarter ÷ prior-year same quarter − 1) × 100. The prior-year column is in the SAME income statement table.
- QoQ change = (current quarter ÷ immediately preceding quarter − 1) × 100. The preceding quarter is in the prior 10-Q (or 10-K Q4) — use Historical Context summaries for this comparison ONLY (never for the current "value" itself).
- For margin metrics, use percentage-point arithmetic: (current margin − prior margin), formatted with "%" suffix. The "%" suffix on margin deltas is a UNIT label, not a relative change.
- Report changes to TWO decimal places (e.g., "+7.42%", "-2.13%"). Single-decimal or integer percentages are unacceptable.
- Always populate both "change" (YoY) and "qoqChange". If the prior-quarter figure is not available, return "N/A" — do NOT leave the field empty and do NOT fabricate.

OTHER GUIDANCE:
- LIQUIDITY METRICS: Extract Days Sales Outstanding (DSO), Days Payable Outstanding (DPO) if disclosed - these indicate working capital health
- NON-GAAP MEASURES: If company uses non-GAAP metrics, note the GAAP comparison and reconciliation
- FOOTNOTE CONTEXT: Verify whether numbers are annualized vs quarterly, and whether they include/exclude subsidiaries
- Gross margin: if not explicitly stated, derive from (Revenue - Cost of Revenue) / Revenue using CURRENT-quarter columns
- Include quarterly trends (up/down/flat) for key metrics
- Extract guidance updates if management provides forward-looking statements
- RED FLAGS: Bloated inventory, slower demand signals, supply chain issues, decreasing profit margins
- For fiscal quarter, format as "Q3 2024" or "Q1 FY2025"
- The summary MUST lead with: company name, CURRENT quarter revenue, and margin performance
- Flag any metric that moved more than 10% in either direction, whether that is revenue, margins, or operating metrics

MATERIALITY SIGNAL (4-tier classification, symmetric — big beats are as material as big misses):
- HIGH    — Any of: (a) management cuts OR materially raises forward guidance, (b) quarterly revenue or EPS beats OR misses vs consensus by >5% in either direction (or vs prior quarter if no consensus), (c) NEW risk factor not present in last 10-K or last 10-Q, (d) control deficiency disclosed, (e) segment shutdown, divestiture, business-transfer agreement, or major restructuring announced, (f) material legal proceeding initiated or adverse judgment, (g) acquisition closed during the quarter with cash outflow >5% of revenue, (h) new product or service line launched (not just routine refresh).
- MEDIUM  — Any of: (a) guidance narrowed or reaffirmed with notable color change, (b) 3-5% YoY miss or beat on revenue/EPS, (c) working-capital flag (DSO or DPO swing >15%), (d) segment narrative shift (e.g., previously bullish segment now described cautiously), (e) accounting estimate change, (f) senior officer transition agreement (CMO, GC, CTO, head of major segment).
- LOW     — In-line quarter. Numbers within ±3% of prior year in either direction. No guidance change. No new risk factors. Routine MD&A. Standard buybacks and 10b5-1 plan disclosures only.
- NOISE   — Filings with NO material content beyond mechanical financial restatement. Reserved for: shell-company quarterly with no operations; pre-revenue entity routine submission. Do NOT classify a large-cap quarterly with full operating results as NOISE — that is LOW.
- RATIONALE: One sentence (40-400 chars) citing specific filing evidence — Item number, named section, or directly-quoted phrase. NEVER generic.

WHY-IT-MATTERS WRITING RULES (10-Q):
- CRITICAL: whyItMatters is the ONLY interpretive prose in the email. The "What to Watch" section is no longer rendered — forward-looking risks/concerns must fold INTO this whyItMatters prose. Treat it as the consolidated synthesis section.
- Multi-paragraph output expected (2-3 short paragraphs separated by blank lines). Paragraph 1: material take of the quarterly print (single most important investor read). Paragraph 2: forward-looking risks/concerns synthesized as prose. Paragraph 3 (optional): consensus or peer framing from ENRICHMENT context.
- Compare voices across the inputs: management's MD&A tone vs market sentiment in the X-SENTIMENT block (factClaims + discussionSynthesis) vs consensus expectation from the ENRICHMENT block. Where do they agree, where do they diverge? Divergence is often the most material signal — e.g., management is reassuring while the market is pressing on the print, or vice versa.
- Forward-looking risk paragraph: pull 2-3 specific concerns from this quarter's risk factors or MD&A (especially management language shifts vs prior quarter) and synthesize them. Do NOT list as bullets. Do NOT just restate them.
- BAD: "Comps fell 1.7%. Watch: tariffs, exec departures, slower growth." (restatement + list)
- GOOD: "Comps swung from +7.4% to -1.7% YoY in a 60-day window where the CMO and GC both filed Transition Agreements and the CEO adopted his first 10b5-1 plan — a coordinated repositioning that the $701M Q1 buyback (vs $378M prior year) reads as management trying to paper over. Street had Q1 comps at +1.2%; this is the first negative-comp print since 2017.\n\nThree near-term concerns compound. The CMO and GC departures in the same week leave brand-marketing and litigation tracks without continuity heading into the H2 comp-recovery pivot the Street is pricing in. 2025 food/beverage/packaging tariffs added 0.2pp to Q1 costs and management guided 15bp scale-up in 2026 — pressuring the gross-margin trajectory just as comps are turning. And the aggressive buyback pace ($701M Q1 alone) means the cash buffer for organic recovery investments is shrinking, raising the stakes on the next two quarters."
- QoQ DATA REQUIREMENT: When historical context is provided above (prior-quarter summaries), you MUST populate qoqChange on EVERY financialHighlights row. If the prior-quarter value isn't extractable, write "N/A" — never leave qoqChange empty when historical context exists.`,

  '3': `FORM 3 INITIAL STATEMENT OF BENEFICIAL OWNERSHIP EXTRACTION RULES:
- COMPANY FIELD IS REQUIRED: The "company" field must contain the ISSUER name (the company whose securities are held). Extract from "Name of Issuer" field on the form. NEVER leave blank.
- DOCUMENT TYPE: Filed when a person becomes an insider (officer, director, or 10%+ owner) — reports their initial holdings
- This is NOT a transaction — it is a snapshot of what the insider already owns at the time they become a reporting person
- KEY FIELDS TO EXTRACT:
  1. Filer name (from "Reporting Person" field)
  2. Company name (from "Issuer" field) — REQUIRED, must not be blank
  3. Filer role: Officer, Director, 10% Owner, or Other (from Relationship checkboxes)
  4. Ownership percentage (calculate if not stated: shares owned / shares outstanding)
  5. Shares owned (total from Table I and Table II)
- TABLE I (Non-Derivative Securities): Common stock, preferred stock held directly
- TABLE II (Derivative Securities): Stock options, warrants, RSUs, convertible securities
- For each security: extract type, shares/units, and ownership form (Direct vs Indirect)
- If ownership is indirect, note the nature (e.g., "By Trust", "By Spouse", "By LLC")
- The summary MUST lead with: filer name, company name, role, and total shares owned`,

  '4': `FORM 4 EXTRACTION RULES:
- TABLE STRUCTURE:
  * Table I - Non-Derivative Securities: Direct stock ownership (common shares)
  * Table II - Derivative Securities: Options, warrants, convertible securities
- CRITICAL: Column 5 has the number of shares - ALWAYS extract this value. Never leave blank.
- Column 4 has the transaction price - if blank or $0, note this is likely a gift, grant, or tax withholding
- COMPLETE TRANSACTION CODE MAPPING (Column 3):
  * P = Open market Purchase (BULLISH - insider buying with own money)
  * S = Open market Sale (may be routine or concerning depending on context)
  * A = Award/Grant (equity compensation - NOT a purchase, don't confuse with P)
  * D = Disposition to issuer (return of shares, often for tax withholding)
  * G = Gift (transfer without consideration)
  * M = Exercise of derivative (option exercise)
  * F = Payment of exercise price or tax with shares (tax withholding)
  * J = Other acquisition/disposition (discretionary transaction)
  * K = Equity swap or similar (derivative transaction)
  * X = Exercise of out-of-money derivative (expiration exercise)
  * C = Conversion of derivative security
  * W = Acquisition/disposition by will or laws of descent
- COMMON PITFALL: Code "A" is Award/Grant, NOT Acquisition/Purchase - don't report grants as bullish buying signals
- Column 8 (A or D) indicates Acquisition or Disposition
- Calculate total value = shares × price for each transaction
- If shares field is missing but total value is available, calculate shares = totalValue / price
- 10b5-1 PLAN DETECTION (UPDATED APRIL 2023):
  * SEC now REQUIRES checkbox indicating if transaction is pursuant to 10b5-1 plan
  * Look for "10b5-1" checkbox marked in filing header
  * Check for plan adoption date and modification date (new requirement)
  * Check footnotes for: "pursuant to a 10b5-1", "Rule 10b5-1", "pre-arranged trading plan"
  * If checkbox marked OR language found = has10b51Plan: true
  * If no checkbox/mention = has10b51Plan: false
- FOOTNOTES ARE CRITICAL: Often contain essential context about the transaction (vesting schedules, plan details, related transactions)
- SECURITY TYPE: Copy the security type verbatim from the "Title of Security" column in Table I or Table II (e.g., "Class A Common Stock", "Stock Option (Right to Buy)", "Restricted Stock Unit"). Put in securityType field for each transaction.
- OWNERSHIP FORM: Column 7 indicates Direct (D) or Indirect (I) ownership. Column 8 shows the nature of indirect ownership (e.g., "By Family Trust", "By LLC"). Extract ownershipForm and ownershipNature for every transaction.
- VESTING DETAILS: Check footnotes for vesting schedules. Look for "vesting schedule", "vest", "annual installments", "quarterly vesting", specific dates. Populate vestingDetails with a concise schedule summary. Leave empty if no vesting info found.
- **CRITICAL** POST-TRANSACTION OWNERSHIP — sharesOwnedFollowing is REQUIRED for EVERY transaction:
  * You MUST populate sharesOwnedFollowing on every transaction object. This field drives the ownership change display.
  * Table I (Non-Derivative): Extract from Column 5 — total shares of common stock remaining after this transaction
  * Table II (Derivative): Extract from Column 11 — total derivative securities remaining (e.g., stock options)
  * If the exact column value is not visible, extract from footnotes or the text "Amount of Securities Beneficially Owned Following Reported Transaction(s)"
  * NEVER omit this field. If truly unavailable after checking all sources, use "unknown" rather than omitting it.
- **CRITICAL** TOP-LEVEL postTransactionCommonShares — authoritative final Common Stock holdings:
  * In ADDITION to per-transaction sharesOwnedFollowing, populate the top-level postTransactionCommonShares field.
  * Source: Table I (Non-Derivative), last-dated row where Title of Security is "Common Stock" (or "Class A/B/C Common Stock") AND Ownership Form Column 7 is "D" (Direct). Take Column 5 of THAT row.
  * MUST NOT use Table II values (RSUs, options, derivative securities). Those are a different category of holding.
  * MUST NOT use Indirect (I) holdings — those are reported separately and should not be conflated.
  * If the filing reports both Class A and Class B Common Stock Direct rows, use the row matching the class that was transacted. If unclear, prefer Class A.
  * Format: digits only, no commas, no suffix. Example: "14900" (NOT "14,900 shares").
  * Leave empty string ("") if no Common Stock Direct row exists in Table I (e.g., derivative-only filings).
  * WHY THIS FIELD EXISTS: Production bug 2026-04-15 (AAPL Parekh) — the LLM's summary-level holdings figure incorrectly pulled from a Table II RSU row (15,331) instead of Table I Column 5 Common Stock Direct (14,900). This field is the authoritative override.
- TABLE II DERIVATIVE TRANSACTIONS (MUST NOT BE SKIPPED):
  * If a filing has ONLY Table II entries and NO Table I entries, you MUST still populate the transactions array
  * Stock option grants: code='A', type='Award/Grant', shares=[number of options], pricePerShare='$0', acquisitionDisposition='A'
  * Option exercises: code='M', type='Exercise', shares=[number exercised], pricePerShare=[exercise price]
  * Conversions: code='C', type='Conversion', shares=[number converted]
  * For derivative grants at $0, the sharesOwnedFollowing represents derivative securities count, not equity shares
- The summary MUST include: ticker, insider name, transaction type, SHARE COUNT, dollar amount, and signal assessment`,

  '8-K': `8-K EXTRACTION RULES:
- FILING DEADLINE: Must be filed within 4 BUSINESS DAYS of triggering event (except Item 8.01)
- COMPLETE ITEM NUMBER MAPPING (organized by section):
  SECTION 1 - Business and Operations:
    * Item 1.01: Entry into Material Definitive Agreement (M&A, major contracts)
    * Item 1.02: Termination of Material Definitive Agreement
    * Item 1.03: Bankruptcy or Receivership (CRITICAL - major red flag)
    * Item 1.05: Material Cybersecurity Incidents (NEW Dec 2023 - 4 day disclosure required)
  SECTION 2 - Financial Information:
    * Item 2.01: Completion of Acquisition/Disposition of Assets
    * Item 2.02: Results of Operations and Financial Condition (earnings)
    * Item 2.03: Creation of Direct Financial Obligation (new debt)
    * Item 2.04: Triggering Events (debt covenant violations, acceleration)
    * Item 2.06: Material Impairments (goodwill writedowns, asset impairments)
  SECTION 3 - Securities and Trading:
    * Item 3.02: Unregistered Sales of Equity Securities
    * Item 3.03: Material Modification to Rights of Security Holders
  SECTION 4 - Accountants and Financial Statements:
    * Item 4.01: Changes in Certifying Accountant (auditor change - scrutinize reason)
    * Item 4.02: Non-Reliance on Previously Issued Financial Statements (RESTATEMENT - major red flag)
  SECTION 5 - Corporate Governance:
    * Item 5.02: Departure/Appointment of Directors or Principal Officers
    * Item 5.03: Amendments to Articles/Bylaws
    * Item 5.07: Submission of Matters to Vote (shareholder meeting results)
  SECTION 7 - Regulation FD:
    * Item 7.01: Regulation FD Disclosure (investor presentations, guidance)
  SECTION 8 - Other:
    * Item 8.01: Other Events (optional, no 4-day deadline)
- HIGH-IMPACT ITEMS: 1.03 (bankruptcy), 1.05 (cyber), 2.06 (impairment), 4.02 (restatement), 5.02 (exec departure)
- TEMPLATE VARIABILITY: Unlike 10-K/10-Q, 8-Ks lack standardized format - companies present differently
- ALWAYS include: specific dollar amounts ($X.XB), percentage changes (+X% YoY), and key metrics
- Lead keyHighlights with the most investor-relevant fact
- If management provides a quote, include it in managementCommentary
- Sentiment: Set to "positive" for beats/good news, "negative" for misses/concerns, "neutral" for informational filings, "mixed" if both
- ITEM 2.03 DEBT TRANCHES: When itemNumbers includes "2.03" (Creation of Direct Financial Obligation — new debt issuance), you MUST populate the tranches[] array with one object per tranche/series of notes. For each tranche extract:
  * amountDisplay (REQUIRED): Formatted amount with currency symbol and scale, e.g., "¥265.0B", "$7.0B", "€500M". Preserve the original currency — do NOT convert to USD.
  * currency (REQUIRED): ISO 4217 code: "JPY", "USD", "EUR", "GBP", etc.
  * coupon: Coupon rate as stated, e.g., "3.25%", "SOFR + 125bps", "Floating". Omit if not disclosed.
  * yield: Yield to maturity if disclosed separately from coupon, e.g., "3.35%". Omit if same as coupon or not disclosed.
  * maturity: Maturity year or descriptor, e.g., "2030", "2055", "Perpetual". Omit if not disclosed.
  * spread: Spread over benchmark if disclosed, e.g., "+75bps over UST". Omit if not disclosed.
  * Do NOT populate tranches[] for Item 2.04 (covenant violations/acceleration) — only Item 2.03 new issuance.
  * Do NOT populate tranches[] for redemptions, refinancings without new issuance, or credit facility draws that aren't issued notes.
  * When tranches[] is populated, do NOT duplicate tranche-level data (amounts, coupons, maturities) in keyHighlights — keyHighlights should cover non-tranche material facts only (use of proceeds, rating, covenants, etc.).
- ITEM 1.01 / 2.01 DEAL TERMS: When itemNumbers includes "1.01" (Material Definitive Agreement) or "2.01" (Completion of Acquisition), populate the dealTerms object:
  * counterparty (REQUIRED): The other party's legal name, e.g., "Globalstar, Inc.", "Microsoft Corporation".
  * dealValue: Total deal value as disclosed, e.g., "$1.2B", "€450M". Omit if not disclosed.
  * consideration: Form of consideration, e.g., "all-cash", "stock-for-stock", "mixed cash and stock", "cash plus contingent value rights". Omit if not disclosed.
  * closeDate: Expected or actual close date/quarter, e.g., "Q3 2026", "2026-06-30", "expected H2 2026". Omit if not disclosed.
  * approvals: Array of required approvals as short strings, e.g., ["shareholder vote", "HSR", "EU Commission", "CFIUS"]. Max 5 items. Omit if not disclosed.
  * rationale: One-sentence strategic rationale from the filing (max 200 chars), e.g., "Expands satellite connectivity for iPhone services." Omit if not stated in the filing.
- GOVERNANCE CONTEXT: If a "GOVERNANCE CONTEXT" section appears in the content, use it to populate the governanceContext field. Weave the directors' backgrounds and the significance of the governance change into the summary and keyHighlights to explain WHO the directors are and WHY the change matters.
- HEADLINE: Write ONE compelling sentence (max 200 chars) summarizing the most material fact. This appears as the email's bold lead sentence. Be specific — include names, numbers, and the key action. NEVER start with "This filing...", "This 8-K...", "This document...", or similar generic prefixes. Example: "AMZN entered a definitive merger agreement to acquire Globalstar, Inc. for $1.2B in cash."
- EMAIL SUBJECT: Write an email subject line starting with the ticker symbol. Format: "TICKER: [key fact]". Must be compelling enough to open.
  * For Item 2.03 (debt) and 1.01/2.01 (M&A): target ≤55 characters. OMIT filler verbs like "Issued", "Announced", "Prices", "Offers", "Enters into" — lead with the amount/counterparty directly. Example: "BRK.A: ¥265B yen + $7B USD notes (7 tranches)". Example: "AMZN: $1.2B Globalstar acquisition".
  * For other item types: target 40-80 characters.`,

  '144': `FORM 144 EXTRACTION RULES:
- COMPANY FIELD IS REQUIRED: The "company" field must contain the ISSUER name (the company whose stock is being sold, e.g., "Tesla, Inc."). Extract from "Name of Issuer" or "Issuer Name" on the form. This is NOT the filer — it is the company whose securities are being sold. NEVER leave blank.
- CRITICAL DISTINCTION: Form 144 is NOTICE OF INTENT TO SELL - shares have NOT been sold yet
  * This is a prospective filing declaring intent to sell under Rule 144
  * Actual sale may or may not occur - filing does not guarantee execution
- RULE 144 KEY REQUIREMENTS:
  * 90-DAY VALIDITY: Form 144 notice is valid for 90 days from filing date
  * VOLUME LIMITATIONS: Cannot sell more than the greater of:
    - 1% of outstanding shares, OR
    - Average weekly trading volume over preceding 4 weeks
  * HOLDING PERIOD: Securities must have been held for:
    - 6 months (for reporting companies)
    - 1 year (for non-reporting companies)
  * BROKER REQUIREMENT: Sales must be executed through a broker-dealer
- Extract filer name exactly as shown, and their title/role (CEO, Director, CFO, etc.)
- CRITICAL: Find the EXACT number of shares proposed for sale - look for "Amount of Securities to be Sold" or similar. Format with commas (e.g., "56,820")
- Calculate estimated value (shares × approx price per share) and format as "$X.XM" or "$X,XXX,XXX"
- REQUIRED: Extract "Amount of Securities Beneficially Owned Following Reported Transaction(s)" as remainingHoldings - this is the total shares the filer will STILL OWN after the proposed sale
- REQUIRED: Extract "Number of Shares or Other Units of the Class Outstanding" as sharesOutstanding - this is the TOTAL shares outstanding for the class (can be billions, e.g., "3,700,000,000" for Tesla). Format with commas.
- 10b5-1 PLAN REFERENCES: If mentioned, extract plan adoption date - pre-arranged plans are less concerning
- Check if filing mentions recent related sales by same insider for context (pattern of sales is more significant)
- The summary MUST lead with: ticker, insider name, shares count, and dollar value
- Signal assessment (2-level system):
  * "Notable Sale" - Use when: >$10M value, >5% of holdings, unusual timing, or part of large divestiture pattern
  * "Routine 10b5-1" - Use when: pre-planned under 10b5-1 trading plan, regular/scheduled sale, or small relative to holdings
- Write summary as: "[Name] ([Role]) proposes to sell [shares] [TICKER] shares worth [value]. Following this transaction, they will still hold [remainingHoldings] shares."`,

  'S-1': `FORM S-1 IPO REGISTRATION EXTRACTION RULES:
- This is an IPO REGISTRATION - company is going public for the first time
- CONFIDENTIAL FILING: Many companies file S-1 confidentially first under JOBS Act (especially Emerging Growth Companies)
- REQUIRED FIELDS:
  1. offeringSize - Total dollar amount being raised (e.g., "$500M")
  2. priceRange - IPO price range (e.g., "$18-$21 per share")
  3. sharesOffered - Number of shares being offered
  4. businessDescription - One-line company description
- HUMAN CAPITAL METRICS (REQUIRED since 2020): Employee count, key human capital measures
- FINANCIAL HIGHLIGHTS:
  * Extract Revenue, Net Income (or Net Loss), Gross Margin
  * For PRE-REVENUE COMPANIES (common in biotech/tech IPOs): Note cash runway, burn rate, R&D investment
  * For LOSS-MAKING COMPANIES: Note net loss, path to profitability if mentioned, and cash position
- RISK FACTOR ORGANIZATION:
  * Company-specific risks (most important for investors)
  * Industry/sector risks
  * General/regulatory risks (less unique)
- Extract underwriters (lead left, joint bookrunners) - usually Goldman, Morgan Stanley, JPMorgan, etc.
- Extract use of proceeds - typically: general corporate purposes, R&D, sales/marketing, debt repayment
- LOCK-UP PERIOD: Usually 180 days post-IPO for insiders - note if disclosed
- Note the exchange listing (NYSE/NASDAQ) and proposed ticker symbol
- The summary MUST lead with: company name, what they do, offering size, and notable metrics`,

  'S-3': `FORM S-3 SECONDARY OFFERING EXTRACTION RULES:
- S-3 is used by ALREADY PUBLIC companies for secondary offerings
- ELIGIBILITY REQUIREMENTS:
  * Public float must exceed $75 MILLION to file S-3
  * Must have timely SEC reporting history (12+ months)
  * Companies near $75M threshold are vulnerable to future ineligibility
- OFFERING TYPES (determine which applies):
  * Primary - Company selling NEW shares (dilutive to existing shareholders)
  * Secondary - Existing shareholders selling their shares (not dilutive)
  * Shelf Registration - Registering securities for FUTURE use (3-year validity)
  * ATM (At-The-Market) - Incremental sales at prevailing market prices over time
- WKSI (WELL-KNOWN SEASONED ISSUER) STATUS:
  * Requires $700M+ public float OR $1B+ in prior registered offerings
  * S-3ASR (Automatic Shelf) becomes effective immediately at filing
  * No SEC review delay - can issue immediately
- REQUIRED FIELDS:
  1. offeringType - Primary, Secondary, Shelf, or ATM program
  2. offeringAmount - Total dollar amount or number of shares
  3. dilutionImpact - Calculate approximate dilution to existing shareholders
- SHELF REGISTRATION DETAILS:
  * Note total capacity, remaining capacity, and expiration date
  * 3-YEAR VALIDITY - shelf expires 3 years from effective date
  * MEF FILINGS signal imminent use (can increase capacity by 20%)
- ATM OFFERING CHARACTERISTICS:
  * Incremental sales over time (not all at once like bought deal)
  * Sold at prevailing market prices through agent/dealer
  * Agent takes ~3% fee with zero principal risk
  * Better for raising smaller amounts over time
- PROSPECTUS SUPPLEMENTS: Actual offering terms often in supplements, not base S-3
- Extract selling shareholders if secondary sale (insiders, VCs, PE firms)
- Note use of proceeds if primary offering
- The summary MUST lead with: type of offering, amount, and dilution impact`,

  'DEF 14A': `DEF 14A PROXY STATEMENT EXTRACTION RULES:
- Proxy statements precede shareholder meetings for voting
- KEY SECTIONS TO EXTRACT:
  * CD&A (Compensation Discussion & Analysis) - Most detailed comp explanation
  * Summary Compensation Table - Standardized NEO compensation format
  * Director nominee biographies and qualifications
  * Proposal details with board recommendations
- REQUIRED FIELDS:
  1. meetingDate - When is the annual/special meeting
  2. executiveCompensation - CEO and NEO (named executive officer) total compensation
  3. ceoPayRatio - CEO to median employee pay ratio (e.g., "287:1")
  4. boardProposals - Management proposals requiring vote (director election, say-on-pay, auditor ratification)
  5. shareholderProposals - Any shareholder-submitted proposals
- EXECUTIVE COMPENSATION EXTRACTION:
  * Use Summary Compensation Table for standardized data
  * Total comp = Base Salary + Bonus + Stock Awards + Option Awards + Non-Equity Incentive + Pension + Other
  * Note year-over-year changes in CEO compensation
  * Extract performance metrics tied to incentive comp
- SAY-ON-PAY ANALYSIS:
  * SAY-ON-PAY THRESHOLD: <70% approval typically triggers ISS/Glass Lewis concern
  * Note prior year say-on-pay results if disclosed
  * If <50% approval, company must address in following year
- GOVERNANCE METRICS:
  * Board independence percentage (should be majority independent)
  * Board diversity (gender, racial, age)
  * Director qualifications matrix (skills/experience mapping)
  * Average board tenure and refreshment rate
- For director nominees: Note any contested elections or activist board candidates
- RELATED PARTY TRANSACTIONS: Must be disclosed - note any concerning relationships
- The summary MUST lead with: meeting date, key proposals, and notable compensation figures`,

  '11-K': `FORM 11-K EMPLOYEE PLAN EXTRACTION RULES:
- Form 11-K is the annual report for employee benefit plans (401(k), ESOP, etc.)
- FILING REQUIREMENTS:
  * DEADLINE: 90 days after plan fiscal year-end (180 days for ERISA plans)
  * AUDIT: Must be audited by PCAOB-registered accountant
  * Limited scope exemption (ERISA 103(a)(3)(C)) is NOT available for 11-K filers
  * Plans with 100+ participants require independent audit
- ERISA vs NON-ERISA PLANS:
  * ERISA plans follow ERISA financial reporting requirements
  * Non-ERISA plans follow SEC Regulation S-X Article 6A
  * Financial statement format differs between the two
- REQUIRED FIELDS:
  1. planName - Full name of the benefit plan
  2. planAssets - Total plan assets (net assets available for benefits)
  3. participantCount - Number of active participants
  4. contributionsReceived - Employee contributions during the year
  5. benefitsDistributed - Benefits/withdrawals paid out
- REQUIRED FINANCIAL STATEMENTS:
  * Statement of Net Assets Available for Benefits (comparative 2 years)
  * Statement of Changes in Net Assets Available for Benefits
  * Notes to Financial Statements
  * ERISA-required supplemental schedules if applicable
- Extract employer matching contribution amount
- INVESTMENT METRICS:
  * Note investment returns and any significant losses
  * Track year-over-year changes in plan performance
  * Identify administrative fees (impact participant returns)
- For ESOPs: Extract company stock holdings as percentage of total assets
- AUDIT OPINION: Clean opinion indicates proper management - note any qualified opinions or concerns
- Look for any audit findings or compliance issues
- Note the plan type: 401(k), profit sharing, ESOP, pension, etc.
- The summary MUST lead with: plan name, total assets, and net change in assets`,

  '424B2': `424B2 PROSPECTUS SUPPLEMENT EXTRACTION RULES:
- DOCUMENT TYPE: Filed under Rule 424(b)(2) — a pricing supplement for debt securities, structured notes, or equity-linked products registered on a shelf (S-3)
- KEY FIELDS TO EXTRACT:
  1. Issuer name (the company issuing the security)
  2. Offering type: Senior Notes, Subordinated Notes, Structured Notes, Medium-Term Notes, or other
  3. Principal amount / offering size (e.g., "$500,000,000")
  4. Maturity date (final redemption date)
  5. Interest rate or coupon (fixed, floating, or zero — specify)
  6. For floating rate: reference rate (SOFR, Fed Funds) + spread
  7. For structured notes: underlying reference (index, stock, commodity)
- PRICING DETAILS: Issue price, settlement date, CUSIP
- UNDERWRITERS: Lead bookrunners and co-managers if listed
- USE OF PROCEEDS: "General corporate purposes" is common — note if anything specific
- CREDIT RATING: Moody's / S&P / Fitch ratings if disclosed
- RISK: Note any call provisions (issuer can redeem early), make-whole provisions, or step-up features
- The summary MUST lead with: issuer name, offering type, principal amount, and interest rate`,

  'SC 13G': `SCHEDULE 13G BENEFICIAL OWNERSHIP EXTRACTION RULES:
- DOCUMENT TYPE: Filed by institutional investors, passive investors, or exempt investors to report ownership of 5%+ of a class of equity securities
- FILER TYPES:
  * Institutional investor (Rule 13d-1(b)) — banks, broker-dealers, insurance cos, investment companies
  * Passive investor (Rule 13d-1(c)) — acquired in ordinary course, no intent to change control
  * Exempt investor (Rule 13d-1(d)) — pre-existing holdings before Feb 5 reporting trigger
- KEY FIELDS TO EXTRACT:
  1. Filer name (the reporting entity or person)
  2. Issuer name and ticker (the company whose shares are owned)
  3. Ownership percentage (from Item 11 — percentage of class)
  4. Number of shares beneficially owned (from Item 9)
  5. Filing purpose: Initial filing, Amendment (note what changed), or Annual update
  6. Date of event that triggered filing
- AMENDMENT DETECTION: If "/A" in form type, compare to prior percentage if mentioned
- JOINT FILERS: Multiple entities may file jointly — list all reporting persons from Item 1
- The summary MUST lead with: filer name, issuer name, ownership percentage, and number of shares`,

  'SC 13D': `SCHEDULE 13D BENEFICIAL OWNERSHIP EXTRACTION RULES:
- DOCUMENT TYPE: Filed by investors with 5%+ ownership who have ACTIVIST intent or are NOT passive
- This is the "activist" filing — the filer may seek to influence or change the company
- KEY FIELDS TO EXTRACT:
  1. Filer name (from Item 2 — Identity and Background)
  2. Issuer name and ticker
  3. Ownership percentage (from Item 5 — Interest in Securities of the Issuer)
  4. Number of shares and class of securities
  5. Purpose of transaction (Item 4) — THIS IS THE MOST IMPORTANT FIELD
  6. Source of funds (Item 3) — personal funds, bank loan, margin
  7. Proposed actions: board seats, merger proposals, asset sales, management changes
- ITEM 4 ANALYSIS: Common purposes include:
  * "Investment purposes" (may still be activist if 13D not 13G)
  * Board representation or nominations
  * Opposition to proposed transaction
  * Proposal for strategic alternatives (sale, merger, spinoff)
  * Governance changes (bylaw amendments, proxy contest)
- JOINT FILERS: activist groups often file jointly — list all members
- The summary MUST lead with: filer name, ownership percentage, and stated purpose`,

  'DEFA14A': `DEFA14A ADDITIONAL PROXY SOLICITING MATERIAL EXTRACTION RULES:
- DOCUMENT TYPE: Additional proxy soliciting materials filed under Rule 14a-6 — supplements the main DEF 14A proxy statement
- These are often presentations, letters to shareholders, press releases, or supplemental disclosures
- KEY FIELDS TO EXTRACT:
  1. Company name
  2. Type of material: shareholder letter, investor presentation, supplemental disclosure, press release
  3. Meeting date (annual/special meeting it relates to)
  4. Key proposals being advocated for or against
  5. Any new information not in the original proxy (updated vote recommendations, revised figures)
- CONTEXT: Often filed by the company OR by activist shareholders running a proxy contest
- If filed by an ACTIVIST: note the activist's name and their slate/proposals
- If filed by the COMPANY: note what they're responding to or supplementing
- Vote recommendations: FOR/AGAINST/ABSTAIN for each proposal
- The summary MUST lead with: company name, filer identity, and what this material adds vs the base proxy`,

  'FWP': `FREE WRITING PROSPECTUS (FWP) EXTRACTION RULES:
- DOCUMENT TYPE: Filed under Rule 433 — marketing material for a securities offering that goes beyond the base prospectus
- Common during IPOs and follow-on offerings — often contains updated pricing, terms, or investor presentations
- KEY FIELDS TO EXTRACT:
  1. Issuer name
  2. Type of offering: IPO, follow-on equity, debt, structured notes, convertible
  3. Updated terms: price range, deal size, timing
  4. Key selling points or investor highlights
  5. Related registration statement number
- FWPs are often shorter and more marketing-oriented than formal prospectuses
- For structured notes FWPs: extract underlying reference, payoff structure, barrier levels
- For equity FWPs: extract updated price range, overallotment option, lock-up terms
- Note if this is a "term sheet" style FWP (common for structured notes) vs a "road show" FWP
- The summary MUST lead with: issuer name, offering type, and any updated pricing/terms`,
};

export function generateFilingPrompt(config: FilingPromptConfig): PromptOutput {
  const { formType: rawFormType, filingContent, enableEarningsMiniDeepDive } = config;

  // Canonicalize form type: '10-K/A' -> '10-K' + isAmendment, 'SCHEDULE 13G' -> 'SC 13G', etc.
  const { type: canonicalType, isAmendment } = canonicalizeFormType(rawFormType);

  // Get the schema for the canonical form type, falling back to Generic.
  // Strip materialitySignal when the earnings-mini-deep-dive flag is off —
  // single feature-flag gate at the prompt/schema layer.
  let schema = FORM_SCHEMAS[canonicalType] || FORM_SCHEMAS['Generic'];
  const isEarningsForm = canonicalType === '10-K' || canonicalType === '10-Q';
  const stripMateriality = isEarningsForm && !enableEarningsMiniDeepDive;
  if (stripMateriality && schema.properties && 'materialitySignal' in schema.properties) {
    const { materialitySignal: _omit, ...remainingProps } = schema.properties;
    schema = { ...schema, properties: remainingProps };
  }

  // Swap whyItMatters to the per-form upgraded version (400-char cap +
  // form-specific guidance forbidding metric restatement) when the flag is
  // on AND the form is 10-K/10-Q. Off-flag earnings filings keep the legacy
  // 180-char generic description so production behavior is unchanged for
  // non-cohort users.
  if (enableEarningsMiniDeepDive && isEarningsForm && schema.properties && 'whyItMatters' in schema.properties) {
    const upgraded = canonicalType === '10-K'
      ? WHY_IT_MATTERS_PROPERTY_10K
      : WHY_IT_MATTERS_PROPERTY_10Q;
    schema = {
      ...schema,
      properties: {
        ...schema.properties,
        whyItMatters: upgraded,
      },
    };
  }

  // Build the user prompt with schema FIRST, then content
  const schemaDescription = formatSchemaDescription(schema);

  // Get form-specific extraction guidance, using the canonical type.
  // Mirror the schema gate — strip the MATERIALITY SIGNAL rubric section AND
  // the WHY-IT-MATTERS WRITING RULES section when the flag is off, so the
  // model doesn't see contradictory guidance for the still-active legacy
  // 180-char WIM schema description.
  let extractionGuidance = FORM_EXTRACTION_GUIDANCE[canonicalType] || '';
  if (stripMateriality) {
    extractionGuidance = extractionGuidance.replace(
      /\n\nMATERIALITY SIGNAL \(4-tier classification[\s\S]*?\n- RATIONALE:[^`]*?(?=\n\n|$)/g,
      '',
    );
    extractionGuidance = extractionGuidance.replace(
      /\n\nWHY-IT-MATTERS WRITING RULES \(10-[KQ]\):[\s\S]*?(?=\n\n[A-Z]|$)/g,
      '',
    );
  }

  // Append amendment-specific guidance when filing is an amendment (/A)
  if (isAmendment) {
    extractionGuidance += `\n\nAMENDMENT FILING: This is an AMENDMENT (${rawFormType}), not an original filing. Compare to the original filing. Highlight what changed and WHY the amendment was filed. Lead your summary with the amendment reason.`;
  }

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
    systemPrompt: buildSystemPrompt(canonicalType),
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
      // Render inner item fields so the AI sees exact field names
      if (prop.items.type === 'object' && prop.items.properties) {
        const itemRequiredSet = new Set(prop.items.required || []);
        lines.push(`    Each item in "${key}" MUST have these fields:`);
        for (const [itemKey, itemProp] of Object.entries(prop.items.properties)) {
          const itemRequired = itemRequiredSet.has(itemKey) ? ' (REQUIRED)' : '';
          lines.push(`      "${itemKey}": "${(itemProp as { type: string }).type}"${itemRequired} - ${(itemProp as { description: string }).description}`);
        }
      }
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
  const { type: canonicalType } = canonicalizeFormType(formType);
  return FORM_SCHEMAS[canonicalType] || FORM_SCHEMAS['Generic'];
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
