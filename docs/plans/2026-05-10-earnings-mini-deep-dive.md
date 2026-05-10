# Earnings Filings Mini Deep Dive (10-K / 10-Q) Implementation Plan

**Date**: 2026-05-10 21:18:55 UTC
**Git Commit**: 276a8b0a41bce0872b1bdbf1d0a7d4494b1675b7
**Branch**: claude/enhance-earnings-filings-MuVkg
**Repository**: tldrsec-ai

## Overview

Add a structured "mini deep dive" layer to 10-K and 10-Q summaries so they read like a news equity-research analyst's note rather than a basic earnings recap. The reader gets: a materiality signal (badge + prose), market/industry/macro context grounded in the filing's own MD&A and risk-factor language, peer context (10-K) or QoQ thematic delta (10-Q), and tighter use of the existing X-sentiment + prior-filing rails that are already in production.

The scope is intentionally additive — existing `financialHighlights`, `keyPoints`, `whyItMatters`, `quarterlyTrends`, `riskFactors`, and the active in-flight quality fixes (`2026-02-18-summary-quality-fixes.md`) remain untouched.

## Current State Analysis

**Active prompt dispatch** flows through `lib/ai/prompts/unified-prompts.ts`:
- `FORM_SCHEMAS['10-K']` at `unified-prompts.ts:206-241` — required: `company, summary, fiscalYear, financialHighlights`; optional: `segments, riskFactors, keyPoints, whyItMatters`.
- `FORM_SCHEMAS['10-Q']` at `unified-prompts.ts:243-301` — required: `company, summary, fiscalQuarter, financialHighlights`; optional: `quarterlyTrends, guidanceUpdates, riskFactors, keyPoints, whyItMatters`.
- `FORM_EXTRACTION_GUIDANCE['10-K']` at `unified-prompts.ts:1254-1277` and `['10-Q']` at `1279-1328` hold the per-form extraction rule text.

**Active summarization entrypoint** is `lib/ai/summarize.ts`:
- Line 762 — `getHistoricalSummaries(tickerSymbol, filingDateStr)` already returns the company's prior summaries from the DB.
- Line 764 — `buildContextEnrichedPrompt(processedContent, historicalSummaries)` already injects a "Historical Context" block; the 10-Q extraction rule at `unified-prompts.ts:1289, 1313` already references this block for QoQ math.
- Line 779 — `ENRICHMENT_FORM_TYPES = new Set(['8-K', '8-K/A', '424B2', '424B3', 'FWP'])` — **10-K/10-Q are NOT in this set**, so web-search enrichment is currently inert for earnings filings.
- Line 813-843 — X-sentiment runs on all `HIGH_IMPORTANCE_FORMS` for allowlisted tickers; `lib/ai/x-sentiment-eligibility.ts:29-30` includes `10-K`, `10-K/A`, `10-Q`, `10-Q/A`. **X-sentiment is already flowing for earnings; the model just doesn't have an explicit place to surface it in the summary structure.**

**Existing enrichment framework** at `lib/ai/web-search-context.ts`:
- `EnrichmentProvider` interface + `createItemBasedProvider` factory.
- `runEnrichment` orchestrator: parallel execution, 45s total / 20s per-provider budgets, OpenRouter `web_search` tool via `x-ai/grok-4.3` model, idempotent cost-ledger debits at ~$0.003/call, 10-min in-memory cache, 2000-char drop-not-truncate cap.
- 5 existing providers (counterparty, governance, debtIssuance, earnings, capitalReturn) — **none target 10-K or 10-Q**.

**Existing data assets**:
- `lib/sec-edgar/sic-sector-map.ts` exports `sicToSector(sicCode)` — SIC-based sector classification already in place. Sufficient for SIC-based peer-set lookup.
- `prisma/schema.prisma` `model Summary` has `summaryJSON Json?` (line 122) — new structured thematic fields persist here with no schema migration.

**Active rendering** at `components/ui/email/templates/10k-minimalist-template.tsx` (311 lines) and `10q-minimalist-template.tsx` (646 lines), fed by `lib/email/10k-data-extractor.ts` (517 lines) and `10q-data-extractor.ts` (487 lines) via `template-registry.ts` and `extractor-registry.ts`.

**Banned-phrase guardrail** at `unified-prompts.ts:1195`: `"dive into", "deep dive"` are banned in summary output copy. The user's "mini deep dive" framing is **conceptual** — output prose must use "market context", "industry view", "macro lens", "trend shift", etc., not the literal banned phrases. **This ban stays in place.**

**No-extrapolation rule** at `unified-prompts.ts:1123` is the harder constraint: the model is forbidden from "filling in" numbers from prior filings, industry benchmarks, or context. The new sections must be grounded in either (a) the filing's own MD&A / risk factors / business overview, (b) prior-filing summaries already in our DB, (c) X-sentiment payloads already produced, or (d) explicit web-search enrichment context that the orchestrator pipes in as labelled text blocks. Generic model knowledge is still off-limits.

### Key Discoveries:
- The prior-filings comparison rail is already built (`summarize.ts:762`); we just need new schema fields that demand the model use it explicitly for thematic delta, not just for QoQ math.
- X-sentiment is already produced for 10-K/10-Q (when ticker is allowlisted) and `capturedXSentiment` is already persisted to `summaryJSON` — we just need new schema fields that surface it.
- Adding 10-K/10-Q to `ENRICHMENT_FORM_TYPES` is a one-line change; the lift is in the **new providers**, not the wiring.
- `getEnrichmentContext` already returns formatted text blocks under section headers like `--- COUNTERPARTY CONTEXT (web search) ---` — new providers slot into this pattern unchanged.
- "deep dive" is BANNED COPY at `unified-prompts.ts:1195`. The feature concept stays; the words stay banned.

## Desired End State

A summarized 10-K or 10-Q email renders an analyst-grade brief with five layered surfaces:

1. **Materiality badge** at the top: HIGH / MEDIUM / LOW / NOISE — derived from filing content (revenue surprise magnitude, new risk factors, guidance changes, control deficiencies, etc.) plus a one-sentence rationale.
2. **Market Context block** (both): 2-3 sentences placing the quarter/year in industry and macro framing, grounded in the filing's MD&A "Trends and Uncertainties" + Risk Factors language + (when present) X-sentiment direction.
3. **Thematic Takeaways** (both): 3-4 bullets that step back from line-item finance — what story the filing tells about the company's bigger arc.
4. **Peer Context** (10-K only): 1-2 sentences positioning revenue growth, margin, or capital allocation against same-sector peers (SIC-based) using web-search enrichment as the data source.
5. **Trends Delta** (10-Q only): 2-3 explicit before/after comparisons against the prior 10-Q — what shifted in tone, risk language, guidance, or segment performance.

Existing scorecard, headline, summary, financialHighlights, segments, riskFactors, whyItMatters, etc. remain visually and functionally unchanged.

Verification:
- `npm test -- --testPathPattern="(unified-prompts|10k|10q|earnings|market-context|peer-context|thematic|materiality)"` passes.
- A real recent NVDA 10-K and AAPL 10-Q processed end-to-end populate every new field at ≥80% fill rate across 10 representative tickers.
- Cost-per-summary observed in production telemetry for 10-K ≤ $0.30 and 10-Q ≤ $0.18 (vs current $0.148 / $0.088 baselines from `2026-01-16-summary-table-field-analysis.md`).

## What We're NOT Doing

- **Not** adding general-model-knowledge prose unmoored from filing/enrichment grounding — the no-extrapolation rule at `unified-prompts.ts:1123` stays.
- **Not** unbanning the literal phrase "deep dive" in output copy.
- **Not** building a curated per-ticker peer-set table — SIC-based peer lookup is the default, with web-search fallback. (Curation can come later if SIC proves too coarse.)
- **Not** extending the prior-filing comparison beyond single-period diffs (10-K-vs-prior-10-K YoY; 10-Q-vs-prior-10-Q QoQ). No rolling 4-quarter trends in v1.
- **Not** changing the existing `whyItMatters`, `financialHighlights`, `quarterlyTrends`, or `keyPoints` fields. The in-flight `2026-02-18-summary-quality-fixes.md` plan owns those.
- **Not** changing `template-registry.ts`, `extractor-registry.ts`, or filing-type detection. Routing is fine as-is.
- **Not** building a new dashboard surface — `summaryJSON` is the persistence target; dashboard rendering is downstream.
- **Not** adding new Prisma columns. All net-new fields land inside `Summary.summaryJSON`.
- **Not** rewriting `form-10k.ts` / `form-10q.ts` standalone classes — those are not the live path.

