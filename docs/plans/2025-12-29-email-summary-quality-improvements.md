# Email Summary Quality Improvements Implementation Plan

**Date**: 2025-12-29 13:33:06 AEDT
**Git Commit**: 400c7342f3d7266fc10867138d21fceab3fc3c0d
**Branch**: fix/multi-transaction-email-design
**Repository**: tldrsec-ai

## Overview

This plan addresses four interconnected issues with SEC filing email summaries:

1. **Markdown artifacts in AI output** - KO 8-K and NVDA summaries contain `####` and `###` that appear as raw text or styled headers in emails when they should be plain prose (see screenshot: `#### 1. Specific Material Event(s)`)
2. **Newsletter-style formatting** - VRT Form 3 and NVDA 10-K summaries are wordy and need Morning Brew/Litquidity-style formatting with catchy subheadings and bolded keywords
3. **XML URL poor UX** - VRT Form 3 and GOOGL Form 144 filing links lead to raw `.xml` files without formatting (no XSLT stylesheet) - needs smart URL construction to use SEC's stylesheet viewer
4. **Missing information & sentiment** - KO 8-K is missing sentiment analysis and has incomplete data (shown as "unknown" in the email header)

## Current State Analysis

### Issue 1: Markdown Artifacts in AI Output

**Root Cause**: The system prompt in `unified-prompts.ts:361-383` forbids markdown code blocks but does NOT explicitly forbid markdown syntax (###, ####, **, etc.) within JSON string values.

```typescript
// Current system prompt says:
"1. Output raw JSON only - no markdown code blocks (\`\`\`), no explanation"
```

The `markdownToHtml()` function in `design-system.ts:317-320` then converts these markdown headers to styled divs:

```typescript
html = html.replace(/^### (.+)$/gm, `<div style="...">$1</div>`);
html = html.replace(/^#### (.+)$/gm, `<div style="...">$1</div>`);
```

This creates unexpected visual formatting in emails.

### Issue 2: Newsletter-Style Formatting Needed

**Root Cause**: The AI prompts don't instruct the model to write in a newsletter style with:
- Catchy, scannable subheadings
- Bold keywords for quick skimming
- Concise bullet points
- Morning Brew / Litquidity tone

Current summaries are written as plain prose paragraphs.

### Issue 3: XML URL Poor UX

**Root Cause**: The `getSecFilingViewerUrl()` in `url-utils.ts:62-93` passes through XML URLs assuming SEC renders them with XSLT stylesheets. However:

- Form 4 XML files WITH `xslF345X05` path render beautifully
- Form 3 and Form 144 XML files WITHOUT this path render as raw XML trees

```typescript
// Current logic at line 75:
if (filingUrl.match(/\.(xml|html?|htm)$/i)) {
  return filingUrl;  // Passes through ALL XML files
}
```

**Evidence from user screenshot**: The GOOGL Form 144 link leads to raw XML showing `<edgarSubmission>` tree.

### Issue 4: Missing Information & Sentiment (KO 8-K)

**Root Cause**: Multiple issues:
1. The 8-K schema in `unified-prompts.ts:157-182` requires only `company`, `summary`, and `eventType`. Key financial figures may be getting truncated or omitted.
2. The email shows "unknown" in the header - this suggests the `filerName` or `filerRole` is not being populated for 8-K filings.
3. **Missing sentiment field** - No sentiment analysis is included in 8-K schema, unlike Form 4 which has `signalStrength`.

### Key Discoveries

1. **Markdown Rendering**: `design-system.ts:287-350` contains `markdownToHtml()` which converts markdown to styled HTML - this is intentional for the `summaryText` field but problematic when AI includes markdown in the `summary` (executive summary) field
2. **Template Registry**: Form 3 uses `Form4MinimalistTemplate` via `template-registry.ts:23`
3. **Form 144 Footer**: `form144-template.tsx:564-565` uses raw `filing.filingUrl` without the `getSecFilingViewerUrl()` conversion
4. **XML URL Detection**: Need to differentiate between XML files that have SEC stylesheets vs those that don't

## Desired End State

After this plan is complete:

1. **No markdown artifacts** - Summaries render as clean text without unintended headers
2. **Newsletter-style formatting** - Summaries use professional newsletter copy style:
   - Scannable at a glance
   - Key metrics bolded
   - Catchy subheadings where appropriate
   - Litquidity/Morning Brew tone
3. **Proper filing links** - All filing URLs lead to human-readable documents:
   - XML files without stylesheets redirect to index page
   - Form 144 footer uses `getSecFilingViewerUrl()`
4. **Complete information** - 8-K summaries capture all material events

### Verification Criteria

**Automated**:
- [ ] All existing parser tests pass: `npm run test -- --testPathPattern="parser"`
- [ ] URL utility tests pass with new test cases
- [ ] Build compiles: `npm run build`
- [ ] Linting passes: `npm run lint`

**Manual**:
- [ ] Send test email with KO 8-K - verify no `####` artifacts
- [ ] Send test email with NVDA 10-K - verify newsletter formatting
- [ ] Send test email with VRT Form 3 - verify link leads to readable page
- [ ] Send test email with GOOGL Form 144 - verify link leads to readable page

## What We're NOT Doing

- Rewriting the entire email template system
- Adding new email templates for Form 3 or Form 144 (they already have templates)
- Changing the AI model or provider
- Modifying the Resend MCP server configuration

## Implementation Approach

We'll use a targeted, minimal-change approach:

1. **Prompt-level fix** for markdown prevention - add explicit rule to system prompt
2. **Prompt enhancement** for newsletter style - add tone/formatting guidance
3. **URL utility fix** for XML detection - improve logic to detect styled vs unstyled XML
4. **Template fix** for Form 144 footer - use existing URL utility function

---

## Phase 1: Prevent Markdown in AI Output

### Overview
Add explicit rules to the AI system prompt preventing markdown syntax in JSON string values.

### Step 1.1: Write Failing Tests

**Test File**: `__tests__/ai/prompts/unified-prompts-formatting.test.ts`

```typescript
import { generateFilingPrompt, SYSTEM_PROMPT } from '../../../lib/ai/prompts/unified-prompts';

describe('Unified Prompts - Markdown Prevention', () => {
  describe('SYSTEM_PROMPT', () => {
    it('should explicitly forbid markdown headers (###, ####) in JSON values', () => {
      // Verify the system prompt contains explicit markdown prohibition
      expect(SYSTEM_PROMPT).toContain('Do not use markdown headers');
    });

    it('should forbid bullet points (* or -) in summary fields', () => {
      expect(SYSTEM_PROMPT).toMatch(/Do not use .*(bullet|list|[-*])/i);
    });

    it('should encourage plain prose sentences', () => {
      expect(SYSTEM_PROMPT).toContain('plain prose');
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="unified-prompts-formatting"
# Expected: 3 failing tests (SYSTEM_PROMPT doesn't contain these rules yet)
```

### Step 1.2: Implement Markdown Prevention Rules

**File**: `lib/ai/prompts/unified-prompts.ts`

**Changes**: Add explicit markdown prohibition to SYSTEM_PROMPT (line ~378-383)

Add to FORBIDDEN section:
```typescript
- Do not use markdown headers (###, ####, ##, #) inside JSON string values
- Do not use markdown lists (* or -) inside JSON string values
- Do not use markdown bold (**text**) inside JSON string values
- Write all text fields as plain prose sentences
```

**Checkpoint 1.2**: Run tests and verify they pass:
```bash
npm run test -- --testPathPattern="unified-prompts-formatting"
# Expected: 3 passing
```

### Step 1.3: Add Newsletter Style Guidance

**File**: `lib/ai/prompts/unified-prompts.ts`

**Changes**: Add new constant for writing style guidance and include in system prompt.

Add new section after FORBIDDEN:
```typescript
WRITING STYLE:
- Write like a financial journalist at Morning Brew or Bloomberg
- Lead with the most important number or fact
- Be concise: prefer "Revenue hit $45B" over "The company reported total revenue of $45B"
- Use active voice: "CEO Smith sold" not "Shares were sold by CEO Smith"
- Include specific numbers with units ($, %, shares)
- For complex filings, structure as: [Headline fact] + [Key context] + [Significance]
```

**Checkpoint 1.3**: Verify build compiles:
```bash
npm run build
# Expected: Success
```

### Step 1.4: Final Phase Verification

**Automated Verification**:
- [ ] All new tests pass: `npm run test -- --testPathPattern="unified-prompts"`
- [ ] Build compiles: `npm run build`
- [ ] Linting passes: `npm run lint`

**Manual Verification**:
- [ ] Trigger a summarization for KO 8-K filing
- [ ] Verify summary text has no markdown artifacts
- [ ] Verify summary reads like a financial newsletter

**STOP**: Await manual confirmation before proceeding to Phase 2.

---

## Phase 2: Fix XML URL Handling (Smart Stylesheet URL Construction)

### Overview
Improve `getSecFilingViewerUrl()` to construct proper XSLT stylesheet viewer URLs for Form 3/4/5 and Form 144 XML files. Instead of redirecting to the index page (poor UX), we'll redirect to the SEC's stylesheet-rendered version which displays the actual form beautifully.

**Key Insight from SEC Research**:
- Form 3/4/5 XML files are rendered via `xslF345X##` stylesheets (e.g., `xslF345X05`)
- Form 144 XML files are rendered via `xsl144X##` stylesheets (e.g., `xsl144X01`)
- The SEC's viewer URL format: `https://www.sec.gov/Archives/edgar/data/{CIK}/{ACCESSION}/xsl{TYPE}X{VERSION}/{FILENAME}.xml`

### Step 2.1: Write Failing Tests

**Test File**: `__tests__/email/url-utils.test.ts`

```typescript
import { getSecFilingViewerUrl } from '../../lib/email/url-utils';

describe('getSecFilingViewerUrl - XML Handling', () => {
  describe('XML files with XSLT stylesheet path (already formatted)', () => {
    it('should pass through Form 4 XML with xslF345X05 path', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/0001045810/000119903925000015/xslF345X05/wk-form4_1766450107.xml';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });

    it('should pass through Form 3 XML with xslF345X03 path', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/12345/000012345025000001/xslF345X03/form3.xml';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });

    it('should pass through Form 144 XML with xsl144X01 path', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/1548760/000192109423000952/xsl144X01/primary_doc.xml';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });
  });

  describe('XML files without XSLT stylesheet path - Form 3/4/5 (ownership forms)', () => {
    it('should construct xslF345X05 viewer URL for Form 4 XML without stylesheet', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/form4.xml';
      const result = getSecFilingViewerUrl(inputUrl, 'Form 4');

      expect(result).toContain('/xslF345X05/');
      expect(result).toContain('form4.xml');
    });

    it('should construct xslF345X05 viewer URL for Form 3 XML without stylesheet', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/0001234567/000123456725000001/form3.xml';
      const result = getSecFilingViewerUrl(inputUrl, 'Form 3');

      expect(result).toContain('/xslF345X05/');
      expect(result).toContain('form3.xml');
    });
  });

  describe('XML files without XSLT stylesheet path - Form 144', () => {
    it('should construct xsl144X01 viewer URL for Form 144 XML without stylesheet', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/0002001558/000200155825000123/primary_doc.xml';
      const result = getSecFilingViewerUrl(inputUrl, 'Form 144');

      expect(result).toContain('/xsl144X01/');
      expect(result).toContain('primary_doc.xml');
    });
  });

  describe('XML files without known form type - fallback to index', () => {
    it('should fallback to index URL when form type unknown and XML has no stylesheet', () => {
      const inputUrl = 'https://www.sec.gov/Archives/edgar/data/1652044/000200155825000123/unknown.xml';
      const result = getSecFilingViewerUrl(inputUrl); // No form type provided

      expect(result).toContain('-index.html');
    });
  });

  describe('existing behavior preserved', () => {
    it('should pass through HTML files', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/21344/000155278125000454/e25454_ko-8k.htm';
      expect(getSecFilingViewerUrl(url)).toBe(url);
    });

    it('should convert directory URL to index', () => {
      const url = 'https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249';
      const result = getSecFilingViewerUrl(url);
      expect(result).toContain('-index.html');
    });
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="url-utils"
# Expected: ~4 failing tests (stylesheet URL construction tests)
```

### Step 2.2: Implement Smart XML URL Construction

**File**: `lib/email/url-utils.ts`

**Changes**:
1. Add form type parameter to `getSecFilingViewerUrl()`
2. Implement stylesheet URL construction for ownership forms and Form 144
3. Fallback to index page for unknown form types

```typescript
/**
 * Check if XML file already has an XSLT stylesheet path
 */
function hasXsltStylesheet(url: string): boolean {
  return /\/xsl[A-Z0-9]+\/[^/]+\.xml$/i.test(url);
}

/**
 * Get the appropriate XSLT stylesheet directory for a form type
 * - Form 3/4/5 (ownership forms): xslF345X05
 * - Form 144: xsl144X01
 */
function getXsltStylesheetDir(formType?: string): string | null {
  const normalizedType = formType?.toLowerCase().replace(/\s+/g, '') || '';

  // Form 3, 4, 5 (ownership forms)
  if (['form3', 'form4', 'form5', '3', '4', '5'].includes(normalizedType)) {
    return 'xslF345X05';
  }

  // Form 144
  if (['form144', '144'].includes(normalizedType)) {
    return 'xsl144X01';
  }

  return null; // Unknown form type - will fallback to index
}

/**
 * Validates and normalizes an SEC filing URL for use in email links.
 *
 * @param filingUrl - The SEC filing URL
 * @param formType - Optional form type (e.g., "Form 4", "Form 144") for smart XML handling
 * @returns A valid SEC filing URL optimized for user viewing
 */
export function getSecFilingViewerUrl(filingUrl: string, formType?: string): string {
  // Handle empty or invalid URLs
  if (!filingUrl || filingUrl.trim() === '') {
    return 'https://www.sec.gov/edgar/searchedgar/companysearch.html';
  }

  // If already an index URL, return as-is
  if (filingUrl.includes('-index.htm')) {
    return filingUrl;
  }

  // XML files with XSLT stylesheet already - pass through
  if (filingUrl.match(/\.xml$/i) && hasXsltStylesheet(filingUrl)) {
    return filingUrl;
  }

  // XML files WITHOUT stylesheet - construct proper viewer URL
  if (filingUrl.match(/\.xml$/i)) {
    const stylesheetDir = getXsltStylesheetDir(formType);

    if (stylesheetDir) {
      // Pattern: .../data/{CIK}/{ACCESSION}/{filename}.xml
      const xmlPattern = /^(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/)([^/]+\.xml)$/i;
      const match = filingUrl.match(xmlPattern);

      if (match) {
        const [, basePath, filename] = match;
        // Construct: .../data/{CIK}/{ACCESSION}/{stylesheetDir}/{filename}.xml
        return `${basePath}${stylesheetDir}/${filename}`;
      }
    }

    // Fallback: convert to index page for unknown form types or non-matching patterns
    const xmlIndexPattern = /\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/[^/]+\.xml$/i;
    const xmlMatch = filingUrl.match(xmlIndexPattern);
    if (xmlMatch) {
      const [, cik, accessionNoDashes] = xmlMatch;
      const accessionWithDashes = formatAccessionNumber(accessionNoDashes);
      return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionWithDashes}-index.html`;
    }
  }

  // HTML/HTM files - pass through
  if (filingUrl.match(/\.(html?|htm)$/i)) {
    return filingUrl;
  }

  // Directory URL pattern - convert to index
  const directoryPattern = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/?$/;
  const match = filingUrl.match(directoryPattern);
  if (match) {
    const [, cik, accessionNoDashes] = match;
    const accessionWithDashes = formatAccessionNumber(accessionNoDashes);
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionWithDashes}-index.html`;
  }

  return filingUrl;
}
```

