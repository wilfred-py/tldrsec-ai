# tldrsec-ai: Summarization Prompt & Logic Gaps — Detailed Implementation Plan

**Status**: Approved (Owner decisions captured)  
**Date**: 2026-05-26  
**Repo**: wilfred-py/tldrsec-ai (main)  
**Approved by**: Owner via interactive review session  
**Source**: Deep static analysis + historical research docs (`thoughts/shared/research/2026-02-18-summary-quality-review.md`, `2026-01-20-filing-summary-email-quality-gaps.md`, etc.) + current `main` branch

---

## Owner Decisions (Cross-Cutting)

- **Dual-stack strategy**: Option A — deprecate the enhanced stack entirely. The pipeline that generates the richest summaries should be prioritized; anything else will be deleted from the codebase after a clean migration window.
- **Tiered interpretation (WIM) philosophy**: Park for now. No current users. The main difference between MAX and Pro today is X-sentiment analysis. Revisit after product-market fit.
- **Tail form prioritization**: No current users. Can ignore deep extraction guidance for 11-K, 20-F, 6-K, DEFA14A, FWP, 424B3/5, S-4, etc. until we validate product-market fit with actual users.
- **Sequencing preference**: P0-first.

---

## Approved Scope (What Is In / Out for Now)

**In scope (active work)**:
- Gap 01: Dual-stack (highest priority)
- Gap 03: Forced non-empty arrays / filler content
- Gap 09: No final "Meaningfulness / Novelty" gate (P0)
- Gap 10: Service layer fragmentation (as part of Gap 01 cleanup)
- Gap 05: Extractor upgrades (source-text rescue)
- Gap 06: Chunking / section budget starvation
- Gap 07: Historical context quality filter
- Gap 08: Silent normalization observability
- All supporting cross-cutting work (testing, observability, deprecation hygiene)

**Parked until PMF / real users** (explicit owner decision):
- Gap 02: Uneven form coverage & shallow Generic path (only monitor volume for now)
- Gap 04: Tier-gated `whyItMatters` two-class UX (no "WIM Lite" investment yet)

---

## Gap Inventory & Execution Plan

### 01. Dual-Stack Summarization (Primary vs Enhanced) — P0

**Priority**: P0 | **Effort**: M | **User Impact**: Critical

**Files primarily involved**: `services/filings/enhanced/aiSummarizer.ts`, `services/filings/summaries/filingSummaryService.ts` (`ENABLE_ENHANCED_SUMMARIZATION`), `lib/ai/summarize.ts` + `unified-prompts.ts`

Two completely different prompt systems and output contracts exist. The enhanced path uses loose generic prompts + direct Claude + naive aggregation. When the flag is on, users receive inconsistent or unrenderable summaries.

**Root cause**: Historical experimentation path was never fully retired or aligned. The main cron path uses the hardened unified system; API callers can hit the weak path.

**Implementation steps**:
1. Deprecate enhanced stack entirely (owner decision). Remove the `ENABLE_ENHANCED_SUMMARIZATION` flag and the entire `services/filings/enhanced/` directory after a 4-week migration window.
2. During the window, add a hard runtime assertion + test that any call hitting the old path throws a clear deprecation error with migration instructions.
3. Update all call sites in `services/filings/summaries/filingSummaryService.ts` and any other consumers to use the canonical `summarizeFilingWithValidation` surface.
4. Add a large regression test that compares output shape + key field presence for the same 30+ real filings before/after the cutover.
5. Update CLAUDE.md and any internal architecture docs to reflect the single canonical path.

**Owner feedback captured**:
- Is `ENABLE_ENHANCED_SUMMARIZATION` currently enabled for any production customer traffic? → Option A (deprecate).

**Verification**:
- [ ] New or updated tests in `__tests__/ai/` or `lib/ai/__tests__` cover the changed path
- [ ] Manual test with 3–5 real filings of the affected type (before/after screenshots or diff)
- [ ] Metrics / logs show expected movement (e.g. drop in partial-result rate)
- [ ] `ENABLE_ENHANCED_SUMMARIZATION` removed from all environments and CI

---

### 03. Forced Non-Empty Arrays Produce Filler Content — P1

**Priority**: P1 | **Effort**: S | **User Impact**: Medium-High

**Files primarily involved**: `lib/ai/prompts/unified-prompts.ts:1253` (rule 7 in `BASE_SYSTEM_PROMPT`)

The model is explicitly told that every array must contain at least one item. On quiet or routine filings this forces hallucinated risk factors, key points, or highlights that add no value and can mislead users.

**Root cause**: Schema strictness was prioritized for parse reliability. No corresponding "this field can legitimately be empty" escape hatch for low-signal filings.

**Implementation steps**:
1. Introduce a controlled sentinel value (`__NONE__` or omit the field) for low-signal cases.
2. Update all relevant schemas and the system prompt to say: "Use an empty array or the sentinel when there is genuinely no new material content in this category."
3. Add post-processing in the parser (`response-parser.ts` or `simple-parser.ts`) that strips obvious filler items generated only to satisfy the rule.
4. Add a unit test that a 10-K with no new risks produces an empty `riskFactors` array (or sentinel).
5. Add a metric `ai.filler_array_injection` for ongoing visibility.

**Owner feedback captured**:
- Preferred sentinel approach: empty array, special string, or allow the field to be absent entirely? → Proceed with proposed solution (empty array + post-processing strip).

**Verification**:
- [ ] New or updated tests in `__tests__/ai/` or `lib/ai/__tests__` cover the changed path
- [ ] Manual test with 3–5 real filings of the affected type (before/after screenshots or diff)
- [ ] Metrics / logs show expected movement (e.g. drop in partial-result rate)

---

### 05–08 & 10. Supporting Gaps (P1–P2)

