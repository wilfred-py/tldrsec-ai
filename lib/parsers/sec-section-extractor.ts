/**
 * SEC 10-Q / 10-K section extractor.
 *
 * Takes cleaned markdown-formatted filing text (output of
 * `lib/parsers/filing-extractor.ts:cleanHtmlContent`, which promotes SEC's
 * "Item N." and "PART I" headers to `##` / `#` markdown headings) and
 * segments it into the canonical `SECFilingSection` buckets defined in
 * `lib/ai/prompts/prompt-types.ts`.
 *
 * Output is consumed by `buildSectionedPrompt()` in `context-manager.ts`,
 * which assembles a priority-ordered prompt body honoring per-section token
 * budgets — so the summarizer always sees Financial Statements first, even
 * if the total content exceeds the LLM's input budget.
 *
 * This is Layer B1 of the NVDA 10-Q missing-metrics fix. See plan at
 * `.claude/tasks/nvda-10q-missing-metrics-fix.md`. Layer A produces the
 * markdown headings this extractor relies on; Layer C wires the extractor
 * output into the summarization pipeline.
 */

import type { SECFilingType, SECFilingSection } from '../ai/prompts/prompt-types';
import type { ExtractedSection } from '../ai/prompts/context-manager';

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

  // 10-Q Part II items
  { forms: ['10-Q'], pattern: /^Item\s+1\b(?!A)/i, section: 'Legal Proceedings' }, // Part II Item 1 (Legal)

  // Common across both forms
  { forms: ['all'], pattern: /^Item\s+4\.\s*Controls/i, section: 'Controls and Procedures' },
  { forms: ['all'], pattern: /^Item\s+9A\.?\b/i, section: 'Controls and Procedures' },
];

/**
 * Sections that don't map cleanly from a single heading and need fallback
 * handling. (Currently unused — kept for future extension.)
 */
// const FALLBACK_SECTIONS: SECFilingSection[] = ['Material Changes'];

/**
 * Extract canonical SECFilingSection buckets from cleaned markdown filing text.
 *
 * Walks the markdown headings produced by Layer A's `promoteSecHeadings` and
 * groups the text between each heading into the matched SECFilingSection.
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
 * Check whether the extracted sections contain a usable Financial Statements
 * section. Used by Layer C to decide whether to throw
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