**Checkpoint 2.2**: Run tests and verify they pass:
```bash
npm run test -- --testPathPattern="url-utils"
# Expected: All tests passing
```

### Step 2.3: Update Templates to Pass formType Parameter

Templates that render filing links need to pass the `formType` to `getSecFilingViewerUrl()` so it can construct the correct stylesheet URL.

#### 2.3.1: Update Form 144 Template Footer

**File**: `components/ui/email/templates/form144-template.tsx`

**Changes**: Import and use `getSecFilingViewerUrl()` with form type in the footer (line 565).

```typescript
// Add import at top:
import { getSecFilingViewerUrl } from '../../../../lib/email/url-utils';

// Change line 565 from:
href={filing.filingUrl || filing.url}
// To:
href={getSecFilingViewerUrl(filing.filingUrl || filing.url || '', 'Form 144')}
```

#### 2.3.2: Update EmailFooter Component

**File**: `components/ui/email/templates/sections/EmailFooter.tsx`

**Changes**: Add `formType` prop and pass to `getSecFilingViewerUrl()`.

```typescript
interface EmailFooterProps {
  filingUrl: string;
  formType?: string;  // Add this prop
  unsubscribeUrl?: string;
}

export function EmailFooter({ filingUrl, formType }: EmailFooterProps) {
  // Update to pass formType
  const viewerUrl = getSecFilingViewerUrl(filingUrl, formType);
  // ... rest unchanged
}
```

