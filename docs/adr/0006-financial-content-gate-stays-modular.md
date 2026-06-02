# ADR-0006: Financial Content Gate stays as its own module

Date: 2026-06-02
Status: accepted

## Context

The autonomous architecture review routine considered inlining
`lib/ai/parsers/financial-content-gate.ts` as private functions inside
`lib/ai/summarize.ts`. The candidate fits the surface pattern of recent
deepenings:

- **Why It Matters Guard** (PR #616) — inlined from
  `lib/ai/parsers/why-it-matters.ts` into Summarize.
- **Ticker Grounding Guard** (PR #625) — inlined from
  `lib/ai/parsers/ticker-grounding.ts` into Summarize.
- **Historical Context** — was inlined for the same reason.

All three precedents pulled "extracted-for-testability" pure functions
that had exactly one production caller (Summarize) into private
functions inside that caller, deleting the standalone unit tests in
favour of interface-level integration tests at the Summarize seam.

`lib/ai/parsers/financial-content-gate.ts` has the same caller profile
(one production caller, `lib/ai/summarize.ts`) and is named in
CONTEXT.md "Extractable" as the canonical implementation of the
extractable-filing predicate.

## Decision

**Do not inline.** The Financial Content Gate stays at
`lib/ai/parsers/financial-content-gate.ts` with its current interface
(`hasFinancialStatementSignal`, `hasUsableFinancialHighlights`,
`requiresFinancialContent`, `summaryHasFailurePhrase`) and its current
test surface (`__tests__/ai/parsers/financial-content-gate.test.ts`).

## Reasons (load-bearing)

### 1. Test coverage at the Summarize seam does not yet exist

The Why It Matters and Ticker Grounding inlines were safe because
`__tests__/lib/ai/summarize-grounding-wireup.test.ts` already exercised
both guards through the Summarize interface — the unit-test deletions
were absorbed by existing integration tests, not deferred to
hypothetical future ones.

For the Financial Content Gate, the equivalent integration test does
not exist. `summarize-data-storage.test.ts`,
`summarize-with-extraction.test.ts`, and
`summarize-b3-sectionizer.test.ts` either ignore the gate or mock it
to `ok: true`. Inlining and deleting
`__tests__/ai/parsers/financial-content-gate.test.ts` (36 tests
covering 5 pre-LLM signals, 3 post-LLM signals, the C1 strict-form
tightening, the C6 summary-text failure-phrase check, and the form-type
allowlist) would drop gate-behaviour coverage to zero.

Recreating those 36 cases as Summarize-seam integration tests requires
mocking the Prisma client, the OpenRouter client, and a full Filing
record per case — substantially heavier than the original pure-function
tests, with no leverage gain.

### 2. The gate is closer to a stand-alone module than a "guard"
coercion

The inlined guards (Why It Matters, Ticker Grounding, Historical
Context) are *coercions* — small post-parse transformations that
normalize a single field of the Summarize result. Their implementations
were ~40-90 LOC of overlap detection or token comparison.

The Financial Content Gate is structurally different: 263 LOC across
four pure-function exports with substantial regex vocabulary
(`PERIOD_HEADER_RE`, `STATEMENT_TITLE_RE`, ten `LINE_ITEMS` patterns,
`DOLLAR_FIGURE_RE`, `SUMMARY_FAILURE_PHRASES_RE`), three signal
thresholds, and the `STRICT_FINANCIAL_FORMS` allowlist. Each export
hides 60+ LOC of regex/threshold logic — the implementation:interface
ratio is closer to a deep module than a shallow guard.

### 3. There is latent second-caller demand

`scripts/backfill-bad-summaries.ts:45` contains the comment
*"Same regex as financial-content-gate.ts:SUMMARY_FAILURE_PHRASES_RE"*
above its own copy of the failure-phrase regex. The script could
import from the gate module today; that it doesn't is a separate
locality bug, not a justification for collapsing the seam. A second
real caller turning the hypothetical seam into a real one (per
LANGUAGE.md "two adapters means a real seam") is one PR away, not
hypothetical.

## Consequences

- **CONTEXT.md "Extractable"** continues to reference
  `lib/ai/parsers/financial-content-gate.ts` as the canonical
  implementation. No CONTEXT.md update required.
- Future architecture reviews should not re-suggest the inline without
  one of the following changing:
  1. An integration test at the Summarize seam covers the gate's
     pre/post-LLM behaviour with the same depth as the current unit
     suite (the 5 pre-LLM signals + 3 post-LLM signals + C1/C6
     tightenings).
  2. `scripts/backfill-bad-summaries.ts` is consolidated to import
     from the gate, AND no other caller emerges in the meantime.
- If a *third* caller emerges, the gate becomes a textbook
  "two-adapters-equals-real-seam" case and should be deepened by
  widening the interface to better serve callers, not collapsed.

## Cross-reference

- ADR-0002 (Inline Analysis-Depth Scoring) — the precedent for
  inlining a one-caller pure function. The decisive factor there was
  that `calculateCompositeScore` tests at the composite (Summarize)
  level already exercised the depth-scoring behaviour. The same factor
  does not hold here.
- CONTEXT.md "Why It Matters Guard", "Ticker Grounding Guard",
  "Historical Context" — the inlined-guard pattern this ADR
  consciously deviates from.