## Implementation Approach

Apply Elon's 5-step algorithm to scope:

1. **Question every requirement**: The literal "deep dive" framing is banned by an existing tone rule. The user's intent is "reads like" a deep dive — i.e. the surfaces and grounding density, not the label. Dropping the literal label is correct.
2. **Delete**: Skip a curated peer-set table (SIC lookup is enough for v1). Skip a new dashboard surface (summaryJSON is enough). Skip rolling-trend prior-filing comparison (single-period is the user's pick). Skip rewriting the legacy `form-10k.ts` / `form-10q.ts` classes — they're not the live path.
3. **Simplify**: Reuse the existing `EnrichmentProvider` factory pattern; new providers slot into `DEFAULT_PROVIDERS` instead of standing up a parallel framework. Reuse `summaryJSON` instead of new columns. Reuse the in-place `getHistoricalSummaries` rail; just add a thematic-anchor block adjacent to the existing Historical Context block.
4. **Accelerate**: TDD red-green-refactor per phase. Each new schema field gets a failing schema-coverage test first; each new provider gets a failing detection test first.
5. **Automate**: Quality-gate sparse-section detection is extended automatically to the new fields once added to the field list; per-provider telemetry uses the existing `monitoring` counters.

Asymmetric design across 10-K and 10-Q (per user's `Asymmetric — different shapes` answer):
- 10-K gets `marketContext + thematicTakeaways + peerContext + materialitySignal` — annual = strategic frame.
- 10-Q gets `marketContext + thematicTakeaways + trendsDelta + materialitySignal` — quarterly = what shifted.

Both get the same materiality signal mechanism but the model's rationale draws on different evidence.

---

## Phase 1: Schema Foundation & Type Definitions

### Overview
Extend `FORM_SCHEMAS['10-K']` and `FORM_SCHEMAS['10-Q']` with the new structured fields. Add TypeScript types so downstream extractors and templates have a contract. Update `FORM_EXTRACTION_GUIDANCE` with grounding rules so the model knows how to populate the new fields without violating the no-extrapolation rule.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/ai/prompts/mini-deep-dive-schema.test.ts`

```typescript
import { FORM_SCHEMAS, generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';

describe('Mini-deep-dive schema additions', () => {
  describe('10-K schema', () => {
    it('should declare marketContext as a string field with maxLength', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.marketContext).toBeDefined();
      expect(schema.properties.marketContext.type).toBe('string');
      expect(schema.properties.marketContext.maxLength).toBeGreaterThanOrEqual(400);
    });

    it('should declare thematicTakeaways as an array of strings with maxItems', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.thematicTakeaways.type).toBe('array');
      expect(schema.properties.thematicTakeaways.maxItems).toBe(4);
      expect(schema.properties.thematicTakeaways.items.type).toBe('string');
    });

    it('should declare peerContext with label and detail subfields', () => {
      const schema = FORM_SCHEMAS['10-K'];
      const pc = schema.properties.peerContext;
      expect(pc.type).toBe('object');
      expect(pc.properties.label.type).toBe('string');
      expect(pc.properties.detail.type).toBe('string');
    });

    it('should declare materialitySignal with score enum and rationale', () => {
      const schema = FORM_SCHEMAS['10-K'];
      const ms = schema.properties.materialitySignal;
      expect(ms.properties.score.enum).toEqual(['high', 'medium', 'low', 'noise']);
      expect(ms.properties.rationale.type).toBe('string');
    });

    it('should NOT include trendsDelta (that is 10-Q only)', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.trendsDelta).toBeUndefined();
    });
  });

  describe('10-Q schema', () => {
    it('should declare marketContext, thematicTakeaways, materialitySignal', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      expect(schema.properties.marketContext).toBeDefined();
      expect(schema.properties.thematicTakeaways).toBeDefined();
      expect(schema.properties.materialitySignal).toBeDefined();
    });

    it('should declare trendsDelta as an array of {area, prior, current} items', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      const td = schema.properties.trendsDelta;
      expect(td.type).toBe('array');
      expect(td.maxItems).toBe(3);
      expect(td.items.properties.area.type).toBe('string');
      expect(td.items.properties.prior.type).toBe('string');
      expect(td.items.properties.current.type).toBe('string');
    });

    it('should NOT include peerContext (that is 10-K only)', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      expect(schema.properties.peerContext).toBeUndefined();
    });
  });

  describe('generated user prompt', () => {
    it('10-K user prompt includes grounding rule for marketContext', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        company: 'Test Co',
        filingContent: 'irrelevant',
      });
      expect(userPrompt).toMatch(/marketContext.*MD&A|Trends and Uncertainties.*marketContext/i);
    });

    it('10-Q user prompt includes prior-filing anchor for trendsDelta', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        company: 'Test Co',
        filingContent: 'irrelevant',
      });
      expect(userPrompt).toMatch(/trendsDelta.*Historical Context|prior 10-Q.*trendsDelta/i);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm test -- --testPathPattern="mini-deep-dive-schema"
# Expected: 9 failing tests (fields don't exist yet)
```

### Step 1.2: 🟢 Implement Schema Additions

#### 1.2.1 Add shared property templates
**File**: `lib/ai/prompts/unified-prompts.ts`

Above the `FORM_SCHEMAS` declaration (~line 200), add module-level constants reusable across 10-K and 10-Q:

```typescript
const MATERIALITY_SIGNAL_PROPERTY = {
  type: 'object',
  description: 'Filing materiality classification. Score must be derived from the filing itself (revenue/earnings surprise magnitude, NEW risk factors vs prior filing, guidance changes, control deficiencies, material agreements). NEVER guess — if there is no signal, score is "noise" with a stated rationale.',
  properties: {
    score: { type: 'string', enum: ['high', 'medium', 'low', 'noise'] },
    rationale: { type: 'string', description: 'One sentence (40-180 chars) citing the specific filing evidence that drove the score.', maxLength: 200 },
  },
  required: ['score', 'rationale'],
} as const;

const MARKET_CONTEXT_PROPERTY = {
  type: 'string',
  description: '2-3 sentences placing the period in industry/macro framing. MUST be grounded in (a) the filing’s own MD&A "Trends and Uncertainties" or Risk Factors language, (b) any web-search MARKET CONTEXT block injected above, or (c) the X SENTIMENT block injected above. Do NOT invent macro framing from general knowledge. Use "market context", "industry backdrop", "macro lens" — do NOT use "deep dive" or "dive into".',
  maxLength: 500,
} as const;