#### 2.3.3: Update Templates Using EmailFooter

Update these templates to pass `formType` to `EmailFooter`:

1. **`form4-minimalist-template.tsx`** (handles Form 3, 4, 5):
   ```typescript
   <EmailFooter filingUrl={filing.filingUrl || ''} formType={filing.formType || 'Form 4'} />
   ```

2. **`generic-minimalist-template.tsx`**:
   ```typescript
   <EmailFooter filingUrl={filing.filingUrl || ''} formType={filing.formType} />
   ```

3. **Other templates**: Pass through `formType` where `EmailFooter` is used.

**Checkpoint 2.3**: Verify build compiles:
```bash
npm run build
# Expected: Success
```

### Step 2.4: Final Phase Verification

**Automated Verification**:
- [ ] All URL tests pass: `npm run test -- --testPathPattern="url-utils"`
- [ ] Build compiles: `npm run build`
- [ ] No regressions: `npm run test`

**Manual Verification**:
- [ ] Test VRT Form 3 email - verify link leads to readable index page
- [ ] Test GOOGL Form 144 email - verify link leads to readable index page
- [ ] Test NVDA Form 4 email - verify link still works (has xsl path)

**STOP**: Await manual confirmation before proceeding to Phase 3.

---

## Phase 3: Enhance 8-K Schema for Complete Information

