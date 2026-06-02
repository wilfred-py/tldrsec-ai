import {
  extractSections,
  hasUsableFinancialSection,
  buildSectionedPrompt,
  SECTION_TOKEN_BUDGETS,
} from '../../../lib/ai/prompts/context-manager';

/**
 * Layer B interface tests for the SEC Section module — the extractor
 * + prompt builder behind the canonical `lib/ai/prompts/context-manager.ts`
 * surface. Fixtures here are minimal markdown samples that mimic what
 * cleanHtmlContent + promoteSecHeadings produce for real SEC 10-Q/10-K
 * filings. The trimmed real-world NVDA fixture lives at
 * __tests__/fixtures/sec/nvda-10q-trimmed.htm and is exercised by the
 * golden-output integration test (Layer C work).
 */

describe('extractSections — 10-Q heading routing', () => {
  it('routes Item 1. to Financial Statements for 10-Q', () => {
    const input = `
## Item 1. Financial Statements

Revenue | $ 81,600
Net income | $ 58,300

## Item 2. Management's Discussion and Analysis

Q1 saw record demand for data center products.
`.trim();
    const out = extractSections(input, '10-Q');
    const fs = out.find(s => s.section === 'Financial Statements');
    const mda = out.find(s => s.section === 'Management Discussion');
    expect(fs).toBeDefined();
    expect(fs!.content).toContain('Revenue | $ 81,600');
    expect(mda).toBeDefined();
    expect(mda!.content).toContain('record demand');
  });

  it('routes Item 1A. to Risk Factors (not Financial Statements)', () => {
    const input = `
## Item 1A. Risk Factors

Supply chain risks remain elevated.

## Item 1. Financial Statements

Revenue table here.
`.trim();
    const out = extractSections(input, '10-Q');
    const risk = out.find(s => s.section === 'Risk Factors');
    const fs = out.find(s => s.section === 'Financial Statements');
    expect(risk).toBeDefined();
    expect(risk!.content).toContain('Supply chain');
    expect(fs).toBeDefined();
    expect(fs!.content).toContain('Revenue table');
    // Critical: Risk Factors content does NOT leak into Financial Statements
    expect(fs!.content).not.toContain('Supply chain');
  });

  it('routes Item 3. to Quantitative and Qualitative Disclosures for 10-Q', () => {
    const input = `
## Item 3. Quantitative and Qualitative Disclosures About Market Risk

We are exposed to interest rate risk on our $30B debt portfolio.
`.trim();
    const out = extractSections(input, '10-Q');
    const qqd = out.find(s => s.section === 'Quantitative and Qualitative Disclosures');
    expect(qqd).toBeDefined();
    expect(qqd!.content).toContain('interest rate risk');
  });

  it('routes Item 4. Controls to Controls and Procedures', () => {
    const input = `
## Item 4. Controls and Procedures

Our CEO and CFO certify the controls are effective.
`.trim();
    const out = extractSections(input, '10-Q');
    const cp = out.find(s => s.section === 'Controls and Procedures');
    expect(cp).toBeDefined();
    expect(cp!.content).toContain('CEO and CFO');
  });
});

