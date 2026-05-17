# Materiality Calibration Harness

Three-step harness to validate the materiality classifier before the `materialitySignal` field merges into production schemas. Approved as **Pre-PR1** in the autoplan review (see `.claude/tasks/earnings-mini-deep-dive.md` → "AUTOPLAN APPROVED" section).

**Ship gate**: the classifier must hit **≥75% overall accuracy** against this hand-labeled set before PR1 production code merges. Anything under 75% means the rubric in `lib/ai/calibration/materiality-rubric.ts` needs iteration.

## Three-step workflow

### Step 1 — Sample 30 filings

```bash
npx tsx scripts/materiality-calibration/sample-filings.ts
```

Pulls 30 historical 10-K/10-Q filings from prod (15 of each form type, max 2 per ticker, recent-18-months window), writes `labeling-template.csv` with metadata + empty label columns.

### Step 2 — Hand-label (Wilfred does this)

Open `labeling-template.csv` in a spreadsheet editor. Read each filing's source via the `secUrl` column. For each row, fill in:
- **`score`** — one of `high`, `medium`, `low`, `noise` (lowercase, no quotes)
- **`rationale`** — one short sentence (40–200 chars) citing the specific filing evidence (Item number, section name, or quoted phrase)
- **`notes`** (optional) — anything weird about the filing or why this was a borderline call

Aim for a mix across all 4 tiers. If you only end up with `low` and `noise`, the test set won't exercise the HIGH/MEDIUM paths of the classifier.

Save the file as `labeling-template.csv` (same name). Read the rubric below before labeling.

### Step 3 — Run calibration

```bash
npx tsx scripts/materiality-calibration/run-calibration.ts
```

Runs the materiality prompt against every labeled row, compares the model's prediction to your label, prints a confusion matrix and per-class + overall accuracy. Exit code is non-zero if accuracy is below the 75% gate.

Writes a markdown report to `scripts/materiality-calibration/calibration-report-{YYYYMMDD-HHMMSS}.md` you can attach to the PR1 description.

If accuracy < 75%: iterate the rubric prose in `lib/ai/calibration/materiality-rubric.ts`, re-run Step 3. The labeled set stays fixed; the rubric is the variable.

## Rubric

The classifier emits one of four scores. The decision tree (also baked into the prompt at `lib/ai/calibration/materiality-rubric.ts`):

### 10-K (annual report)

| Tier | Trigger |
|------|---------|
| **HIGH** | (a) Revenue/net income beats or misses prior year by >10%, **or** (b) NEW material risk factor not present in prior 10-K, **or** (c) going-concern language anywhere in Item 1A or auditor's report, **or** (d) control deficiency disclosed in Item 9A, **or** (e) CEO/CFO/Chair departure announced, **or** (f) major segment write-down or impairment >5% of total assets, **or** (g) major restatement of prior-year financials |
| **MEDIUM** | (a) Noteworthy guidance change or revised outlook in MD&A, **or** (b) segment realignment or new segment introduced, **or** (c) accounting principle change, **or** (d) 5–10% YoY revenue or earnings shift, **or** (e) new material legal proceeding short of "material adverse effect", **or** (f) auditor change |
| **LOW** | Routine annual filing. Numbers in line with prior year (<5% variance). No new risk factors. No leadership change. No accounting change. Boilerplate MD&A. |
| **NOISE** | No investor-actionable signal beyond routine annual disclosure. Often shell companies, dormant entities, or amended 10-K/A correcting a single typo. |

### 10-Q (quarterly report)

| Tier | Trigger |
|------|---------|
| **HIGH** | (a) Management cuts forward guidance, **or** (b) quarterly revenue/EPS miss vs consensus by >5% (or vs prior quarter if no consensus), **or** (c) NEW risk factor not in last 10-K or last 10-Q, **or** (d) control deficiency disclosed, **or** (e) segment shutdown, divestiture, or major restructuring announced, **or** (f) material legal proceeding initiated or adverse judgment |
| **MEDIUM** | (a) Guidance raised, narrowed, or reaffirmed with notable color change, **or** (b) 3–5% YoY miss or beat on revenue/EPS, **or** (c) working-capital flag (DSO/DPO swing >15%), **or** (d) segment narrative shift, **or** (e) accounting estimate change |
| **LOW** | In-line quarter. Numbers within ±3% of prior year. No guidance change. No new risk factors. Routine MD&A. |
| **NOISE** | No investor-actionable signal. Filings with no material content beyond mechanical financial restatement. |

### Routing rules for borderline calls

- **Multiple material items**: score the SINGLE most consequential one and cite it.
- **Guidance cut OR missed quarter**: pick the more consequential of the two — both qualify as HIGH on their own, but rationale must call out which one.
- **"New risk factor"**: requires confirmation the language is NOT in the prior period's filing. If you cannot confirm absence, downgrade by one tier.
- **Amended filings (10-K/A, 10-Q/A)**: the amendment itself is HIGH if it restates prior financials or discloses new control issues; otherwise score against the underlying filing's content.
- **Don't inflate**: if you find yourself wanting to score MEDIUM "because the filing felt notable" without a specific trigger from the table, the right answer is LOW.

## Sanity checks before running Step 3

- [ ] All 30 rows have a non-empty `score` value
- [ ] Every `score` value is exactly one of `high`, `medium`, `low`, `noise` (lowercase)
- [ ] Every row's `rationale` cites a specific item number, section name, or quoted phrase
- [ ] You have at least 5 rows of each tier across the full set (i.e. not all 30 rows labeled `low`/`noise`)
- [ ] Save the file as `scripts/materiality-calibration/labeling-template.csv`

## What the calibration report contains

The script writes a markdown report with:
- Overall accuracy (% of rows where model prediction matches human label)
- Per-tier accuracy (e.g., "high: 6/8 = 75%")
- 4×4 confusion matrix (rows = human label, cols = model prediction)
- Per-row mismatch detail: which filings the model got wrong, what it predicted vs the human label, and the model's rationale
- Total cost (USD) and total wall-clock time
- Pass/fail verdict against the 75% gate

The mismatch detail is the most useful artifact for rubric iteration — it tells you WHICH classification edges the prompt is missing.

## Costs

Approximately 30 calls × ~$0.003 each = **~$0.10** per full run against the labeled set. Cheap to re-run after each rubric iteration.

## Environment

- `XAI_API_KEY` or `tldrsec_x_search` must be set in `.env.local` (the runner uses the existing `lib/ai/xai-direct-client.ts`)
- `DATABASE_URL` must be set in `.env.local` (the sampling script reads SEC filings + content cache from prod)

## Files

- `lib/ai/calibration/materiality-rubric.ts` — prompt + schema + parser (the iterable target)
- `scripts/materiality-calibration/sample-filings.ts` — Step 1
- `scripts/materiality-calibration/labeling-template.csv` — generated by Step 1, filled in Step 2
- `scripts/materiality-calibration/run-calibration.ts` — Step 3
- `scripts/materiality-calibration/calibration-report-*.md` — Step 3 output, attach to PR1
- `__tests__/ai/calibration/materiality-rubric.test.ts` — unit tests for the parser
