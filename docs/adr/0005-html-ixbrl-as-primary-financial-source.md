# ADR-0005: HTML iXBRL parsing as primary source for financial extraction

Date: 2026-05-24
Status: accepted

## Context

The NVDA 10-Q failure of 2026-05-20 (email shipped saying "no extractable quarterly financial metrics" for a filing that contained $81.6B revenue, $58.3B net income, $2.39 diluted EPS) exposed that the SEC filing summarization pipeline was passing raw inline-XBRL HTML directly to Grok with no preprocessing. All 10-Q/10-K filings since 2019 are required to be filed in inline-XBRL (iXBRL) format, where financial figures live inside `<ix:nonFraction>` tags rather than plain HTML text nodes. Without preprocessing, naive `cheerio.text()` extraction either drops these values or surfaces them as naked numbers stripped of currency symbols and labels.

The fix plan (see `.claude/tasks/nvda-10q-missing-metrics-fix.md`) lays out 5 layers — Layer A (iXBRL extraction) shipped as commit `3bf53dd3`; Layers B–E deferred. In choosing how Layer A should extract financial data, two architectural paths existed:

**Path 1 — HTML iXBRL parsing.** Preprocess raw iXBRL HTML to strip namespace noise (`<ix:hidden>`, `<xbrli:*>`, `<link:*>`, `<xlink:*>`) and unwrap value-bearing tags (`<ix:nonFraction>`, `<ix:nonNumeric>`). Run the cleaned HTML through cheerio's structural extraction. Single fetch covers both narrative (MD&A, Risk Factors, Competition prose) and numbers in one cache entry.

**Path 2 — SEC Companyfacts JSON API.** Fetch `data.sec.gov/api/xbrl/companyfacts/CIK{n}.json` for authoritative, SEC-normalized financial values. Schema is stable across filers. SEC handles scale-attribute (`scale="6"` meaning displayed "81,600" is $81.6B), currency, and period normalization. Does NOT include narrative sections — would require a parallel HTML fetch for MD&A, Risk Factors, etc.

A future reviewer encountering Layers A/B will absolutely ask: "Why are we parsing iXBRL HTML when SEC publishes the same data as structured JSON?" Without a written record, this risks being re-litigated as part of routine architecture review or by a contributor who knows EDGAR well. This ADR documents the chosen tradeoff so it isn't re-opened without new evidence.

## Decision

### 1. HTML iXBRL is the primary financial extraction source

Layer A's `preprocessIxbrl()` + `cleanHtmlContent()` pipeline (`lib/parsers/filing-extractor.ts`) is the single canonical path from a fetched SEC filing to summarizer-ready text. Layer B's section extractor (forthcoming, `lib/parsers/sec-section-extractor.ts`) operates on the output of that pipeline. Layer C's content gate (`hasFinancialStatementSignal`) runs on the cleaned text.

The Companyfacts API is NOT a fallback or alternate path for primary extraction. The Layer A pipeline is single-source.

### 2. Companyfacts API is reserved for a post-LLM numeric validation gate

The most dangerous failure mode in Path 1 is silent numeric-scale misreading: Grok extracts "81,600" from a `<ix:nonFraction scale="6" decimals="-6">81600</ix:nonFraction>` tag without recognizing the `scale="6"` attribute, and the summary ships saying revenue was $81.6 thousand instead of $81.6 billion. This is worse than the NVDA "no metrics" failure because it ships plausible-looking wrong numbers.

The Companyfacts API solves this exactly: it returns authoritative SEC-normalized headline values. The reserved architecture is a post-LLM gate that:

1. After Grok produces a summary with `financialHighlights[]`, fetch `data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json` for the same filer.
2. Look up the most recent values for the top headline concepts: `us-gaap:Revenues`, `us-gaap:NetIncomeLoss`, `us-gaap:EarningsPerShareDiluted`.
3. Compare against Grok's extracted values within ±1% tolerance.
4. On disagreement, set `processingErrorCode = 'NUMBER_DISAGREEMENT'` (registered in `lib/db/summary-status.ts` PROCESSING_ERROR_CODES) and fail `hasUsableFinancialHighlights` gate.

This is a future PR. It requires no changes to Layers A, B, or C — only a new module and a new error code. Sectionizer (Layer B) is unaffected because it operates on narrative text.

### 3. Why Path 1 over Path 2 as primary

- **Narrative coverage.** Companyfacts is numbers-only. The summarizer needs MD&A, Risk Factors, and Competition prose for the qualitative parts of the email. Making Companyfacts primary means maintaining two parallel extraction pipelines (numbers from API, narrative from HTML), with their own caching, rate-limiting, and error handling. HTML primary keeps everything in one fetched document.
- **Single FilingContentCache architecture.** The existing cache stores one document per accession. Adding a parallel "structured financials" cache table is a non-trivial schema change and requires synchronizing two TTLs.
- **EDGAR rate limits.** SEC enforces 10 req/sec across all endpoints for a single User-Agent. Doubling the fetch count per filing halves throughput.
- **Custom-tag coverage.** Filers commonly extend the GAAP taxonomy with custom tags (NVDA reports `DataCenterRevenue` for segment breakdowns). Companyfacts only covers tagged values; custom segment data still requires HTML parsing.
- **Layer A is already shipped.** Reversing now means discarding the 349-line, 13-test, committed Layer A foundation that Layer B/C/E depend on. The cost is real and not offset by Companyfacts benefits as a primary source.

## Consequences

- Layer A's `preprocessIxbrl()` + `cleanHtmlContent()` is the canonical primary extraction. Future contributors must not introduce a parallel structured-data primary path without superseding this ADR.
- Numeric-scale bugs (silent misreading of `scale=` attributes) are a known accepted risk for the primary path. The mitigation is the reserved Companyfacts post-LLM gate, not changes to the primary parser.
- A future "number validation" PR is well-scoped: one new module that calls `data.sec.gov/api/xbrl/companyfacts/CIK{n}.json`, one new `PROCESSING_ERROR_CODES` entry, one new `ErrorCode` enum value in `lib/error-handling/constants.ts`. No changes to Layers A/B/C.
- Sectionizer (Layer B), content gate (Layer C), and backfill (Layer E) all operate on the Layer A output. They inherit the "HTML primary" assumption.
- If the post-LLM numeric gate proves insufficient (e.g. Grok consistently picks the wrong line in a table), the next step is improving Layer A's HTML extraction, NOT switching to Companyfacts primary. Companyfacts remains a validation tool, not a source-of-truth replacement.
- This ADR can be superseded if: (a) Companyfacts adds narrative section coverage, OR (b) numeric-scale bugs prove unfixable in HTML parsing and ship more frequently than the post-LLM gate can catch, OR (c) EDGAR rate-limit changes make double-fetch viable. None of these are expected.