const THEMATIC_TAKEAWAYS_PROPERTY = {
  type: 'array',
  description: '3-4 bullets stepping back from line-item finance. Each bullet describes one bigger-picture theme the filing reinforces or changes (strategic shift, capital allocation pattern, market positioning, regulatory posture, etc.). Each bullet must be grounded in specific filing text — not generic.',
  maxItems: 4,
  items: { type: 'string', description: 'One thematic bullet (60-250 chars)', maxLength: 280 },
} as const;
```

**Checkpoint 1.2.1**: Constants compile; tests still fail (schemas not yet updated):
```bash
npm run build 2>&1 | grep -E "error" || echo "build OK"
npm test -- --testPathPattern="mini-deep-dive-schema"
# Expected: 9 failing tests, no build errors
```

#### 1.2.2 Extend `FORM_SCHEMAS['10-K']`
**File**: `lib/ai/prompts/unified-prompts.ts` (line 206-241)

Add to the `properties` object:

```typescript
marketContext: MARKET_CONTEXT_PROPERTY,
thematicTakeaways: THEMATIC_TAKEAWAYS_PROPERTY,
peerContext: {
  type: 'object',
  description: '1-2 sentences positioning revenue growth, margin, or capital allocation against same-sector peers. Populate ONLY when a PEER CONTEXT (web search) block is injected above OR when the filing explicitly names competitor benchmarks. Otherwise omit.',
  properties: {
    label: { type: 'string', description: 'One-line peer framing (e.g., "Software, peers AVG +8% rev growth")', maxLength: 200 },
    detail: { type: 'string', description: '1-2 sentence elaboration with specific peer reference', maxLength: 350 },
  },
  required: ['label', 'detail'],
},
materialitySignal: MATERIALITY_SIGNAL_PROPERTY,
```

Add `materialitySignal` to the `required` array.

**Checkpoint 1.2.2**:
```bash
npm test -- --testPathPattern="mini-deep-dive-schema" --testNamePattern="10-K schema"
# Expected: 5 passing, 4 failing (10-Q tests + prompt tests still failing)
```

#### 1.2.3 Extend `FORM_SCHEMAS['10-Q']`
**File**: `lib/ai/prompts/unified-prompts.ts` (line 243-301)

Add to the `properties` object:

```typescript
marketContext: MARKET_CONTEXT_PROPERTY,
thematicTakeaways: THEMATIC_TAKEAWAYS_PROPERTY,
trendsDelta: {
  type: 'array',
  description: 'Up to 3 explicit before/after comparisons against the prior 10-Q. Each item names one area (e.g., "tone on AI capex", "supply-chain risk language", "guidance band width") and gives the prior + current state. Populate ONLY when the Historical Context block contains a prior 10-Q summary — otherwise return empty array.',
  maxItems: 3,
  items: {
    type: 'object',
    properties: {
      area: { type: 'string', description: 'Short label of what shifted', maxLength: 80 },
      prior: { type: 'string', description: 'What the prior 10-Q said (1 sentence, paraphrased from Historical Context)', maxLength: 200 },
      current: { type: 'string', description: 'What this 10-Q now says (1 sentence)', maxLength: 200 },
    },
    required: ['area', 'prior', 'current'],
  },
},
materialitySignal: MATERIALITY_SIGNAL_PROPERTY,
```

Add `materialitySignal` to the `required` array.

**Checkpoint 1.2.3**:
```bash
npm test -- --testPathPattern="mini-deep-dive-schema"
# Expected: 7 passing, 2 failing (prompt-text grounding-rule tests still failing)
```

#### 1.2.4 Extend `FORM_EXTRACTION_GUIDANCE['10-K']`
**File**: `lib/ai/prompts/unified-prompts.ts` (line 1254)

Append to the 10-K guidance string:

```
- MARKET CONTEXT field: Write 2-3 sentences using the filing's Item 1 (Business) overview, Item 1A (Risk Factors) language on industry/macro risks, and Item 7 (MD&A) "Trends and Uncertainties" section. If a "--- MARKET CONTEXT (web search) ---" block is provided above, USE IT to ground specific macro/industry framing. If an "--- X SENTIMENT (public discussion) ---" block is provided, you MAY paraphrase its direction signal (e.g., "public discussion is broadly cautious on AI capex demand"). NEVER bring in macro framing the filing or enrichment block doesn't support.
- THEMATIC TAKEAWAYS: 3-4 bullets describing the company-level story this 10-K tells (strategic shift, capital allocation pattern, market positioning change, regulatory posture). Cite the specific filing section that grounds each bullet.
- PEER CONTEXT: Populate ONLY if a "--- PEER CONTEXT (web search) ---" block is provided above OR the filing's Item 1 explicitly cites named competitors with comparable metrics. Otherwise OMIT the field entirely.
- MATERIALITY SIGNAL: Classify on 4-tier scale. "high" = >10% revenue/earnings surprise vs prior year, new material risk factor, going-concern language, control deficiency, leadership departure, or major segment write-down. "medium" = noteworthy guidance change, segment realignment, accounting change, or 5-10% YoY metric shift. "low" = routine annual filing with no material divergence from prior year. "noise" = filing offers no investor-actionable signal. Rationale MUST cite the specific evidence (item number, section, or quoted phrase).
```

#### 1.2.5 Extend `FORM_EXTRACTION_GUIDANCE['10-Q']`
**File**: `lib/ai/prompts/unified-prompts.ts` (line 1279)

Append to the 10-Q guidance string:

```
- MARKET CONTEXT field: Write 2-3 sentences using the filing's Item 2 (MD&A) "Trends and Uncertainties" + any Part II Item 1A (Risk Factors) UPDATES from the prior 10-K. Same grounding rules as 10-K: use the MARKET CONTEXT or X SENTIMENT enrichment blocks if provided; never fabricate macro framing.
- THEMATIC TAKEAWAYS: 3-4 bullets focused on what THIS QUARTER reinforces or changes about the company's trajectory. Lean on MD&A narrative + Item 1A updates. Cite filing sections.
- TRENDS DELTA: Populate ONLY when the Historical Context block above contains a prior 10-Q summary. Compare specifically: (1) tone shifts on key topics, (2) risk-factor language additions or removals, (3) guidance band shifts, (4) segment-narrative changes. Each item must name a concrete `area` with prior/current paraphrases drawn from the prior summary + this filing. NEVER fabricate prior-quarter content the Historical Context block does not provide. If no prior 10-Q is available, return an empty array.
- MATERIALITY SIGNAL: Same 4-tier scale as 10-K. "high" = guidance cut, missed quarter by >5%, new risk factor not in last 10-K, control deficiency, segment shutdown, or material legal proceeding. "medium" = guidance raised or narrowed, 3-5% YoY miss/beat, working-capital flag (DSO/DPO swing >15%), segment narrative shift. "low" = in-line quarter, routine update. "noise" = no investor-actionable signal. Rationale MUST cite filing evidence.
```

**Checkpoint 1.2.5**:
```bash
npm test -- --testPathPattern="mini-deep-dive-schema"
# Expected: 9 passing, 0 failing
npm run build
# Expected: success
```

### Step 1.3: 🔵 Refactor

- [ ] Move `MATERIALITY_SIGNAL_PROPERTY`, `MARKET_CONTEXT_PROPERTY`, `THEMATIC_TAKEAWAYS_PROPERTY` next to `BASE_SCHEMA_PROPERTIES`, `FINANCIAL_HIGHLIGHT_ITEM`, etc. so they're co-located with other reusables.
- [ ] Ensure description strings use the same "MUST be grounded in" voice as existing `whyItMatters` (`unified-prompts.ts:137`).
- [ ] Update `lib/ai/prompts/__tests__/journalist-tone.test.ts` if its grep on prompt text now collides with new field descriptions.

**Checkpoint 1.3**:
```bash
npm test -- --testPathPattern="(mini-deep-dive-schema|journalist-tone|schema-coverage|schema-alignment|unified-prompts-formatting)"
# Expected: all passing, 0 failing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm test -- --testPathPattern="mini-deep-dive-schema"` passes
- [ ] `npm test -- --testPathPattern="ai/prompts"` passes (no regressions to existing prompt tests)
- [ ] `npm run build` succeeds
- [ ] `npm run lint` succeeds

#### Manual Verification:
- [ ] Read `generateFilingPrompt({ formType: '10-K', ... }).userPrompt` output for a sample filing — confirm new field descriptions appear coherently
- [ ] Read same for 10-Q

**STOP**: Confirm manual review before Phase 2.

---

## Phase 2: Materiality Scoring & Banned-Phrase Compliance