describe('extractSections — 10-K heading routing', () => {
  it('routes Item 1. to Business Overview for 10-K (NOT Financial Statements)', () => {
    const input = `
## Item 1. Business

We design and manufacture GPUs. Our competition includes AMD and Intel.
Competition section embedded inline within Item 1.

## Item 8. Financial Statements

Annual revenue table.
`.trim();
    const out = extractSections(input, '10-K');
    const biz = out.find(s => s.section === 'Business Overview');
    const fs = out.find(s => s.section === 'Financial Statements');
    expect(biz).toBeDefined();
    expect(biz!.content).toContain('competition includes AMD');
    expect(fs).toBeDefined();
    expect(fs!.content).toContain('Annual revenue');
    // Critical: Business content does NOT leak into Financial Statements
    expect(fs!.content).not.toContain('competition');
  });

  it('routes Item 7. and Item 7A. to MD&A and Market Risk respectively for 10-K', () => {
    const input = `
## Item 7. Management's Discussion and Analysis

Annual performance review.

## Item 7A. Quantitative and Qualitative Disclosures About Market Risk

Annual market risk exposure.
`.trim();
    const out = extractSections(input, '10-K');
    const mda = out.find(s => s.section === 'Management Discussion');
    const qqd = out.find(s => s.section === 'Quantitative and Qualitative Disclosures');
    expect(mda).toBeDefined();
    expect(mda!.content).toContain('Annual performance');
    expect(qqd).toBeDefined();
    expect(qqd!.content).toContain('market risk exposure');
  });

  it('routes Item 3. to Legal Proceedings for 10-K (not Market Risk)', () => {
    const input = `
## Item 3. Legal Proceedings

We are named as a defendant in patent litigation.
`.trim();
    const out = extractSections(input, '10-K');
    const legal = out.find(s => s.section === 'Legal Proceedings');
    const qqd = out.find(s => s.section === 'Quantitative and Qualitative Disclosures');
    expect(legal).toBeDefined();
    expect(legal!.content).toContain('patent litigation');
    expect(qqd).toBeUndefined();
  });
});

describe('extractSections — edge cases', () => {
  it('returns empty array for empty input', () => {
    expect(extractSections('', '10-Q')).toEqual([]);
  });

  it('returns empty array for input with no recognized headings', () => {
    const input = 'Just some prose without any Item headings.\n\nAnother paragraph.';
    expect(extractSections(input, '10-Q')).toEqual([]);
  });

  it('routes Part I Item 1. and Part II Item 1. correctly (10-Q has both with period)', () => {
    // Real 10-Qs literally use "Item 1. Financial Statements" in Part I AND
    // "Item 1. Legal Proceedings" in Part II — both with periods and uppercase
    // trailing text. The extractor must distinguish them by trailing keyword,
    // not by presence/absence of period. Regression for a routing bug caught
    // in self-review where Part II Legal Proceedings leaked into Financial
    // Statements.
    const input = `
## Item 1. Financial Statements

Q1 revenue numbers go here.

## Item 1A. Risk Factors

Risk content.

## Item 1. Legal Proceedings

Pending lawsuit details. We are named in patent litigation.
`.trim();
    const out = extractSections(input, '10-Q');
    const fs = out.find(s => s.section === 'Financial Statements');
    const risk = out.find(s => s.section === 'Risk Factors');
    const legal = out.find(s => s.section === 'Legal Proceedings');
    expect(fs).toBeDefined();
    expect(risk).toBeDefined();
    expect(legal).toBeDefined();
    expect(fs!.content).toContain('Q1 revenue');
    expect(risk!.content).toContain('Risk content');
    expect(legal!.content).toContain('Pending lawsuit');
    // Critical assertions: each section is ISOLATED from the others
    expect(fs!.content).not.toContain('Pending lawsuit');
    expect(fs!.content).not.toContain('patent litigation');
    expect(fs!.content).not.toContain('Risk content');
    expect(legal!.content).not.toContain('Q1 revenue');
  });

  it('ignores unrecognized headings, absorbing their content into the previous section', () => {
    const input = `
## Item 1. Financial Statements

Revenue data.

## Some Random Heading

Random body.

## Item 2. MD&A

MD&A content.
`.trim();
    const out = extractSections(input, '10-Q');
    const fs = out.find(s => s.section === 'Financial Statements');
    // "Some Random Heading" and its body get absorbed into Financial Statements
    expect(fs!.content).toContain('Revenue data');
    expect(fs!.content).toContain('Random body');
    const mda = out.find(s => s.section === 'Management Discussion');
    expect(mda!.content).toContain('MD&A content');
  });
});

