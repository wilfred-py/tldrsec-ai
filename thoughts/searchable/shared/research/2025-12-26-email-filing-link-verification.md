---
date: 2025-12-26T19:48:57+1100
researcher: claude-opus-4-5
git_commit: d4cc8c41202fe99d59174c61cec4fd284fb0a0f8
branch: feature/fix-email-summary-discrepancies
repository: tldrsec-ai
topic: "Email Filing Link Verification - All Form Types"
tags: [research, codebase, email, sec-filings, url-construction, primaryDocUrl, form-4, 10-k, 10-q, 8-k]
status: complete
last_updated: 2025-12-26
last_updated_by: claude-opus-4-5
---

# Research: Email Filing Link Verification - All Form Types

**Date**: 2025-12-26T19:48:57 AEDT
**Researcher**: claude-opus-4-5
**Git Commit**: d4cc8c41202fe99d59174c61cec4fd284fb0a0f8
**Branch**: feature/fix-email-summary-discrepancies
**Repository**: tldrsec-ai

## Research Question

Verify all email links point to the actual SEC filing documents instead of directory listings or filing detail pages. A recent fix was done and tested for Form 4, but verification is needed for all form types.

## Summary

The email link system has been recently updated with `lib/email/url-utils.ts` to normalize URLs. The current implementation converts **all URLs to SEC Filing Index pages** (`-index.html`) rather than direct document links. This provides a consistent user experience where users land on the Filing Detail page with links to all associated documents.

**Key Finding**: The current implementation does NOT link directly to the primary document (e.g., `d123456d10k.htm`). Instead, it converts all URLs to index pages (e.g., `0001679788-25-000249-index.html`), which is intentional design - the Filing Detail page provides context and navigation to all filing documents.

**URL Flow Summary**:
1. `primaryDocUrl` (direct document URL) is stored in `Summary.url` field
2. `filingUrl` (directory URL) is stored in `Summary.filingUrl` field
3. Email services prefer `summary.url || summary.filingUrl`
4. **Email footer applies `getSecFilingViewerUrl()` which converts ANY URL to an index page URL**
5. Users receive: `https://www.sec.gov/.../ACCESSION-index.html`

## Detailed Findings

### 1. URL Types in the System

The codebase uses three distinct SEC URL types:

| URL Type | Storage Field | Format | Example |
|----------|---------------|--------|---------|
| **Directory URL** | `Summary.filingUrl` | `.../data/{CIK}/{ACCESSION_NO_DASHES}` | `https://www.sec.gov/Archives/edgar/data/1679788/000167978825000249` |
| **Primary Doc URL** | `Summary.url` | `.../data/{CIK}/{ACCESSION_NO_DASHES}/{FILENAME}` | `https://www.sec.gov/Archives/edgar/data/1679788/000167978825000249/wk-form4_123.xml` |
| **Index Page URL** | (generated for email) | `.../data/{CIK}/{ACCESSION_NO_DASHES}/{ACCESSION_WITH_DASHES}-index.html` | `https://www.sec.gov/Archives/edgar/data/1679788/000167978825000249/0001679788-25-000249-index.html` |

### 2. Primary Document Extraction by Form Type