### Overview
Expand the 8-K schema to capture more material information and add extraction guidance.

### Step 3.1: Write Failing Tests

**Test File**: `__tests__/ai/prompts/8k-schema.test.ts`

```typescript
import { FORM_SCHEMAS } from '../../../lib/ai/prompts/unified-prompts';

describe('8-K Schema - Completeness', () => {
  const schema8K = FORM_SCHEMAS['8-K'];

  it('should include keyHighlights array for material facts', () => {
    expect(schema8K.properties.keyHighlights).toBeDefined();
    expect(schema8K.properties.keyHighlights.type).toBe('array');
  });

  it('should have guidance for extracting specific figures', () => {
    const financialImpact = schema8K.properties.financialImpact;
    expect(financialImpact.description).toContain('specific');
  });

  it('should include managementCommentary field', () => {
    expect(schema8K.properties.managementCommentary).toBeDefined();
  });

  it('should include sentiment field for market signal', () => {
    expect(schema8K.properties.sentiment).toBeDefined();
    expect(schema8K.properties.sentiment.enum).toEqual(
      expect.arrayContaining(['positive', 'negative', 'neutral', 'mixed'])
    );
  });
});
```

**Checkpoint 3.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="8k-schema"
# Expected: 2-3 failing tests
```

### Step 3.2: Enhance 8-K Schema

**File**: `lib/ai/prompts/unified-prompts.ts`

**Changes**: Expand the 8-K schema (lines 157-182) to include more fields.

```typescript
'8-K': {
  type: 'object',
  required: ['company', 'summary', 'eventType', 'keyHighlights', 'sentiment'],  // Added keyHighlights, sentiment
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
}
```

**Checkpoint 3.2**: Run tests and verify they pass:
```bash
npm run test -- --testPathPattern="8k-schema"
# Expected: All tests passing
```

### Step 3.3: Add 8-K Extraction Guidance

**File**: `lib/ai/prompts/unified-prompts.ts`

**Changes**: Expand the 8-K extraction guidance in `FORM_EXTRACTION_GUIDANCE` (line ~416-419).

```typescript
'8-K': `8-K EXTRACTION RULES:
- Item 2.02 (Results of Operations): Extract EXACT revenue, EPS, net income figures with YoY changes
- Item 7.01 (Regulation FD): Look for guidance or investor presentation highlights
- Item 8.01 (Other Events): Extract any material announcements, acquisitions, or strategic changes
- Item 5.02 (Director/Officer Changes): Note names, titles, and effective dates
- ALWAYS include: specific dollar amounts ($X.XB), percentage changes (+X% YoY), and key metrics
- Lead keyHighlights with the most investor-relevant fact
- If management provides a quote, include it in managementCommentary
- Sentiment: Set to "positive" for beats/good news, "negative" for misses/concerns, "neutral" for informational filings, "mixed" if both`
```

**Checkpoint 3.3**: Verify build compiles:
```bash
npm run build
# Expected: Success
```

### Step 3.4: Update 8-K Email Template to Display New Fields

**File**: `components/ui/email/templates/8k-minimalist-template.tsx` (or generic template if no 8-K-specific template exists)

**Changes**: Add display for sentiment badge and key highlights.

```typescript
// Sentiment badge component (add near top of template)
const SentimentBadge = ({ sentiment }: { sentiment?: string }) => {
  if (!sentiment) return null;

  const colors = {
    positive: { bg: '#ECFDF5', text: '#059669' },
    negative: { bg: '#FEF2F2', text: '#DC2626' },
    neutral: { bg: '#F3F4F6', text: '#6B7280' },
    mixed: { bg: '#FFFBEB', text: '#D97706' },
  };

  const color = colors[sentiment as keyof typeof colors] || colors.neutral;

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      backgroundColor: color.bg,
      color: color.text,
      fontSize: '12px',
      fontWeight: 600,
      borderRadius: '4px',
      marginLeft: '8px',
    }}>
      {sentiment.toUpperCase()}
    </span>
  );
};