### Overview
Materiality is the most-loaded new field — it drives a visible badge and downstream sorting. This phase isolates materiality scoring so we can iterate on the 4-tier classification rules independently of the larger thematic copy. Also locks down banned-phrase compliance for the new fields specifically.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/ai/prompts/materiality-classification.test.ts`

```typescript
import { generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';

describe('Materiality classification grounding', () => {
  it('10-K prompt instructs that "high" requires specific evidence', () => {
    const { userPrompt } = generateFilingPrompt({ formType: '10-K', company: 'X', filingContent: '' });
    expect(userPrompt).toMatch(/materialitySignal[\s\S]*high[\s\S]*revenue.*surprise|going-concern|control deficiency/i);
  });

  it('10-Q prompt instructs that "high" includes guidance cut', () => {
    const { userPrompt } = generateFilingPrompt({ formType: '10-Q', company: 'X', filingContent: '' });
    expect(userPrompt).toMatch(/materialitySignal[\s\S]*guidance cut|missed quarter/i);
  });

  it('all materiality rationales must cite filing evidence (not generic)', () => {
    const { userPrompt } = generateFilingPrompt({ formType: '10-K', company: 'X', filingContent: '' });
    expect(userPrompt).toMatch(/rationale.*MUST cite.*(item number|section|quoted phrase|filing evidence)/i);
  });

  it('banned-phrase list still forbids "deep dive" globally', () => {
    const { userPrompt } = generateFilingPrompt({ formType: '10-K', company: 'X', filingContent: '' });
    expect(userPrompt).toMatch(/banned phrase|do not use|forbidden/i);
    expect(userPrompt).toMatch(/"deep dive"|deep dive/);
  });

  it('marketContext description explicitly bans "deep dive" wording', () => {
    const { userPrompt } = generateFilingPrompt({ formType: '10-K', company: 'X', filingContent: '' });
    expect(userPrompt).toMatch(/marketContext[\s\S]*do NOT use "deep dive"/i);
  });
});
```

**Test File**: `__tests__/email/extractors/materiality-extraction.test.ts`

```typescript
import { extract10KData } from '@/lib/email/10k-data-extractor';
import { extract10QData } from '@/lib/email/10q-data-extractor';

describe('Materiality field extraction', () => {
  it('extract10KData returns materialitySignal from summaryJSON', () => {
    const summaryJSON = {
      materialitySignal: { score: 'high', rationale: 'Revenue down 12% YoY, new going-concern language in Item 1A' },
      // ... other required fields
    };
    const result = extract10KData('', summaryJSON);
    expect(result.materialitySignal?.score).toBe('high');
    expect(result.materialitySignal?.rationale).toContain('Revenue down 12%');
  });

  it('extract10QData defaults to "noise" when materialitySignal absent', () => {
    const result = extract10QData('', {});
    expect(result.materialitySignal?.score).toBe('noise');
  });
});
```

**Checkpoint 2.1**:
```bash
npm test -- --testPathPattern="materiality"
# Expected: 7 failing
```

### Step 2.2: 🟢 Implement

#### 2.2.1 Verify and reinforce banned-phrase list
**File**: `lib/ai/prompts/unified-prompts.ts:1195`

Banned phrase list already includes `"dive into", "deep dive"`. Verify it's referenced in the system prompt the model receives. Add an explicit cross-reference inside the new `marketContext` / `thematicTakeaways` / `materialitySignal` descriptions:

```typescript
// In MARKET_CONTEXT_PROPERTY description, already added in Phase 1:
// '... Use "market context", "industry backdrop", "macro lens" — do NOT use "deep dive" or "dive into".'
```

Already in place from Phase 1.2.1.

#### 2.2.2 Add materiality types to TypeScript layer
**File**: `lib/email/types.ts` (or wherever the existing 10-K/10-Q extracted-data types live — confirm during implementation by reading `lib/email/types.ts`)

```typescript
export type MaterialityScore = 'high' | 'medium' | 'low' | 'noise';

export interface MaterialitySignal {
  score: MaterialityScore;
  rationale: string;
}
```

#### 2.2.3 Wire materiality into extractors
**File**: `lib/email/10k-data-extractor.ts`

Add `materialitySignal` to the extractor output interface. Read from `summaryJSON.materialitySignal` if present; default to `{ score: 'noise', rationale: 'Filing did not produce a materiality signal.' }` if absent.

**File**: `lib/email/10q-data-extractor.ts`

Mirror the same for 10-Q.

**Checkpoint 2.2.3**:
```bash
npm test -- --testPathPattern="materiality"
# Expected: 7 passing, 0 failing
```

### Step 2.3: 🔵 Refactor

- [ ] Move `MaterialityScore` and `MaterialitySignal` to a single shared types file if duplicated across extractors.
- [ ] Verify the default-noise fallback is consistent across both extractors.

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm test -- --testPathPattern="materiality"` passes
- [ ] `npm test -- --testPathPattern="email/extractors"` passes (no regressions)
- [ ] `npm run build` succeeds

#### Manual Verification:
- [ ] Eyeball 5 recent production 10-K and 10-Q summaries — none should already have a `materialitySignal` field (since it's net-new), so extractors should default to `noise`.

**STOP**: Confirm before Phase 3.

---

## Phase 3: Prior-Filing Thematic Anchor (10-Q Focus)

### Overview
The 10-Q's `trendsDelta` field requires the model to see the prior 10-Q's thematic copy explicitly, not just its financial numbers. `getHistoricalSummaries` + `buildContextEnrichedPrompt` already inject historical summaries (used today for QoQ math). This phase audits whether the existing block contains enough thematic content for the model to diff, and adds a dedicated "PRIOR-FILING THEMATIC ANCHOR" block if not.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/ai/historical-thematic-anchor.test.ts`

```typescript
import { buildContextEnrichedPrompt } from '@/lib/ai/historical-context'; // confirm exact path during impl

describe('Prior-filing thematic anchor block', () => {
  it('injects a labeled "PRIOR-FILING THEMATIC ANCHOR" section when prior 10-Q summary exists', () => {
    const historicalSummaries = [
      {
        formType: '10-Q',
        filingDate: '2026-02-01',
        summary: 'Revenue grew 5%. Tone cautious on AI capex demand.',
        thematicTakeaways: ['AI infrastructure spend pacing slower than guided'],
        riskFactors: [{ risk: 'Supply chain', impact: 'High' }],
      },
    ];
    const prompt = buildContextEnrichedPrompt('current filing content', historicalSummaries);
    expect(prompt).toMatch(/PRIOR-FILING THEMATIC ANCHOR/);
    expect(prompt).toContain('AI infrastructure spend pacing slower');
  });

  it('omits anchor block when no prior 10-Q summary is available', () => {
    const prompt = buildContextEnrichedPrompt('current filing content', []);
    expect(prompt).not.toMatch(/PRIOR-FILING THEMATIC ANCHOR/);
  });

  it('falls back to plain summary when prior summary has no thematicTakeaways (legacy data)', () => {
    const historicalSummaries = [
      {
        formType: '10-Q',
        filingDate: '2026-02-01',
        summary: 'Revenue grew 5%. Tone cautious on AI capex demand.',
        // no thematicTakeaways (pre-phase-1 data)
      },
    ];
    const prompt = buildContextEnrichedPrompt('current filing content', historicalSummaries);
    expect(prompt).toMatch(/PRIOR-FILING THEMATIC ANCHOR/);
    expect(prompt).toContain('Tone cautious on AI capex demand');
  });
});
```

**Checkpoint 3.1**:
```bash
npm test -- --testPathPattern="historical-thematic-anchor"
# Expected: 3 failing
```

### Step 3.2: 🟢 Implement

#### 3.2.1 Locate `buildContextEnrichedPrompt`
First action of phase 3 implementation: `grep -rn "buildContextEnrichedPrompt" /home/user/tldrsec-ai/lib/ | head -5` to confirm the file path. Likely `lib/ai/historical-context.ts` or `lib/ai/summarize.ts` itself.

#### 3.2.2 Extend the function
Add a new labeled section after the existing "Historical Context" block:

```
--- PRIOR-FILING THEMATIC ANCHOR ---
The most-recent prior 10-Q for this company said:
- Summary: <prior summary>
- Thematic takeaways: <prior thematicTakeaways, if present>
- Top risks: <prior riskFactors[0..2], if present>

Use this anchor ONLY for populating the trendsDelta field with prior/current paraphrases. Do NOT copy numbers from this block — current-period numbers come from the filing itself.
```

The block is gated on `historicalSummaries.find(h => h.formType === '10-Q')` for 10-Q current filings, and on `formType === '10-K'` for 10-K current filings (annual anchor).

#### 3.2.3 Filter historical summaries by form type
Currently `getHistoricalSummaries` may return mixed form types. Ensure the thematic anchor selects the most-recent matching form type (10-Q anchors a 10-Q; 10-K anchors a 10-K). Other form types in the historical context block continue as-is (8-Ks, Form 4s remain useful for richer context).

**Checkpoint 3.2.3**:
```bash
npm test -- --testPathPattern="historical-thematic-anchor"
# Expected: 3 passing
```

### Step 3.3: 🔵 Refactor

- [ ] Extract thematic-anchor block builder into its own function `buildThematicAnchor(matchingPriorSummary)` for testability.
- [ ] Add a feature flag check so this block can be disabled if it causes prompt-budget regressions.

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm test -- --testPathPattern="historical-thematic-anchor"` passes
- [ ] `npm test -- --testPathPattern="summarize"` passes (no regressions)

#### Manual Verification:
- [ ] Run `lib/ai/summarize.ts` against a known recent 10-Q with a known prior 10-Q in DB; inspect the constructed prompt and verify the thematic anchor block is present and well-formed.

**STOP**: Confirm before Phase 4.

---

## Phase 4: Earnings-Specific Web-Search Providers

### Overview
Add two new providers to `lib/ai/web-search-context.ts`:
- `marketContextProvider` (10-K + 10-Q): pulls grounded macro/industry framing
- `peerContextProvider` (10-K only): SIC-based peer lookup → web-search for peer benchmarks

Then add `10-K`, `10-K/A`, `10-Q`, `10-Q/A` to `ENRICHMENT_FORM_TYPES` at `summarize.ts:779`.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/ai/web-search/market-context-provider.test.ts`

```typescript
import { marketContextProvider } from '@/lib/ai/web-search-context';

describe('marketContextProvider', () => {
  describe('detect', () => {
    it('returns true for 10-K', () => {
      expect(marketContextProvider.detect('any content', '10-K')).toBe(true);
    });
    it('returns true for 10-Q', () => {
      expect(marketContextProvider.detect('any content', '10-Q')).toBe(true);
    });
    it('returns true for amended 10-K/A', () => {
      expect(marketContextProvider.detect('any content', '10-K/A')).toBe(true);
    });
    it('returns false for 8-K', () => {
      expect(marketContextProvider.detect('any content', '8-K')).toBe(false);
    });
    it('returns false for Form 4', () => {
      expect(marketContextProvider.detect('any content', '4')).toBe(false);
    });
  });

  describe('buildPrompt', () => {
    it('builds a prompt asking for grounded macro/industry framing', () => {
      const { system, user } = marketContextProvider.buildPrompt('excerpt', 'NVIDIA Corp', 'NVDA');
      expect(user).toContain('NVDA');
      expect(user).toContain('NVIDIA');
      expect(user).toMatch(/macro|industry|sector/i);
      expect(user).toContain('JSON');
    });
  });

  describe('parseResponse', () => {
    it('parses valid {label, context} JSON', () => {
      const result = marketContextProvider.parseResponse(
        '{"label": "AI capex cycle", "context": "Enterprise AI spend in H1 2026 paced 8% above peer-set average; cloud capex commentary on recent earnings calls suggests acceleration through Q4."}'
      );
      expect(result?.label).toBe('AI capex cycle');
    });

    it('returns null on missing label', () => {
      const result = marketContextProvider.parseResponse('{"context": "..."}');
      expect(result).toBeNull();
    });
  });
});
```

**Test File**: `__tests__/ai/web-search/peer-context-provider.test.ts`

```typescript
import { peerContextProvider, _getPeerSetForTicker } from '@/lib/ai/web-search-context';

describe('peerContextProvider', () => {
  describe('detect', () => {
    it('returns true for 10-K only', () => {
      expect(peerContextProvider.detect('any', '10-K')).toBe(true);
      expect(peerContextProvider.detect('any', '10-Q')).toBe(false);
      expect(peerContextProvider.detect('any', '8-K')).toBe(false);
    });
  });

  describe('SIC-based peer lookup', () => {
    it('returns peers from same SIC sector', async () => {
      const peers = await _getPeerSetForTicker('AAPL'); // SIC 3571 Electronic Computers
      expect(peers.length).toBeGreaterThan(0);
      expect(peers).not.toContain('AAPL'); // exclude self
    });

    it('returns empty list when ticker is unknown', async () => {
      const peers = await _getPeerSetForTicker('UNKNOWN_TICKER_XYZ');
      expect(peers).toEqual([]);
    });
  });

  describe('buildPrompt', () => {
    it('includes peer set in the prompt when SIC peers are available', async () => {
      // Test that when peerSet is populated, the prompt explicitly names them
      // and instructs comparison.
      // (Detail: prompt builder signature accepts optional peerSet param;
      //  if empty, falls back to LLM peer selection language.)
    });
  });
});
```

**Test File**: `__tests__/ai/summarize-enrichment-form-types.test.ts`

```typescript
describe('ENRICHMENT_FORM_TYPES inclusion', () => {
  it('includes 10-K and 10-Q', () => {
    const { ENRICHMENT_FORM_TYPES } = require('@/lib/ai/summarize'); // confirm export
    expect(ENRICHMENT_FORM_TYPES.has('10-K')).toBe(true);
    expect(ENRICHMENT_FORM_TYPES.has('10-K/A')).toBe(true);
    expect(ENRICHMENT_FORM_TYPES.has('10-Q')).toBe(true);
    expect(ENRICHMENT_FORM_TYPES.has('10-Q/A')).toBe(true);
  });
});
```

**Checkpoint 4.1**:
```bash
npm test -- --testPathPattern="(market-context-provider|peer-context-provider|summarize-enrichment-form-types)"
# Expected: ~13 failing
```

### Step 4.2: 🟢 Implement

#### 4.2.1 Add `marketContextProvider`
**File**: `lib/ai/web-search-context.ts`

After the `capitalReturnProvider` definition (~line 286), add:

```typescript
const EARNINGS_FORM_TYPES_PATTERN = /(?:10-K|10-Q)(?:\/A)?/i;

export const marketContextProvider: EnrichmentProvider = {
  name: 'market_context',
  sectionHeader: 'MARKET CONTEXT (web search)',
  maxExcerptLength: 3000,

  detect(content: string, formType: string): boolean {
    if (!formType) return false;
    return EARNINGS_FORM_TYPES_PATTERN.test(formType.toUpperCase());
  },

  buildPrompt(excerpt: string, companyName: string, ticker: string) {
    return {
      system: 'You are an equity research analyst placing a single earnings filing in current industry and macro context. Respond with valid JSON only. Do NOT invent figures the filing or current public web sources do not state.',
      user: `This is an earnings filing excerpt from ${companyName} (${ticker}).

Using web search, in 2-3 sentences provide MACRO and INDUSTRY context that frames this filing for an equity-research reader. Cover (a) the current state of the company's sector or end-market (cite a named trend, not vague "macro headwinds"), (b) one named comparable peer or competitor signal in the last 90 days that informs reading this filing, and (c) the most relevant macro variable for this business (FX, rates, regulatory action, supply chain, etc.) with current direction.

Label should be a 4-7 word tag like "AI capex acceleration" or "Auto demand softening".

Respond with ONLY valid JSON in this exact format:
{"label": "4-7 word tag", "context": "2-3 sentence market-grounded analysis"}

<filing_excerpt>
${excerpt}
</filing_excerpt>`,
    };
  },

  parseResponse(raw: string): EnrichmentResult | null {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.label || !parsed.context) return null;
    return {
      label: String(parsed.label).slice(0, MAX_LABEL_LENGTH),
      context: String(parsed.context).slice(0, MAX_CONTEXT_LENGTH),
    };
  },
};
```

**Checkpoint 4.2.1**: `marketContextProvider` tests pass (~6 of 13).

#### 4.2.2 Add `peerContextProvider`
**File**: `lib/ai/web-search-context.ts`

```typescript
import { sicToSector } from '../sec-edgar/sic-sector-map';
import { getPrismaClient } from '../prisma'; // confirm exact import during impl

export async function _getPeerSetForTicker(ticker: string): Promise<string[]> {
  const prisma = getPrismaClient();
  const target = await prisma.ticker.findFirst({
    where: { symbol: ticker.toUpperCase() },
    select: { sicCode: true },
  });
  if (!target?.sicCode) return [];
  const peers = await prisma.ticker.findMany({
    where: { sicCode: target.sicCode, symbol: { not: ticker.toUpperCase() } },
    select: { symbol: true },
    take: 8,
  });
  return peers.map(p => p.symbol);
}

export const peerContextProvider: EnrichmentProvider = {
  name: 'peer_context',
  sectionHeader: 'PEER CONTEXT (web search)',
  maxExcerptLength: 2000,

  detect(content: string, formType: string): boolean {
    if (!formType) return false;
    return /^10-K(?:\/A)?$/i.test(formType);
  },

  buildPrompt(excerpt: string, companyName: string, ticker: string) {
    // Note: peer set fetched async OUTSIDE this sync function, then injected as
    // hint in the user prompt. For now, instruct the model to search for peers
    // when not provided. Phase 4.2.3 wires the SIC fetch.
    return {
      system: 'You are an equity research analyst comparing a company’s annual results to its named peer set. Respond with valid JSON only. Cite specific peer metrics from public web sources, never invent numbers.',
      user: `This 10-K filing excerpt is from ${companyName} (${ticker}).

Using web search, in 1-2 sentences compare ${ticker}’s most distinctive annual metric (revenue growth rate, gross/operating margin, or capital-return pace) to its same-sector peer set’s most-recent comparable metric. Name at least one specific peer ticker with its metric value.

Label should be a one-line peer framing (e.g., "Software, peers AVG +8% revenue growth" or "Semis, NVDA leading margin expansion").

Respond with ONLY valid JSON:
{"label": "One-line peer framing", "context": "1-2 sentence peer comparison citing at least one specific peer ticker"}

<filing_excerpt>
${excerpt}
</filing_excerpt>`,
    };
  },

  parseResponse(raw: string): EnrichmentResult | null {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.label || !parsed.context) return null;
    return {
      label: String(parsed.label).slice(0, MAX_LABEL_LENGTH),
      context: String(parsed.context).slice(0, MAX_CONTEXT_LENGTH),
    };
  },
};
```

#### 4.2.3 Inject SIC-based peer hint into `peerContextProvider` user prompt
After confirming `_getPeerSetForTicker` works against the live `Ticker` table, modify the orchestrator (or wrap the provider's `buildPrompt`) to pre-fetch the peer set and inject it into the user prompt as `Known same-SIC peers: AAPL, GOOG, MSFT...`. If the SIC peer set is empty (sparse SIC code, niche industry), the prompt falls through to the existing "search for peers" instruction — this is the user's chosen "web-search as fallback" behavior.

This requires either:
- Option A: pass `companyMetadata` (ticker + SIC) into `runEnrichment`, then enrich `provider.buildPrompt` signature with an optional `metadata` param.
- Option B: have `peerContextProvider` do the prisma lookup inside `buildPrompt` (sync wrapper not possible — would require making buildPrompt async).

Recommend **Option A** — explicit dependency injection, no DB call inside the provider interface. This is a small refactor to the `EnrichmentProvider` interface.

#### 4.2.4 Register new providers in `DEFAULT_PROVIDERS`
**File**: `lib/ai/web-search-context.ts` line ~590

```typescript
export const DEFAULT_PROVIDERS: EnrichmentProvider[] = [
  counterpartyProvider,
  governanceProvider,
  debtIssuanceProvider,
  earningsProvider,
  capitalReturnProvider,
  marketContextProvider,  // NEW
  peerContextProvider,    // NEW
];
```

#### 4.2.5 Add 10-K/10-Q to `ENRICHMENT_FORM_TYPES`
**File**: `lib/ai/summarize.ts` line 779

```typescript
const ENRICHMENT_FORM_TYPES = new Set([
  '8-K', '8-K/A',
  '424B2', '424B3', 'FWP',
  '10-K', '10-K/A',  // NEW
  '10-Q', '10-Q/A',  // NEW
]);
```

Export the constant so tests can introspect it.

**Checkpoint 4.2.5**: All provider tests pass.
```bash
npm test -- --testPathPattern="(market-context-provider|peer-context-provider|summarize-enrichment-form-types)"
# Expected: 13 passing
```

### Step 4.3: 🔵 Refactor

- [ ] Generalize `EARNINGS_FORM_TYPES_PATTERN` into a module-level constant shared by both new providers.
- [ ] Confirm `runEnrichment` honors the new providers under the existing 2000-char drop-not-truncate cap. If both providers fire on the same 10-K + counterparty fires (unlikely but possible for amended filings during M&A activity), document execution order so capping is predictable.
- [ ] Add per-provider cost telemetry tags for `market_context` and `peer_context` so dashboards distinguish them from the 8-K providers.

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm test -- --testPathPattern="web-search"` passes
- [ ] `npm test -- --testPathPattern="summarize"` passes
- [ ] `npm run build` succeeds