describe('hasUsableFinancialSection', () => {
  it('returns true when Financial Statements section has >= 100 chars', () => {
    const sections = [
      { section: 'Financial Statements' as const, content: 'x'.repeat(150) },
    ];
    expect(hasUsableFinancialSection(sections)).toBe(true);
  });

  it('returns false when Financial Statements section has < 100 chars', () => {
    const sections = [
      { section: 'Financial Statements' as const, content: 'too short' },
    ];
    expect(hasUsableFinancialSection(sections)).toBe(false);
  });

  it('returns false when Financial Statements section is missing entirely', () => {
    const sections = [
      { section: 'Risk Factors' as const, content: 'x'.repeat(500) },
    ];
    expect(hasUsableFinancialSection(sections)).toBe(false);
  });
});

describe('buildSectionedPrompt — priority-ordered budget assembly', () => {
  it('emits sections in priority order regardless of input order', () => {
    const sections = [
      { section: 'Risk Factors' as const, content: 'Risk content here.' },
      { section: 'Financial Statements' as const, content: 'Financial content here.' },
      { section: 'Management Discussion' as const, content: 'MD&A content here.' },
    ];
    const prompt = buildSectionedPrompt(sections, 50000);
    const fsIndex = prompt.indexOf('Financial Statements');
    const mdaIndex = prompt.indexOf('Management Discussion');
    const riskIndex = prompt.indexOf('Risk Factors');
    expect(fsIndex).toBeGreaterThan(-1);
    expect(mdaIndex).toBeGreaterThan(fsIndex);
    expect(riskIndex).toBeGreaterThan(mdaIndex);
  });

  it('preserves Financial Statements when budget is too tight for everything', () => {
    // Use a tiny budget that can only fit Financial Statements + a sliver of MD&A
    const sections = [
      { section: 'Risk Factors' as const, content: 'R'.repeat(50000) },
      { section: 'Financial Statements' as const, content: 'F'.repeat(20000) },
      { section: 'Management Discussion' as const, content: 'M'.repeat(40000) },
    ];
    // Budget allows Financial Statements full (8K tokens ≈ 25K chars)
    // plus maybe some of MD&A. Risk Factors should be dropped or heavily truncated.
    const prompt = buildSectionedPrompt(sections, 10000); // 10K tokens ≈ 31.8K chars
    expect(prompt).toContain('## Financial Statements');
    // Financial Statements survives in its entirety
    const fsHeader = prompt.indexOf('## Financial Statements');
    const nextHeader = prompt.indexOf('##', fsHeader + 5);
    const fsContent = nextHeader === -1
      ? prompt.slice(fsHeader)
      : prompt.slice(fsHeader, nextHeader);
    expect(fsContent.length).toBeGreaterThan(15000); // Should preserve most of the 20K content
  });

  it('truncates a section from the end when its content exceeds its section budget', () => {
    const sections = [
      { section: 'Financial Statements' as const, content: 'F'.repeat(100000) },
    ];
    const prompt = buildSectionedPrompt(sections, 100000);
    // Financial Statements has an 8K-token budget = ~25K chars
    const fsContent = prompt.replace('## Financial Statements\n\n', '');
    const expectedMaxChars = Math.floor(SECTION_TOKEN_BUDGETS['Financial Statements'] * 3.5 / 1.1);
    expect(fsContent.length).toBeLessThanOrEqual(expectedMaxChars + 100); // small tolerance
  });

  it('returns empty string for no sections', () => {
    expect(buildSectionedPrompt([], 50000)).toBe('');
  });

  it('formats sections with markdown headers consistent with extractor output', () => {
    const sections = [
      { section: 'Financial Statements' as const, content: 'Body text.' },
    ];
    const prompt = buildSectionedPrompt(sections, 50000);
    expect(prompt).toMatch(/^## Financial Statements\n\nBody text\.$/);
  });
});