// In template header, add sentiment next to event type:
<td style={{ fontSize: '14px', color: EmailColors.text.secondary }}>
  {filing.parsedContent?.eventType || 'Current Report'}
  <SentimentBadge sentiment={filing.parsedContent?.sentiment} />
</td>

// Add key highlights section if available:
{filing.parsedContent?.keyHighlights?.length > 0 && (
  <tr>
    <td style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
        Key Highlights
      </div>
      <ul style={{ margin: 0, paddingLeft: '20px' }}>
        {filing.parsedContent.keyHighlights.map((highlight, i) => (
          <li key={i} style={{ fontSize: '14px', marginBottom: '4px' }}>
            {highlight}
          </li>
        ))}
      </ul>
    </td>
  </tr>
)}
```

**Checkpoint 3.4**: Verify build compiles:
```bash
npm run build
# Expected: Success
```

### Step 3.5: Final Phase Verification

**Automated Verification**:
- [ ] All schema tests pass: `npm run test -- --testPathPattern="schema"`
- [ ] Build compiles: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

**Manual Verification**:
- [ ] Trigger summarization for a recent KO 8-K filing
- [ ] Verify keyHighlights array is populated with specific figures
- [ ] Verify financialImpact contains dollar amounts
- [ ] Verify sentiment badge displays correctly
- [ ] Verify summary reads like a professional financial news brief

**STOP**: Await manual confirmation that improvements are satisfactory.

---

## Testing Strategy

### TDD Test Design Principles

1. **One assertion per test** for clear failure diagnosis
2. **Descriptive test names** using "should [verb] when [condition]"
3. **Test behavior, not implementation** - focus on output quality
4. **Edge cases first** - test XML without stylesheets before happy path

### Test Categories

1. **Contract Tests** (Written First): Define expected prompt content and URL behavior
2. **Edge Case Tests**: XML files without stylesheets, empty URLs, malformed inputs
3. **Integration Tests**: Full summarization pipeline with new prompts
4. **Regression Tests**: Ensure existing Form 4 URLs still work

### Manual Testing Steps

1. **Send test emails using Resend MCP**:
   ```
   Use mcp_send_email to send test filing summaries to wilfredchen1@gmail.com
   ```

2. **Verify email content**:
   - Open email in Gmail web client
   - Check for markdown artifacts (no ### headers)
   - Click filing links and verify they open readable pages
   - Review summary quality for newsletter tone

3. **Test specific filings**:
   - KO 8-K: Verify complete financial data, no markdown, sentiment badge visible
   - NVDA 10-K: Verify scannable, newsletter-style summary
   - VRT Form 3: Verify link opens SEC stylesheet viewer (not raw XML)
   - GOOGL Form 144: Verify link opens SEC stylesheet viewer (not raw XML)

## Performance Considerations

- No performance impact expected - changes are to static prompt strings
- URL regex matching adds negligible overhead (~microseconds)
- No database changes required

## Migration Notes

- No migration needed - changes are backward compatible
- Existing summaries in database won't be affected
- New summaries will use updated prompts automatically

## References

- Original task: User feedback on email quality issues (2025-12-29)
- Related: `docs/plans/2025-12-28-simplify-json-parsing-pipeline.md`
- Email design system: `components/ui/email/design-system.ts`
- URL utilities: `lib/email/url-utils.ts`
- Unified prompts: `lib/ai/prompts/unified-prompts.ts`