#### Manual Verification:
- [ ] Run end-to-end summarization against a known recent 10-K (e.g., NVDA FY2026) with `ENRICHMENT_FORCE_DISABLE=` unset; tail logs and confirm both `market_context` and `peer_context` providers fire, return parseable JSON, and inject into the prompt.
- [ ] Cost check: confirm `ai.enrichment_cost_usd` counter shows ~2 × $0.003 per 10-K filing (vs ~0 before).
- [ ] Run a 10-Q end-to-end; confirm `market_context` fires but `peer_context` does NOT (10-K-only gate).

**STOP**: Confirm before Phase 5.

---

## Phase 5: Email Template Rendering

### Overview
Render the new fields in the existing minimalist email templates. New sections: materiality badge (top), market context (above the scorecard), thematic takeaways (after scorecard), peer context (10-K only, below thematic takeaways), trends delta (10-Q only, below thematic takeaways).

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/email/10k-minimalist-mini-deep-dive.test.tsx`

```typescript
import { render } from '@react-email/render';
import { Form10KMinimalistTemplate } from '@/components/ui/email/templates/10k-minimalist-template';

describe('10-K minimalist template: mini deep dive sections', () => {
  const baseProps = {
    company: 'NVIDIA Corporation',
    ticker: 'NVDA',
    summary: '...',
    fiscalYear: 'FY2026',
    financialHighlights: [],
    // ... other required props
  };

  it('renders materiality badge with score when high', () => {
    const html = render(<Form10KMinimalistTemplate {...baseProps} materialitySignal={{ score: 'high', rationale: 'Revenue beat by 12%' }} />);
    expect(html).toMatch(/HIGH/i);
    expect(html).toContain('Revenue beat by 12%');
  });

  it('does NOT render badge when materialitySignal is noise', () => {
    const html = render(<Form10KMinimalistTemplate {...baseProps} materialitySignal={{ score: 'noise', rationale: 'No actionable signal' }} />);
    expect(html).not.toMatch(/HIGH|MEDIUM|LOW/i);
  });

  it('renders marketContext block when provided', () => {
    const html = render(<Form10KMinimalistTemplate {...baseProps} marketContext="AI capex demand pacing 12% above peer avg per H1 2026 earnings calls." />);
    expect(html).toMatch(/Market Context|Industry Backdrop|Macro Lens/i);
    expect(html).toContain('AI capex demand pacing 12%');
  });

  it('renders thematicTakeaways as bullets', () => {
    const html = render(<Form10KMinimalistTemplate {...baseProps} thematicTakeaways={['Bullet A', 'Bullet B', 'Bullet C']} />);
    expect(html).toContain('Bullet A');
    expect(html).toContain('Bullet B');
  });

  it('renders peerContext when provided', () => {
    const html = render(<Form10KMinimalistTemplate {...baseProps} peerContext={{ label: 'Semis peers', detail: 'NVDA leading peer set by 8pp gross margin' }} />);
    expect(html).toMatch(/Peer Context|Peer Comparison/i);
    expect(html).toContain('NVDA leading');
  });

  it('does NOT render peer-context section when null', () => {
    const html = render(<Form10KMinimalistTemplate {...baseProps} peerContext={null} />);
    expect(html).not.toMatch(/Peer Context|Peer Comparison/);
  });
});
```

Mirror for 10-Q: `__tests__/email/10q-minimalist-mini-deep-dive.test.tsx` with `trendsDelta` instead of `peerContext`.

**Checkpoint 5.1**:
```bash
npm test -- --testPathPattern="mini-deep-dive.test.tsx"
# Expected: ~12 failing
```

### Step 5.2: 🟢 Implement

#### 5.2.1 Update extractors to surface new fields
**File**: `lib/email/10k-data-extractor.ts`

Read `marketContext`, `thematicTakeaways`, `peerContext`, `materialitySignal` from `summaryJSON`. Return them in the extracted-data object. Default sensibly when missing.

**File**: `lib/email/10q-data-extractor.ts`

Same for `marketContext`, `thematicTakeaways`, `trendsDelta`, `materialitySignal`.

#### 5.2.2 Update 10-K template
**File**: `components/ui/email/templates/10k-minimalist-template.tsx`

Add component sections (in render order):
- `<MaterialityBadge signal={materialitySignal} />` (rendered top, just below the headline; suppressed when score === 'noise')
- `<MarketContextBlock context={marketContext} />` (above the scorecard)
- `<ThematicTakeawaysList items={thematicTakeaways} />` (after the scorecard)
- `<PeerContextBlock peer={peerContext} />` (after thematic takeaways; suppressed when null)

Use the existing minimalist style language — soft borders, single-color palette, Inter-stack typography. No new fonts, no new colors — just structural blocks following the existing pattern in `Form10KMinimalistTemplate`.

#### 5.2.3 Update 10-Q template
**File**: `components/ui/email/templates/10q-minimalist-template.tsx`

Same structure as 10-K, but with `<TrendsDeltaBlock deltas={trendsDelta} />` replacing `<PeerContextBlock>`. The trends delta renders as a 3-row "Before / After" mini-table (consistent with the existing `PillDelta` scorecard's visual register).

**Checkpoint 5.2.3**:
```bash
npm test -- --testPathPattern="mini-deep-dive.test.tsx"
# Expected: 12 passing
```

### Step 5.3: 🔵 Refactor

- [ ] Extract `MaterialityBadge`, `MarketContextBlock`, `ThematicTakeawaysList`, `PeerContextBlock`, `TrendsDeltaBlock` into a shared `components/ui/email/templates/mini-deep-dive-blocks.tsx` so both templates source them from one place.
- [ ] Verify Gmail dark-mode + light-mode rendering with the existing email-visual-regression harness if one exists; otherwise manually preview via React Email dev server.

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm test -- --testPathPattern="email"` passes (no regressions to existing template tests)
- [ ] `npm test -- --testPathPattern="extractors"` passes
- [ ] `npm run build` succeeds