These are lower priority but should be sequenced after the P0 items or in parallel where they have low blast radius.

- **05. Extractors Run Only on AI Prose**: Pass original `processedContent` into the validation layer. Upgrade Form 4, 10-K, and 8-K extractors to also read source text when AI fields are empty/low-confidence. Add confidence scoring.
- **06. Chunking & Section Budgets**: Add "second pass" mode for filings >140k tokens after sectioning (lightweight summarizer → compact context digest). Make per-section budgets configurable. Add token-reach metric.
- **07. Historical Context Poisoning**: Add quality gate — only inject prior summaries with `processingStatus === 'COMPLETED'` and not marked partial. Optionally surface a one-line quality note.
- **08. Silent Normalization Observability**: Add `sanitization_log` (or at minimum structured logging) recording every dropped/redacted field + reason. Surface subtle footer note for MAX users on affected filings.
- **10. Service Layer Fragmentation**: As part of Gap 01 cleanup, create a single `lib/summarization/` barrel that re-exports the canonical public API. Add an ADR + architecture diagram. Add a "summarization contract test."

**Verification pattern** (apply to all):
- New or updated tests
- Manual test on 3–5 real filings
- Metrics movement

---

### 09. No Final "Meaningfulness / Novelty" Gate — P0

**Priority**: P0 | **Effort**: L | **User Impact**: High

**Files primarily involved**: `lib/ai/summarize.ts` (all gates), `lib/ai/parsers/financial-content-gate.ts`

All current gates are structural or financial-signal. A filing can pass every gate and still produce a three-sentence generic summary + routine scorecard on a genuinely material event.

**Root cause**: Focus has been on "don't ship broken JSON" and "don't ship $NaN". We have not yet built a "did this summary actually add insight?" layer.

**Implementation steps**:
1. Build a lightweight summary quality scorer (heuristic + optional small-model judge) that runs after parsing and before persistence.
2. Signals: lexical diversity vs prior summaries for the same ticker, presence of specific numbers + entities from the source (cross-reference grounding), non-repetition of headline in body, absence of obvious boilerplate phrases, etc.
3. When score is below threshold on a high-importance filing, mark as `PARTIAL` (or new status) and suppress email. Route to internal review queue for the first 30–60 days.
4. Land as a new `processingStatus` variant + monitoring counter (`ai.summary_meaningfulness_score`).
5. Expose a simple admin view / Slack alert for low-scoring "critical" filings.

**Owner feedback captured**:
- Should a low meaningfulness score on a 'critical' importance filing block the email, or only flag it for internal review? → Proceed with proposed solution (block + alert).
- Do you want this scorer to be heuristic-only at first, or are you willing to spend a small model call per filing? → Proceed with proposed solution (start heuristic, add small model later if needed).

**Verification**:
- [ ] New or updated tests in `__tests__/ai/` or `lib/ai/__tests__` cover the changed path
- [ ] Manual test with 3–5 real filings of the affected type (before/after screenshots or diff)
- [ ] Metrics / logs show expected movement (e.g. drop in partial-result rate, especially on high-importance filings)

---

### Parked Gaps (Explicitly Deferred Until PMF)

- **02. Uneven Form Coverage & Shallow Generic Path** — Monitor production volume by form type. No deep extraction guidance investment until real users exist.
- **04. Tier-Gated Interpretation (whyItMatters)** — Current mechanical pill fallback for non-MAX users is acceptable for now. Revisit after product-market fit. No "WIM Lite" work in the current plan.

---

## Cross-Cutting Work (Required)

- Consolidate or clearly deprecate the parallel enhanced stack (Gap 01).
- Land a lightweight summary meaningfulness scorer (Gap 09).
- Improve observability around sanitization, filler injection, and per-form quality.
- Update `CLAUDE.md` + relevant ADRs with the new single-path mental model.
- Add "summarization contract test" harness that any future caller must satisfy.
- 4-week deprecation window + clear migration docs for the enhanced stack removal.

---

## Sequencing & Milestones (P0-First)

**Phase 1 (2–3 weeks)** — Highest risk reduction
- Gap 01 (dual-stack deprecation + canonical path enforcement)
- Gap 09 (meaningfulness scorer) — start with heuristic
- Gap 03 (forced-array filler) — quick win

**Phase 2 (2 weeks)**
- Gaps 05, 06, 07, 08 (extractor, chunking, historical, observability improvements)
- Gap 10 (service layer cleanup as part of Phase 1)

**Phase 3 (ongoing / post-PMF)**
- Revisit parked gaps (02, 04) once real user volume and feedback exist.
- Expand to tail forms.
- Iterate on the meaningfulness scorer (add small model judge if data supports it).

**Success Metrics (target after Phase 1 + 2)**
- Zero unmeaningful summaries shipped for allowlisted high-volume forms on the canonical path.
- Partial-result rate on 10-K/10-Q/8-K/Form 4 < 0.4%.
- Clear single canonical summarization entry point with 100% test coverage of the contract.

---

## Appendix: References

- `thoughts/shared/research/2026-02-18-summary-quality-review.md` (original validation gap discovery)
- `thoughts/shared/research/2026-01-20-filing-summary-email-quality-gaps.md` (real user-reported UX issues)
- `lib/ai/prompts/unified-prompts.ts` (current production prompt system)
- `lib/ai/summarize.ts` + `lib/ai/summarize-with-validation.ts` (canonical pipeline)
- `lib/ai/parsers/financial-content-gate.ts` (existing defense-in-depth)
- `services/filings/enhanced/aiSummarizer.ts` (to be removed)

---

**Next step after this document is approved**: Create the first implementation task (Gap 01 dual-stack deprecation) in the normal task tracker / GitHub project and begin execution.

This plan is now the single source of truth for closing the identified summarization UX gaps.