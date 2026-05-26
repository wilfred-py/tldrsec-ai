import { preprocessIxbrl, promoteSecHeadings } from '../../lib/parsers/filing-extractor';

/**
 * Layer A unit tests for the NVDA 10-Q failure (email shipped 2026-05-20
 * saying "no extractable financial metrics" because raw iXBRL HTML was
 * passed straight to Grok with no preprocessing).
 *
 * The `cleanHtmlContent` end-to-end path uses cheerio (an ESM-only package
 * that this project mocks in jest via __mocks__/cheerio.js). The cheerio
 * portion is exercised at runtime in production and via integration tests;
 * here we unit-test the two pure-string transformations independently:
 *   - preprocessIxbrl  → strips iXBRL/XBRL noise, unwraps value tags
 *   - promoteSecHeadings → promotes "PART I" / "Item 1." to markdown
 *
 * The fixtures here are minimal but structurally faithful to real SEC
 * iXBRL filings since 2019.
 */

describe('preprocessIxbrl — iXBRL tag handling', () => {
  it('unwraps <ix:nonFraction> so the inner numeric value survives', () => {
    const html = `<p>Revenue: $<ix:nonFraction name="us-gaap:Revenues" contextRef="c1" decimals="-6" scale="6" unitRef="usd">81,600</ix:nonFraction> million</p>`;
    const out = preprocessIxbrl(html);
    expect(out).toContain('$81,600');
    expect(out).toContain('Revenue: $81,600 million');
    expect(out).not.toMatch(/ix:nonFraction|nonFraction\b/i);
  });

  it('unwraps <ix:nonNumeric> preserving prose', () => {
    const html = `<p>Filer: <ix:nonNumeric name="dei:EntityRegistrantName" contextRef="c0">NVIDIA Corporation</ix:nonNumeric></p>`;
    const out = preprocessIxbrl(html);
    expect(out).toContain('NVIDIA Corporation');
    expect(out).not.toContain('nonNumeric');
  });

  it('unwraps <ix:continuation> for multi-part numeric values', () => {
    const html = `<p><ix:continuation>2,400</ix:continuation></p>`;
    const out = preprocessIxbrl(html);
    expect(out).toContain('2,400');
    expect(out).not.toContain('continuation');
  });

  it('strips <ix:hidden> blocks entirely (DEI metadata, not for display)', () => {
    const html = `
      <ix:hidden>
        <ix:nonFraction name="dei:EntityCentralIndexKey" contextRef="c0" decimals="0">1045810</ix:nonFraction>
        <ix:nonNumeric name="dei:DocumentType" contextRef="c0">10-Q</ix:nonNumeric>
        <ix:nonNumeric name="dei:DocumentPeriodEndDate" contextRef="c0">2026-04-26</ix:nonNumeric>
      </ix:hidden>
      <p>Visible body content</p>`;
    const out = preprocessIxbrl(html);
    expect(out).toContain('Visible body content');
    expect(out).not.toContain('1045810');
    expect(out).not.toContain('EntityCentralIndexKey');
    expect(out).not.toContain('2026-04-26');
  });

  it('strips <ix:header>, <ix:references>, <ix:resources>, <ix:relationship>', () => {
    const html = `
      <ix:header><ix:references>HEADER_PAYLOAD_777</ix:references></ix:header>
      <ix:resources>RESOURCES_PAYLOAD_888</ix:resources>
      <ix:relationship>RELATIONSHIP_PAYLOAD_999</ix:relationship>
      <p>Visible body content</p>`;
    const out = preprocessIxbrl(html);
    expect(out).toContain('Visible body content');
    expect(out).not.toContain('HEADER_PAYLOAD_777');
    expect(out).not.toContain('RESOURCES_PAYLOAD_888');
    expect(out).not.toContain('RELATIONSHIP_PAYLOAD_999');
  });

  it('strips xbrli:/link:/xlink:/xbrldi: schema noise', () => {
    const html = `
      <xbrli:context id="c0"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">1045810</xbrli:identifier></xbrli:entity></xbrli:context>
      <link:linkbaseRef xlink:type="simple" xlink:href="nvda-20260426-presentation.xml"/>
      <xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">DataCenter</xbrldi:explicitMember>
      <p>Visible body content</p>`;
    const out = preprocessIxbrl(html);
    expect(out).toContain('Visible body content');
    expect(out).not.toContain('xbrli:');
    expect(out).not.toContain('linkbaseRef');
    expect(out).not.toContain('1045810');
    expect(out).not.toContain('DataCenter'); // inside xbrldi:explicitMember, should be stripped
  });

  it('handles self-closing iXBRL markers', () => {
    const html = `<p>Before</p><ix:tuple name="x"/><p>After</p>`;
    const out = preprocessIxbrl(html);
    expect(out).toContain('Before');
    expect(out).toContain('After');
    expect(out).not.toContain('ix:tuple');
  });

  it('is idempotent on plain HTML with no ix: tags', () => {
    const html = `<html><body><p>Hello world</p></body></html>`;
    const out = preprocessIxbrl(html);
    expect(out).toBe(html);
  });

  it('NVDA-style end-to-end iXBRL: cleans a financial table fragment', () => {
    const html = `
      <table>
        <tr><th></th><th>Three Months Ended</th></tr>
        <tr><td>Revenue</td><td>$<ix:nonFraction name="us-gaap:Revenues" contextRef="c1" decimals="-6" scale="6" unitRef="usd">81,600</ix:nonFraction></td></tr>
        <tr><td>Cost of revenue</td><td><ix:nonFraction name="us-gaap:CostOfRevenue" contextRef="c1" decimals="-6" scale="6" unitRef="usd">19,400</ix:nonFraction></td></tr>
        <tr><td>Gross profit</td><td><ix:nonFraction name="us-gaap:GrossProfit" contextRef="c1" decimals="-6" scale="6" unitRef="usd">62,200</ix:nonFraction></td></tr>
        <tr><td>Net income</td><td>$<ix:nonFraction name="us-gaap:NetIncomeLoss" contextRef="c1" decimals="-6" scale="6" unitRef="usd">58,300</ix:nonFraction></td></tr>
        <tr><td>Diluted earnings per share</td><td>$<ix:nonFraction name="us-gaap:EarningsPerShareDiluted" contextRef="c1" decimals="2" unitRef="usdPerShare">2.39</ix:nonFraction></td></tr>
      </table>`;
    const out = preprocessIxbrl(html);

    // All financial figures preserved with their currency symbols.
    expect(out).toContain('$81,600');
    expect(out).toContain('19,400');
    expect(out).toContain('62,200');
    expect(out).toContain('$58,300');
    expect(out).toContain('$2.39');
    // Labels preserved.
    expect(out).toContain('Revenue');
    expect(out).toContain('Net income');
    expect(out).toContain('Diluted earnings per share');
    // No XBRL noise leaks.
    expect(out).not.toMatch(/ix:|contextRef|unitRef/);
  });
});