#### Manual Verification:
- [ ] Generate a real preview email via the dev React Email server (typically `npm run email:dev`) for both 10-K and 10-Q templates. Confirm:
  - Materiality badge renders cleanly when high/medium/low; suppressed when noise.
  - Market Context paragraph fits visually above the scorecard without crowding.
  - Thematic Takeaways bullets render with proper spacing.
  - 10-K Peer Context renders as a short framed block; 10-Q Trends Delta renders as a before/after mini-table.
- [ ] Send a test email to a Gmail account; verify rendering on web Gmail + Gmail mobile app.

**STOP**: Confirm visual quality before Phase 6.

---

## Phase 6: Quality Gate Extension

### Overview
The existing QualityGate (referenced in `2026-02-12-email-summary-quality-improvements.md`) detects sparse sections like blank `financialHighlights`. Extend it so a 10-K with empty `thematicTakeaways` or a 10-Q with empty `trendsDelta` triggers the same quality-warning path (delivery still happens, but the gap is logged and counted in `ai.quality_gate_*` metrics).

### Step 6.1: 🔴 Write Failing Tests

**Test File**: `__tests__/ai/quality-gate-mini-deep-dive.test.ts`

```typescript
import { checkQualityGate } from '@/lib/ai/quality-gate'; // confirm exact path

describe('QualityGate: mini deep dive sections', () => {
  it('flags 10-K with empty thematicTakeaways as sparse', () => {
    const result = checkQualityGate({ formType: '10-K', summaryJSON: { thematicTakeaways: [] } });
    expect(result.warnings).toContain('SPARSE_THEMATIC_TAKEAWAYS');
  });

  it('flags 10-K with missing materialitySignal as sparse', () => {
    const result = checkQualityGate({ formType: '10-K', summaryJSON: {} });
    expect(result.warnings).toContain('MISSING_MATERIALITY_SIGNAL');
  });

  it('flags 10-Q with empty trendsDelta when prior 10-Q exists', () => {
    const result = checkQualityGate({
      formType: '10-Q',
      summaryJSON: { trendsDelta: [] },
      hadPriorFiling: true,
    });
    expect(result.warnings).toContain('SPARSE_TRENDS_DELTA');
  });

  it('does NOT flag 10-Q with empty trendsDelta when no prior 10-Q', () => {
    const result = checkQualityGate({
      formType: '10-Q',
      summaryJSON: { trendsDelta: [] },
      hadPriorFiling: false,
    });
    expect(result.warnings).not.toContain('SPARSE_TRENDS_DELTA');
  });

  it('does NOT flag peerContext absence (it is optional)', () => {
    const result = checkQualityGate({ formType: '10-K', summaryJSON: { peerContext: null } });
    expect(result.warnings).not.toContain('MISSING_PEER_CONTEXT');
  });
});
```

