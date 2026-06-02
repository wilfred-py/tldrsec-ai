/**
 * Context Window Management for Claude AI
 * 
 * This module provides utilities for intelligently managing the context window
 * for large documents, ensuring optimal use of token budgets and maintaining
 * coherence between document chunks.
 */

import { ContextWindowConfig, SECFilingSection, SECFilingType } from './prompt-types';

// Default configuration for different filing types.
// Exported so regression tests can pin load-bearing values (e.g. the 10-Q
// chunk size, which feeds the FCF / current-period extraction).
export const DEFAULT_CONTEXT_CONFIGS: Record<SECFilingType, ContextWindowConfig> = {
  '10-K': {
    maxChunkSize: 12000,      // Large enough for most sections of a 10-K
    overlapSize: 1000,         // Significant overlap to maintain context
    useSemanticChunking: true, // Use semantic boundaries when possible
    chunkStrategy: 'section-based', // Chunk by document sections
  },
  '10-Q': {
    // Bumped 8000→24000 so chunks span full income-statement tables.
    // Why: 10-Q income statements are wide (current Q + prior-year Q + YTD
    // columns) and routinely exceed 8k chars after the section heading. With
    // an 8k chunk, the table got truncated mid-row, leaving Grok with only
    // the prior-year comparison column visible — producing wrong "Latest"
    // figures (e.g., Apr 2026 FDS 10-Q reported $560M revenue instead of $611M).
    maxChunkSize: 24000,
    overlapSize: 2000,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  '8-K': {
    maxChunkSize: 4000,        // Smaller for event reports
    overlapSize: 400,
    useSemanticChunking: true,
    chunkStrategy: 'adaptive',
  },
  '20-F': {
    maxChunkSize: 12000,
    overlapSize: 1000,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  '6-K': {
    maxChunkSize: 8000,
    overlapSize: 800,
    useSemanticChunking: true,
    chunkStrategy: 'adaptive',
  },
  'S-1': {
    maxChunkSize: 10000,
    overlapSize: 1000,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  'S-4': {
    maxChunkSize: 10000,
    overlapSize: 1000,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  '424B': {
    maxChunkSize: 8000,
    overlapSize: 800,
    useSemanticChunking: true,
    chunkStrategy: 'adaptive',
  },
  'DEF 14A': {
    maxChunkSize: 8000,
    overlapSize: 800,
    useSemanticChunking: true,
    chunkStrategy: 'section-based',
  },
  'Generic': {
    maxChunkSize: 6000,        // Conservative default
    overlapSize: 600,
    useSemanticChunking: false,
    chunkStrategy: 'fixed',
  },
};

// Section-specific token budgets. Exported so the section-aware prompt builder
// (`buildSectionedPrompt`) can read per-section budgets when filling a total budget.
export const SECTION_TOKEN_BUDGETS: Record<SECFilingSection, number> = {
  'Risk Factors': 15000,        // Often lengthy and detailed
  'Management Discussion': 12000, // Substantial analysis
  'Business Overview': 10000,    // Company description (10-K Item 1, includes Competition)
  'Financial Statements': 8000,  // Structured data
  'Quantitative and Qualitative Disclosures': 4000, // 10-Q Item 3 / 10-K Item 7A
  'Legal Proceedings': 6000,     // Usually shorter
  'Controls and Procedures': 4000,
  'Corporate Governance': 5000,
  'Executive Compensation': 6000,
  'Material Changes': 4000,
  'Complete Document': 25000,    // For summarizing the entire filing
};

/**
 * Section priority for budget-constrained prompt assembly.
 *
 * Lower number = higher priority (1 = most important, never drops). When the
 * total token budget can't fit all extracted sections, `buildSectionedPrompt`
 * drops the highest-numbered priority sections first; Financial Statements
 * (priority 1) is preserved no matter what.
 *
 * For 10-Q/10-K:
 *   1. Financial Statements — the headline numbers the user cares most about
 *   2. Management Discussion — qualitative narrative on the quarter/year
 *   3. Risk Factors — material updates
 *   4. Business Overview — includes Competition (10-K only)
 *   5. Quantitative and Qualitative Disclosures (Item 3 / Item 7A)
 *   6+. Everything else
 */
export const SECTION_PRIORITY: Record<SECFilingSection, number> = {
  'Financial Statements': 1,
  'Management Discussion': 2,
  'Risk Factors': 3,
  'Business Overview': 4,
  'Quantitative and Qualitative Disclosures': 5,
  'Legal Proceedings': 6,
  'Material Changes': 7,
  'Controls and Procedures': 8,
  'Executive Compensation': 9,
  'Corporate Governance': 10,
  'Complete Document': 99, // Sentinel: only used for whole-document summaries
};

/**
 * A section extracted from a filing's cleaned markdown text. Pairs the
 * canonical section label with its cleaned text content. Produced by
 * `extractSections()` below and consumed by `buildSectionedPrompt()`.
 */
export interface ExtractedSection {
  section: SECFilingSection;
  content: string;
}

/**
 * Mapping from regex matchers on heading text to canonical SECFilingSection.
 *
 * Headings are produced by `promoteSecHeadings()` in filing-extractor.ts as
 * `## Item N. Trailing text` lines. We match against the heading text only
 * (the part after the `##`), case-insensitive.
 *
 * Order matters: more specific patterns first so "Item 1A. Risk Factors"
 * doesn't fall into the "Item 1." Business/Financial Statements bucket.
 */
const HEADING_TO_SECTION: Array<{
  /** Form types this mapping applies to (or 'all' for any 10-Q/10-K). */
  forms: ReadonlyArray<SECFilingType | 'all'>;
  /** Matcher against the trimmed heading text (after the `##` marker). */
  pattern: RegExp;
  /** Canonical section the heading maps to. */
  section: SECFilingSection;
}> = [
  // Item 1A. Risk Factors — must match before bare "Item 1." patterns
  { forms: ['all'], pattern: /^Item\s+1A\.?\b/i, section: 'Risk Factors' },

  // 10-Q Part II Item 1: Legal Proceedings.
  // CRITICAL: must match before the 10-Q Part I Item 1 = Financial Statements
  // rules below, because both use "Item 1." with period. Real 10-Qs have
  // "Item 1. Legal Proceedings" in Part II — without this explicit rule, the
  // generic /^Item\s+1\.\s*[A-Z]/ catchall below would route it to Financial
  // Statements and pollute that bucket with legal-proceedings text.
  { forms: ['10-Q'], pattern: /^Item\s+1\.\s*Legal/i, section: 'Legal Proceedings' },

  // Item 1. — disambiguated by form type:
  //   10-Q: Item 1 = Financial Statements (Part I)
  //   10-K: Item 1 = Business (which includes Competition subsection)
  // Also captures "Item 1. Financial Statements" / "Item 1. Business" explicitly.
  { forms: ['10-Q'], pattern: /^Item\s+1\.\s*(?:Financial|Condensed)/i, section: 'Financial Statements' },
  { forms: ['10-Q'], pattern: /^Item\s+1\.\s*$/i, section: 'Financial Statements' },
  { forms: ['10-Q'], pattern: /^Item\s+1\.\s*[A-Z]/i, section: 'Financial Statements' },
  { forms: ['10-K', '10-K/A' as SECFilingType], pattern: /^Item\s+1\.\s*Business/i, section: 'Business Overview' },
  { forms: ['10-K', '10-K/A' as SECFilingType], pattern: /^Item\s+1\.\s*$/i, section: 'Business Overview' },
  { forms: ['10-K', '10-K/A' as SECFilingType], pattern: /^Item\s+1\.\s*[A-Z]/i, section: 'Business Overview' },

  // Item 2. — disambiguated by form type:
  //   10-Q: Item 2 = MD&A (Part I)
  //   10-K: Item 2 = Properties (lower priority, falls through to Business Overview or skipped)
  { forms: ['10-Q'], pattern: /^Item\s+2\.\s*(?:Management|MD&A)/i, section: 'Management Discussion' },
  { forms: ['10-Q'], pattern: /^Item\s+2\.\s*$/i, section: 'Management Discussion' },
  { forms: ['10-Q'], pattern: /^Item\s+2\.\s*[A-Z]/i, section: 'Management Discussion' },

  // Item 3. — disambiguated by form type:
  //   10-Q: Item 3 = Quantitative and Qualitative Disclosures About Market Risk
  //   10-K: Item 3 = Legal Proceedings
  { forms: ['10-Q'], pattern: /^Item\s+3\.\s*(?:Quantitative|Market)/i, section: 'Quantitative and Qualitative Disclosures' },
  { forms: ['10-Q'], pattern: /^Item\s+3\.\s*$/i, section: 'Quantitative and Qualitative Disclosures' },
  { forms: ['10-Q'], pattern: /^Item\s+3\.\s*[A-Z]/i, section: 'Quantitative and Qualitative Disclosures' },
  { forms: ['10-K', '10-K/A' as SECFilingType], pattern: /^Item\s+3\.\s*Legal/i, section: 'Legal Proceedings' },

  // 10-K specific items
  { forms: ['10-K', '10-K/A' as SECFilingType], pattern: /^Item\s+7\.\s*(?:Management|MD&A)/i, section: 'Management Discussion' },
  { forms: ['10-K', '10-K/A' as SECFilingType], pattern: /^Item\s+7A\.?\b/i, section: 'Quantitative and Qualitative Disclosures' },
  { forms: ['10-K', '10-K/A' as SECFilingType], pattern: /^Item\s+8\.\s*Financial/i, section: 'Financial Statements' },

  // Common across both forms
  { forms: ['all'], pattern: /^Item\s+4\.\s*Controls/i, section: 'Controls and Procedures' },
  { forms: ['all'], pattern: /^Item\s+9A\.?\b/i, section: 'Controls and Procedures' },
];

/**
 * Look up the canonical section for a heading text + form type combination.
 * Returns null if no rule matches (heading is unrecognized).
 */
function matchHeadingToSection(
  headingText: string,
  formType: SECFilingType
): SECFilingSection | null {
  for (const rule of HEADING_TO_SECTION) {
    const formMatches = rule.forms.includes('all') || rule.forms.includes(formType);
    if (!formMatches) continue;
    if (rule.pattern.test(headingText)) {
      return rule.section;
    }
  }
  return null;
}

/**
 * Extract canonical SECFilingSection buckets from cleaned markdown filing text.
 *
 * Takes the output of `lib/parsers/filing-extractor.ts:cleanHtmlContent`
 * (which promotes SEC's "Item N." and "PART I" headers to `##` / `#` markdown
 * headings) and groups the text between each heading into the matched
 * SECFilingSection. The output is consumed by `buildSectionedPrompt()` below,
 * which assembles a priority-ordered prompt body honoring per-section token
 * budgets — so the summarizer always sees Financial Statements first, even if
 * the total content exceeds the LLM's input budget.
 *
 * Behavior:
 *   - Form-type-aware: 10-Q and 10-K disambiguate the same Item number to
 *     different canonical sections (e.g. 10-Q Item 1 = Financial Statements,
 *     10-K Item 1 = Business Overview).
 *   - Headings the matcher doesn't recognize are skipped (their text is
 *     absorbed into the previous section's content).
 *   - If the same canonical section appears multiple times (e.g. Part I and
 *     Part II both have an "Item 1"), the later occurrence is APPENDED to
 *     the first — the prompt builder sees a single combined bucket.
 *   - Returns sections in the order they first appeared in the document.
 *     The prompt builder re-sorts by SECTION_PRIORITY.
 *
 * Layer B1 of the NVDA 10-Q missing-metrics fix. Layer A
 * (`lib/parsers/filing-extractor.ts`) produces the markdown headings this
 * function relies on.
 *
 * @param cleanedText  Output of `cleanHtmlContent()` — markdown with `##`/`#` headings.
 * @param formType     Drives item-number disambiguation. Pass the filing's
 *                     formType ('10-Q', '10-K', etc.).
 * @returns  Array of `{ section, content }` pairs. Empty if no recognized
 *           headings were found (caller should treat as extraction failure).
 */
export function extractSections(
  cleanedText: string,
  formType: SECFilingType
): ExtractedSection[] {
  if (!cleanedText || cleanedText.length === 0) return [];

  // Walk the text line-by-line, tracking the current section as we go.
  // Markdown headings produced by promoteSecHeadings are `## Item N. Text` on
  // their own line, surrounded by blank lines.
  const lines = cleanedText.split('\n');
  const sectionMap = new Map<SECFilingSection, string[]>();
  let currentSection: SECFilingSection | null = null;
  let currentBuffer: string[] = [];

  const flushBuffer = () => {
    if (currentSection === null) return;
    const existing = sectionMap.get(currentSection) ?? [];
    const joined = currentBuffer.join('\n').trim();
    if (joined.length > 0) {
      existing.push(joined);
      sectionMap.set(currentSection, existing);
    }
    currentBuffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      const matchedSection = matchHeadingToSection(headingText, formType);
      if (matchedSection !== null) {
        // Flush whatever we were collecting under the previous section
        flushBuffer();
        currentSection = matchedSection;
        continue;
      }
      // Unrecognized heading — leave it in the current buffer as content
    }
    currentBuffer.push(line);
  }

  // Flush the trailing buffer
  flushBuffer();

  // Convert to the result shape, combining repeated sections with `\n\n` between fragments.
  // Array.from to satisfy older TS targets (tsconfig.target is ES5 in this repo).
  return Array.from(sectionMap.entries()).map(([section, fragments]) => ({
    section,
    content: fragments.join('\n\n').trim(),
  }));
}

/**
 * Check whether the extracted sections contain a usable Financial Statements
 * section. Used by the Summarize module to decide whether to throw
 * AI_INSUFFICIENT_FINANCIAL_SECTION.
 *
 * "Usable" here means present AND content length >= 100 chars. The 100-char
 * threshold filters out cases where the heading was matched but no body
 * content followed (e.g. malformed input where the next heading immediately
 * followed Item 1).
 */
export function hasUsableFinancialSection(sections: ExtractedSection[]): boolean {
  const fs = sections.find(s => s.section === 'Financial Statements');
  return fs !== undefined && fs.content.length >= 100;
}

/**
 * Assemble a priority-ordered prompt body from extracted sections that fits
 * within a total token budget.
 *
 * Algorithm:
 *   1. Sort sections by SECTION_PRIORITY ascending (most important first).
 *   2. For each section, take up to min(SECTION_TOKEN_BUDGETS[section], remaining budget).
 *   3. If a section overflows remaining budget, truncate the section's content
 *      from the END (keep the opening — that's where the most-cited values appear
 *      in financial statements and the topic-setting paragraphs in narrative sections).
 *   4. Stop when budget is exhausted or all sections placed.
 *
 * Financial Statements (priority 1) is preserved in its entirety up to its own
 * section budget regardless of total-budget pressure — it must NEVER be dropped.
 * If `totalTokenBudget < SECTION_TOKEN_BUDGETS['Financial Statements']`, the
 * caller passed a budget too small to fit even the highest priority; we honor
 * the cap (truncate Financial Statements) rather than overflow.
 *
 * Returns the assembled prompt body (a string) with sections joined by
 * markdown `## Section Name` headers — same shape the section extractor produces,
 * so downstream code reading the prompt sees consistent structure.
 *
 * @param sections   Extracted sections from `extractSections()` above. Order
 *                   doesn't matter; this function sorts by priority.
 * @param totalTokenBudget  Total tokens available for the assembled body.
 *                          Uses `estimateTokenCount` (~3.5 chars/token).
 */
export function buildSectionedPrompt(
  sections: ExtractedSection[],
  totalTokenBudget: number
): string {
  if (sections.length === 0) return '';

  // Sort by priority (lower = higher importance)
  const sorted = [...sections].sort(
    (a, b) => (SECTION_PRIORITY[a.section] ?? 99) - (SECTION_PRIORITY[b.section] ?? 99)
  );

  // ~3.5 chars per token — invert estimateTokenCount() to convert budget to chars.
  const charBudgetFromTokens = (tokens: number) => Math.floor(tokens * 3.5 / 1.1);
  let remainingChars = charBudgetFromTokens(totalTokenBudget);

  const parts: string[] = [];
  for (const { section, content } of sorted) {
    if (remainingChars <= 0) break;

    const sectionBudgetChars = charBudgetFromTokens(SECTION_TOKEN_BUDGETS[section] ?? 4000);
    const takeChars = Math.min(sectionBudgetChars, remainingChars, content.length);

    // Truncate from the end (preserves the section opening, where headline
    // values and topic-setting paragraphs live)
    const slice = content.slice(0, takeChars);
    parts.push(`## ${section}\n\n${slice}`);
    remainingChars -= takeChars;
  }

  return parts.join('\n\n');
}

/**
 * Get context window configuration based on filing type and section
 */
export function getContextConfig(
  filingType: SECFilingType,
  section?: SECFilingSection,
  customConfig?: Partial<ContextWindowConfig>
): ContextWindowConfig {
  // Start with the default config for this filing type
  const baseConfig = { ...DEFAULT_CONTEXT_CONFIGS[filingType] };
  
  // Adjust based on section if specified
  if (section) {
    const sectionBudget = SECTION_TOKEN_BUDGETS[section];
    if (sectionBudget) {
      // Adjust chunk size based on the section's typical length
      baseConfig.maxChunkSize = Math.min(baseConfig.maxChunkSize, sectionBudget);
      
      // For complete document processing, always use section-based chunking
      if (section === 'Complete Document') {
        baseConfig.chunkStrategy = 'section-based';
      }
    }
  }
  
  // Apply any custom overrides
  return { ...baseConfig, ...customConfig };
}

/**
 * Split a document into optimally sized chunks for processing
 */
export function splitDocumentIntoChunks(
  document: string,
  config: ContextWindowConfig
): string[] {
  const { maxChunkSize, overlapSize, useSemanticChunking, chunkStrategy } = config;
  
  // For now, we'll implement a simple size-based chunking
  // In a real implementation, this would use more sophisticated techniques
  const chunks: string[] = [];
  
  if (chunkStrategy === 'fixed' || !useSemanticChunking) {
    // Simple size-based chunking with overlap
    let position = 0;
    while (position < document.length) {
      const end = Math.min(position + maxChunkSize, document.length);
      chunks.push(document.substring(position, end));
      position = end - overlapSize; // Create overlap between chunks
      
      // Prevent infinite loops for small documents
      if (position >= document.length) break;
    }
  } else if (chunkStrategy === 'section-based') {
    // For section-based chunking, we'd identify section boundaries
    // This is a simplified version - a real implementation would use regex or NLP
    const sections = document.split(/(?=\n#{1,3} )/); // Split on markdown-like headings
    
    let currentChunk = '';
    for (const section of sections) {
      // If adding this section would exceed our chunk size, start a new chunk
      if (currentChunk.length + section.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        // Include some overlap by repeating the last part of previous chunk
        const overlapText = currentChunk.substring(Math.max(0, currentChunk.length - overlapSize));
        currentChunk = overlapText + section;
      } else {
        currentChunk += section;
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
  } else if (chunkStrategy === 'adaptive') {
    // In adaptive mode, we'd adjust chunk sizes based on content complexity
    // This is a simplified version that looks for natural breaks
    
    // Split on double newlines (paragraph breaks) or other natural indicators
    const paragraphs = document.split(/\n\n+/);
    
    let currentChunk = '';
    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        // Include overlap with previous chunk
        const overlapText = currentChunk.substring(Math.max(0, currentChunk.length - overlapSize));
        currentChunk = overlapText + '\n\n' + paragraph;
      } else {
        if (currentChunk.length > 0) {
          currentChunk += '\n\n';
        }
        currentChunk += paragraph;
      }
    }
    
    // Add the final chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
  }
  
  return chunks;
}

/**
 * Calculate the estimated tokens for a document
 * More accurate approximation for Claude's tokenizer
 */
export function estimateTokenCount(text: string): number {
  // Claude's tokenizer is closer to ~3.5 characters per token for English text
  // Adding a 10% buffer to be safe
  return Math.ceil(text.length / 3.5 * 1.1);
}

/**
 * Determine if a document needs chunking based on its size and filing type
 * Uses a more conservative approach to ensure we stay within Claude's token limits
 */
export function needsChunking(
  document: string,
  filingType: SECFilingType,
  section?: SECFilingSection
): boolean {
  const config = getContextConfig(filingType, section);
  const estimatedTokens = estimateTokenCount(document);
  
  // Be more conservative with the threshold - Claude has a 200k token limit
  // but we need to account for the prompt text and system instructions too
  const maxSafeTokens = Math.min(config.maxChunkSize, 150000); // Never exceed 150k tokens
  
  return estimatedTokens > maxSafeTokens * 0.85; // Add a 15% safety margin
} 