describe('promoteSecHeadings — markdown promotion for section headers', () => {
  it('promotes "PART I" / "PART II" to # heading', () => {
    const input = `Some text before
PART I — FINANCIAL INFORMATION
Body text
PART II — OTHER INFORMATION
More body`;
    const out = promoteSecHeadings(input);
    expect(out).toMatch(/#\s+PART I\b/);
    expect(out).toMatch(/#\s+PART II\b/);
  });

  it('promotes "Item 1." / "Item 1A." / "Item 2." to ## heading', () => {
    const input = `Item 1. Financial Statements
content
Item 1A. Risk Factors
content
Item 2. Management's Discussion and Analysis
content`;
    const out = promoteSecHeadings(input);
    expect(out).toMatch(/##\s+Item 1\./);
    expect(out).toMatch(/##\s+Item 1A\./);
    expect(out).toMatch(/##\s+Item 2\./);
    // Captured trailing text survives.
    expect(out).toContain('Financial Statements');
    expect(out).toContain('Risk Factors');
    expect(out).toContain("Management's Discussion and Analysis");
  });

  it('does not promote mid-sentence Item references', () => {
    // "Item 5" appearing inside prose shouldn't get promoted to a heading.
    const input = `As discussed in Item 5 of this report, the company expects...`;
    const out = promoteSecHeadings(input);
    expect(out).not.toMatch(/##\s+Item 5/);
  });

  it('leaves non-SEC text alone', () => {
    const input = `Just some prose with no headings.\nAnother paragraph.`;
    expect(promoteSecHeadings(input)).toBe(input);
  });
});