**Checkpoint 6.1**: 5 failing tests.

### Step 6.2: 🟢 Implement

Locate the existing QualityGate module (likely `lib/ai/quality-gate.ts` or referenced in `summarize.ts`). Add the new sparse-section checks specific to the new fields. Pass `hadPriorFiling` into the gate from the summarize pipeline (it knows because the historical-summary fetch happened upstream).

**Checkpoint 6.2**: 5 passing.

### Step 6.3: 🔵 Refactor

- [ ] Consolidate the new warning constants with existing ones (e.g., put them adjacent to `SPARSE_FINANCIAL_HIGHLIGHTS`).
- [ ] Ensure quality-gate warnings are emitted on the existing `ai.quality_gate_warning` counter with a `reason` tag.

### Step 6.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm test -- --testPathPattern="quality-gate"` passes
- [ ] `npm run build` succeeds

#### Manual Verification:
- [ ] Trigger a deliberately empty mini-deep-dive output (e.g., short-circuit the enrichment providers locally); verify the quality gate logs the right warnings and the summary still delivers.

**STOP**: Confirm before Phase 7.

---

## Phase 7: Integration Tests, Telemetry, and Cost Validation

### Overview
End-to-end validation against real filings. Telemetry confirms fill rates and cost-per-summary land within target. This is the phase where we know the feature is shippable.

### Step 7.1: 🔴 Write Failing Tests

**Test File**: `__tests__/integration/earnings-mini-deep-dive-e2e.test.ts`

```typescript
describe('Earnings mini deep dive E2E', () => {
  it.skip('10-K: NVDA FY2026 produces all new fields at >=80% fill', async () => {
    // Use existing fixture or load from data/test-fixtures
    const result = await runFullSummarization({
      formType: '10-K',
      ticker: 'NVDA',
      filingContent: nvdaFY2026Fixture,
      mockHistoricalSummaries: [/* prior NVDA 10-K */],
      mockEnrichmentResponses: { /* mocked OpenRouter responses for both new providers */ },
    });
    expect(result.summaryJSON.marketContext).toBeTruthy();
    expect(result.summaryJSON.thematicTakeaways.length).toBeGreaterThanOrEqual(3);
    expect(result.summaryJSON.peerContext?.label).toBeTruthy();
    expect(result.summaryJSON.materialitySignal.score).toMatch(/high|medium|low|noise/);
  });

  it.skip('10-Q with prior 10-Q in DB produces non-empty trendsDelta', async () => {
    const result = await runFullSummarization({
      formType: '10-Q',
      ticker: 'AAPL',
      filingContent: aaplQ2Fy2026Fixture,
      mockHistoricalSummaries: [aaplQ1FY2026Summary],
      mockEnrichmentResponses: { /* market_context only, no peer_context for 10-Q */ },
    });
    expect(result.summaryJSON.trendsDelta.length).toBeGreaterThanOrEqual(1);
    expect(result.summaryJSON.trendsDelta[0].area).toBeTruthy();
    expect(result.summaryJSON.trendsDelta[0].prior).toBeTruthy();
    expect(result.summaryJSON.trendsDelta[0].current).toBeTruthy();
  });

  it.skip('10-Q with no prior 10-Q returns empty trendsDelta gracefully', async () => {
    const result = await runFullSummarization({
      formType: '10-Q',
      ticker: 'NEW_IPO',
      filingContent: newIpoQ1Fixture,
      mockHistoricalSummaries: [],
      mockEnrichmentResponses: {},
    });
    expect(result.summaryJSON.trendsDelta).toEqual([]);
  });
});
```

(These are `it.skip` until fixtures exist; phase 7 includes creating or pointing at the fixtures.)

### Step 7.2: 🟢 Implement Fixtures + Wire-Up

#### 7.2.1 Locate or create fixtures
- Check `__tests__/integration/` and `data/test-fixtures/` for existing NVDA and AAPL filing fixtures.
- If absent, capture from production: read one recent processed filing's `processedContent` from the DB and snapshot it locally (gitignored if large).