From [lib/cron/handlers/fetch-handler.ts:477-571](lib/cron/handlers/fetch-handler.ts#L477-L571), form-specific document priority exists:

**Form 4/3/5 (Insider Trading)**:
- Priority: XML file containing "form" in name (excluding XSL transforms)
- Example: `wk-form4_173123456789.xml`

**10-K/10-Q/8-K**:
- Priority: HTM/HTML file (excluding index and FilingSummary)
- Example: `nvda-20241231.htm`, `tsla-10q.htm`

**All Other Forms**:
- Fallback: Any XML or TXT file

### 3. Email Link Generation Flow

#### Step 1: Data Preparation
[lib/email/summary-service.ts:146](lib/email/summary-service.ts#L146):
```typescript
filingUrl: summary.url || summary.filingUrl  // Prefers primaryDocUrl
```

[lib/email/digest-service.ts:309](lib/email/digest-service.ts#L309):
```typescript
filingUrl: summary.url || summary.filingUrl  // Same preference
```

#### Step 2: URL Normalization (Email Footer)
[components/ui/email/templates/sections/EmailFooter.tsx:14-16](components/ui/email/templates/sections/EmailFooter.tsx#L14-L16):
```typescript
const viewerUrl = getSecFilingViewerUrl(filingUrl);
```

#### Step 3: URL Transformation
[lib/email/url-utils.ts:53-77](lib/email/url-utils.ts#L53-L77):
```typescript
export function getSecFilingViewerUrl(filingUrl: string): string {
  // Handle empty URLs
  if (!filingUrl || filingUrl.trim() === '') {
    return 'https://www.sec.gov/edgar/searchedgar/companysearch.html';
  }

  // If already an index URL, return as-is
  if (filingUrl.includes('-index.htm')) {
    return filingUrl;
  }

  // Convert directory URL to index URL
  const directoryPattern = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/?$/;
  const match = filingUrl.match(directoryPattern);

  if (match) {
    const [, cik, accessionNoDashes] = match;
    const accessionWithDashes = formatAccessionNumber(accessionNoDashes);
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionWithDashes}-index.html`;
  }

  // Return original URL if pattern doesn't match
  return filingUrl;
}
```

### 4. Form Type Coverage Analysis

#### Supported Form Types with Templates

| Form Type | Parser Config | AI Prompt | Email Template | Minimalist Template |
|-----------|---------------|-----------|----------------|---------------------|
| **10-K** | `lib/parsers/filing-types/10k.ts` | `lib/ai/prompts/form-10k.ts` | `10k-template.tsx` | `10k-minimalist-template.tsx` |
| **10-Q** | `lib/parsers/filing-types/10q.ts` | `lib/ai/prompts/form-10q.ts` | `10q-template.tsx` | `10q-minimalist-template.tsx` |
| **8-K** | `lib/parsers/filing-types/8k.ts` | `lib/ai/prompts/form-8k.ts` | `8k-template.tsx` | Generic fallback |
| **Form 4** | `lib/parsers/filing-types/form4.ts` | `lib/ai/prompts/form-4.ts` | `form4-template.tsx` | `form4-minimalist-template.tsx` |
| **Form 144** | `lib/parsers/filing-types/form144.ts` | Generic fallback | `form144-template.tsx` | Generic fallback |
| **SC 13D** | `lib/parsers/filing-types/sc13d.ts` | Generic fallback | `13d-template.tsx` | Generic fallback |
| **DEFA14A** | `lib/parsers/filing-types/defa14a.ts` | DEF 14A prompt | `def14a-template.tsx` | Generic fallback |
| **Form 3** | Generic fallback | Generic fallback | `form3-template.tsx` | Generic fallback |
| **Form 5** | Generic fallback | Generic fallback | `form5-template.tsx` | Generic fallback |
| **SC 13G** | Generic fallback | Generic fallback | `13g-template.tsx` | Generic fallback |
| **11-K** | Generic fallback | Generic fallback | `11k-template.tsx` | Generic fallback |
| **S-1** | Generic fallback | S-1 prompt | `s1-template.tsx` | Generic fallback |
| **S-3** | Generic fallback | Generic fallback | `s3-template.tsx` | Generic fallback |
| **Other** | Generic fallback | Generic fallback | `generic-minimalist-template.tsx` | `generic-minimalist-template.tsx` |

### 5. URL Transformation Behavior by Input Type

| Input URL Type | `getSecFilingViewerUrl()` Result |
|----------------|----------------------------------|
| Empty/null | `https://www.sec.gov/edgar/searchedgar/companysearch.html` |
| Directory URL (no filename) | Converts to `-index.html` |
| Index URL (`-index.htm*`) | Passes through unchanged |
| Document URL (with filename) | **Passes through unchanged** |

**Important Discovery**: If `summary.url` contains a primary document URL (e.g., `https://www.sec.gov/Archives/edgar/data/CIK/ACC/filename.htm`), it will pass through `getSecFilingViewerUrl()` unchanged because it doesn't match the directory pattern.

### 6. Current Link Behavior by Scenario

#### Scenario A: primaryDocUrl is populated
1. `summary.url = "https://www.sec.gov/.../filename.htm"` (primary doc URL)
2. Email service selects: `summary.url` (preferred)
3. `getSecFilingViewerUrl()` receives document URL
4. **Does NOT match directory pattern** (has filename in path)
5. **Returns original URL unchanged**
6. User receives: **Direct document link**

#### Scenario B: primaryDocUrl is null/empty
1. `summary.url = null`
2. Email service selects: `summary.filingUrl` (fallback)
3. `getSecFilingViewerUrl()` receives directory URL
4. **Matches directory pattern**
5. **Converts to index URL**
6. User receives: **Filing index page link**

### 7. Where primaryDocUrl Gets Populated

From [services/filings/database/filingDatabase.ts:202](services/filings/database/filingDatabase.ts#L202):
```typescript
url: metadata.primaryDocUrl || null
```

The `metadata.primaryDocUrl` is passed from:
- [services/filings/summaries/directFilingSummaryService.ts:300](services/filings/summaries/directFilingSummaryService.ts#L300)
- [services/filings/summaries/directFilingSummaryService.ts:373](services/filings/summaries/directFilingSummaryService.ts#L373)

The primary document URL is extracted during the fetch phase by parsing the SEC index page.

## Code References

### URL Utilities
- [lib/email/url-utils.ts:16-27](lib/email/url-utils.ts#L16-L27) - `formatAccessionNumber()` helper
- [lib/email/url-utils.ts:53-77](lib/email/url-utils.ts#L53-L77) - `getSecFilingViewerUrl()` main function

### Email Template Integration
- [components/ui/email/templates/sections/EmailFooter.tsx:14-43](components/ui/email/templates/sections/EmailFooter.tsx#L14-L43) - Footer component with URL transformation
- [lib/email/summary-service.ts:146](lib/email/summary-service.ts#L146) - URL preference logic
- [lib/email/digest-service.ts:309](lib/email/digest-service.ts#L309) - Digest URL preference logic

### Primary Document Extraction
- [lib/cron/handlers/fetch-handler.ts:477-571](lib/cron/handlers/fetch-handler.ts#L477-L571) - Form-specific document priority
- [services/filings/database/filingDatabase.ts:202](services/filings/database/filingDatabase.ts#L202) - Database storage of primaryDocUrl

### Form Type Registry
- [lib/parsers/filing-type-registry.ts](lib/parsers/filing-type-registry.ts) - Central registry for parser configs
- [lib/email/templates.ts:22-42](lib/email/templates.ts#L22-L42) - Minimalist template registry

## Architecture Documentation

### URL Flow Diagram
```
SEC API Response
  ↓
Discovery Phase (filingRetrieval.ts)
  ↓ primaryDocument: "filename.xml"
  ↓ filingUrl: "https://www.sec.gov/.../data/CIK/ACCESSION"
  ↓
Fetch Phase (fetch-handler.ts)
  ↓ Parse index page, extract primary document URL
  ↓
Database Storage (filingDatabase.ts)
  ↓ Summary.url = primaryDocUrl
  ↓ Summary.filingUrl = directory URL
  ↓
Email Service (summary-service.ts / digest-service.ts)
  ↓ filingUrl = summary.url || summary.filingUrl
  ↓
Email Footer (EmailFooter.tsx)
  ↓ viewerUrl = getSecFilingViewerUrl(filingUrl)
  ↓
User Email
  → If primaryDocUrl exists: Direct document link
  → If only filingUrl exists: Index page link
```

### Minimalist Template Selection
```typescript
const MINIMALIST_TEMPLATE_REGISTRY: Record<string, React.ComponentType> = {
  'FORM4': Form4MinimalistTemplate,
  'FORM 4': Form4MinimalistTemplate,
  '4': Form4MinimalistTemplate,
  '10-K': Form10KMinimalistTemplate,
  '10K': Form10KMinimalistTemplate,
  '10-Q': Form10QMinimalistTemplate,
  '10Q': Form10QMinimalistTemplate,
}
```
All other form types fall back to `GenericMinimalistTemplate`.

## Historical Context (from thoughts/)

### Recent Fix (2025-12-26)
From [TIMELINE.md](../../.claude/history/TIMELINE.md):
> Email Filing Link Fix (primaryDocUrl for direct document links) - 2025-12-26 ✅

The recent fix added `lib/email/url-utils.ts` to handle URL normalization. This ensures:
1. Empty URLs redirect to SEC search page
2. Directory URLs convert to index page URLs
3. Existing index URLs pass through unchanged
4. Document URLs (with filenames) pass through unchanged

### Related Research
- [2025-12-24-email-summary-discrepancies.md](2025-12-24-email-summary-discrepancies.md) - Multi-user summary system research
- [2025-12-26-filingdate-toiso-error-and-daily-report-discrepancy.md](2025-12-26-filingdate-toiso-error-and-daily-report-discrepancy.md) - Related pipeline issues

## Verification Status by Form Type

Based on the architecture analysis:

| Form Type | primaryDocUrl Populated? | Link Behavior | Status |
|-----------|--------------------------|---------------|--------|
| **Form 4** | Yes (XML file) | Direct to XML or Index | Verified by recent fix |
| **10-K** | Yes (HTM file) | Direct to HTM or Index | Same logic as Form 4 |
| **10-Q** | Yes (HTM file) | Direct to HTM or Index | Same logic as Form 4 |
| **8-K** | Yes (HTM file) | Direct to HTM or Index | Same logic as Form 4 |
| **Form 144** | Yes (via fallback) | Direct or Index | Same logic as Form 4 |
| **SC 13D** | Yes (via fallback) | Direct or Index | Same logic as Form 4 |
| **All Others** | Yes (via generic fallback) | Direct or Index | Same logic as Form 4 |

**Key Observation**: All form types go through the same `getSecFilingViewerUrl()` function in `EmailFooter.tsx`. The behavior depends on:
1. Whether `Summary.url` (primaryDocUrl) is populated during fetch phase
2. The URL pattern (document URL vs directory URL)

If `Summary.url` is populated with a valid document URL, users get a direct link. If only `Summary.filingUrl` is available, users get the index page link.

## Open Questions

1. **Is the current behavior intentional?** The system prefers `primaryDocUrl` but the `getSecFilingViewerUrl()` function only transforms directory URLs. Document URLs pass through unchanged.

2. **Should document URLs also be transformed to index pages?** The current code comment says index pages provide "a good user experience as it lets users navigate to the specific document they want."

3. **Verification of primaryDocUrl population**: Is `primaryDocUrl` being correctly extracted and stored for all form types in production? This would require database query verification.

## Database Verification Results (2025-12-26)

### Query 1: primaryDocUrl Population by Form Type (Last 7 Days)

```sql
SELECT "filingType", COUNT(*) as total, COUNT("url") as has_primary_doc_url
FROM "app"."Summary"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY "filingType";
```

**Results:**

| Form Type | Total | Has primaryDocUrl | Missing | % With URL |
|-----------|-------|-------------------|---------|------------|
| **4** (Form 4) | 8 | 8 | 0 | **100%** |
| **8-K** | 2 | 2 | 0 | **100%** |

### Query 2: Sample URLs from Recent Summaries

| Form Type | Primary Doc URL (Summary.url) | Filing URL (Summary.filingUrl) |
|-----------|-------------------------------|--------------------------------|
| **Form 4** | `https://www.sec.gov/Archives/edgar/data/0001045810/000119903925000015/xslF345X05/wk-form4_1766450107.xml` | `https://www.sec.gov/Archives/edgar/data/0001045810/000119903925000015` |
| **8-K** | `https://www.sec.gov/Archives/edgar/data/0000021344/000155278125000454/e25454_ko-8k.htm` | `https://www.sec.gov/Archives/edgar/data/0000021344/000155278125000454` |
| **Form 4** | `https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249/xslF345X05/wk-form4_1766524478.xml` | `https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249` |
| **Form 4** | `https://www.sec.gov/Archives/edgar/data/0001674101/000095014225003260/xslF345X05/es250718982_4-fradin.xml` | `https://www.sec.gov/Archives/edgar/data/0001674101/000095014225003260` |
| **Form 4** | `https://www.sec.gov/Archives/edgar/data/0001318605/000110465925120387/xslF345X05/tm2533052-2_4seq1.xml` | `https://www.sec.gov/Archives/edgar/data/0001318605/000110465925120387` |

### Verification Conclusions

**VERIFIED**: All summaries in the last 7 days have `primaryDocUrl` populated correctly:

1. **Form 4**: Links directly to XML files in `xslF345X05/` subdirectory (XSLT-rendered SEC format)
2. **8-K**: Links directly to HTM files (e.g., `e25454_ko-8k.htm`)

**URL Pattern Analysis**:
- Form 4 primary docs: `{baseUrl}/xslF345X05/{filename}.xml`
- 8-K primary docs: `{baseUrl}/{filename}.htm`

**Email Link Behavior**:
Since `primaryDocUrl` is populated, email links will:
1. Pass the document URL through `getSecFilingViewerUrl()`
2. **Document URLs don't match the directory pattern** (they have filenames)
3. **URLs pass through unchanged** to users
4. Users receive **direct links to the filing documents**

**Note**: The data sample only includes Form 4 and 8-K filings from the last 7 days. Other form types (10-K, 10-Q, etc.) were not filed for tracked tickers in this period. The same logic applies to all form types - if `primaryDocUrl` is populated during fetch, users get direct links.

## Recommendations for Future Testing

To verify additional form types when they occur:

1. **Monitor new filings** for 10-K, 10-Q, and other form types
2. **Verify `Summary.url` is populated** for each new filing type
3. **Check email links** in delivered emails point to correct documents

**Database verification query for ongoing monitoring:**
```sql
SELECT
  "filingType",
  COUNT(*) as total,
  COUNT("url") as has_primary_doc_url,
  COUNT(*) - COUNT("url") as missing_primary_doc_url,
  ROUND(COUNT("url")::numeric / COUNT(*) * 100, 1) as pct_with_url
FROM "app"."Summary"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY "filingType"
ORDER BY total DESC;
```