#### 7.2.2 Wire up mocked enrichment
The existing `runEnrichment` orchestrator accepts a `_fetchImpl` injection point — use it for deterministic mocked enrichment responses.

#### 7.2.3 Telemetry additions
Add new counters in `lib/ai/web-search-context.ts`:
- `ai.market_context_context_attempted` / `_added` / `_error` / `_timeout`
- `ai.peer_context_context_attempted` / `_added` / `_error` / `_timeout`

(These follow the existing pattern at `web-search-context.ts:473, 511, 562, 567`.)

Add a materiality-distribution counter in `summarize.ts` post-parse:
- `ai.materiality_signal_distribution` tagged with `{score: 'high' | 'medium' | 'low' | 'noise'}`.

#### 7.2.4 Cost dashboard query
Document a PostHog (or equivalent) query that surfaces:
- New cost-per-10-K and cost-per-10-Q
- Materiality score distribution over 7-day rolling window
- Per-provider fill rate for `market_context` and `peer_context`
- Quality gate warnings for new fields

Add to `docs/plans/2026-05-10-earnings-mini-deep-dive.md` "Operational Verification" section.

**Checkpoint 7.2.4**: Un-skip integration tests and verify they pass.

### Step 7.3: 🔵 Refactor

- [ ] Make sure all new monitoring counter names follow the existing `ai.<provider>_<event>` naming convention.
- [ ] Confirm no test-only constants leak into production exports.

### Step 7.4: Final Phase Verification

#### Automated Verification:
- [ ] `npm test` (full suite) passes with no regressions
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

#### Manual Verification:
- [ ] **Production smoke test**: Wait for the next 10-K and next 10-Q from any allowlisted ticker to flow through after deploy. Inspect:
  - `Summary.summaryJSON` contains all five new fields populated.
  - Quality-gate warnings log < 20% of filings (target fill rate ≥80%).
  - Cost-per-summary stays under $0.30 (10-K) / $0.18 (10-Q).
  - X-sentiment block, market-context block, peer-context (10-K) or trends-delta block (10-Q) all appear cleanly in the rendered email.
  - Materiality badge renders only when score is high/medium/low; suppressed when noise.
- [ ] **User read-through**: send one delivered email to product owners (Wilfred + 1 other) and confirm the analyst-voice and grounding land — no hallucinated peer numbers, no "deep dive" phrasing, no extrapolation flags from QA.

**STOP**: Final manual confirmation before declaring the feature shipped.

---

## Testing Strategy

### TDD Test Design Principles

Every phase opens with a `🔴 Red` step where failing tests define the contract. The phases are designed so each test failure is a near-trivial implementation step ("add field to schema", "add provider function", "add render block").

### Test Categories (in order of writing)

1. **Contract tests** (Phase 1, 4): Schemas declare the new fields with the right shape; providers expose the right `detect` / `buildPrompt` / `parseResponse` API.
2. **Edge case tests** (Phases 2, 3, 6): empty historical summaries → empty `trendsDelta`; missing materiality → defaults to `noise`; peerContext optional; unknown ticker → no peer set.
3. **Integration tests** (Phase 7): full pipeline with mocked enrichment.
4. **Visual / template tests** (Phase 5): React Email snapshot + structural assertions.

### Checkpoint Frequency
- Each phase has ≥3 checkpoints (Red, Green, Refactor) plus per-step Green sub-checkpoints (1.2.1 through 1.2.5 etc).
- Each step keeps the working set small — typically one schema field, one provider, or one render block per checkpoint.

### Manual Testing Steps (cross-phase)
1. Trigger summarization on a real recent 10-K and 10-Q via the cron handler or `scripts/summarize-one-filing.ts` (or equivalent).
2. Inspect `Summary.summaryJSON` for the new fields.
3. Render the email via the React Email dev server.
4. Send a test email to a real Gmail account.
5. Compare against a control summary (production today) — confirm new sections add value without bloating the email or violating the banned-phrase list.

## Performance Considerations

**Per-filing latency** (worst case):
- Today, ENRICHMENT_FORM_TYPES enrichment for 10-K/10-Q is OFF — adding it adds up to 20s of parallel provider latency (bounded by `PER_PROVIDER_MAX_MS = 20_000`).
- X-sentiment is already running and adds up to 180s for allowlisted tickers — no change.
- New providers (`market_context`, `peer_context`) run in parallel with existing providers under the 45s global cap. So overall latency increase is ≤20s in the worst case where the historical-context fetch and enrichment fan-out happen simultaneously.

**Per-filing cost** (estimate):
- Existing 10-K: ~$0.148 (490K tokens of model time)
- Add `market_context` provider: ~$0.003
- Add `peer_context` provider: ~$0.003
- Slightly larger output (new fields): ~$0.02 additional model output
- X-sentiment: already in baseline (when ticker allowlisted, $0.05)
- **New 10-K total**: ~$0.18 (vs target ≤$0.30 ✓)
- **New 10-Q total**: ~$0.10 (vs target ≤$0.18 ✓; no peer_context fires for 10-Q)

**Cost ledger**:
- Both new providers use the existing `tryDebitEnrichment('why_it_matters', ...)` envelope, so they share the daily cap with the 8-K providers. Confirm the cap is sized for the extra 2× provider count.

**Token budget**:
- New schema fields add roughly 800-1200 tokens to the output schema description in the prompt.
- New extraction-rules text adds ~600 tokens.
- New historical-thematic-anchor block adds ~400 tokens when populated.
- Total prompt-side increase: ~2000-2200 tokens, well under the 180K context limit (`summarize.ts:847`).

## Migration Notes

- **Backward compatibility**: All new fields are OPTIONAL in `FORM_SCHEMAS` except `materialitySignal`. Existing summaries in the DB without these fields render fine — extractors default sensibly. No backfill needed.
- **In-flight plans**: `2026-02-18-summary-quality-fixes.md` and `2026-02-12-email-summary-quality-improvements.md` are NOT blocked by this work. The financial-highlights fill-rate fix and the banned-phrase guardrail tests both remain valid; this plan does not touch those fields. Merge order doesn't matter.
- **Feature flag**: Wrap the `ENRICHMENT_FORM_TYPES` extension and the new schema fields behind a PostHog flag (`enable_earnings_mini_deep_dive`) so we can roll out per-cohort. Existing `isWhyItMattersEnabled` mechanism applies at the enrichment-provider layer for free.
- **No DB migration**: All new fields land in `Summary.summaryJSON` (existing `Json?` column at `prisma/schema.prisma:122`).

## References

- Original task: this conversation (Wilfred, 2026-05-10)
- Existing prompt architecture: `thoughts/shared/research/2026-01-07-sec-filing-prompts-templates-architecture.md`
- Active quality plans (NOT BLOCKED by this work): `docs/plans/2026-02-12-email-summary-quality-improvements.md`, `docs/plans/2026-02-18-summary-quality-fixes.md`
- Cost & fill-rate baseline: `thoughts/shared/research/2026-01-16-summary-table-field-analysis.md`
- User pain research: `.claude/analysis/reddit-sec-filing-pain-points-research.md`, `.claude/analysis/user-pain-points-and-quotes.md`, `.claude/analysis/tldrSEC-market-validation-executive-summary.md`
- Banned-phrase list: `lib/ai/prompts/unified-prompts.ts:1195`
- No-extrapolation rule: `lib/ai/prompts/unified-prompts.ts:1123`
- Active prompt dispatch: `lib/ai/prompts/unified-prompts.ts:206-301` (schemas), `:1254-1328` (extraction guidance)
- Active summarization entrypoint: `lib/ai/summarize.ts:760-843`
- Enrichment framework: `lib/ai/web-search-context.ts`
- X-sentiment provider: `lib/ai/x-sentiment-provider.ts`, eligibility: `lib/ai/x-sentiment-eligibility.ts:29-30`
- SIC sector map: `lib/sec-edgar/sic-sector-map.ts`
- Email templates: `components/ui/email/templates/10k-minimalist-template.tsx`, `10q-minimalist-template.tsx`
- Extractors: `lib/email/10k-data-extractor.ts`, `lib/email/10q-data-extractor.ts`, registry at `lib/email/extractor-registry.ts`
- Summary persistence: `prisma/schema.prisma:115-122` (`Summary.summaryJSON`)
