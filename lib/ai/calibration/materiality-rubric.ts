/**
 * Materiality Rubric — calibration target for PR1 of earnings-mini-deep-dive.
 *
 * Standalone module exporting the 4-tier materiality prompt for 10-K and 10-Q
 * filings. NOT yet wired into the production summarization pipeline
 * (`unified-prompts.ts`). Lives here so it can be iterated independently
 * against a 30-filing hand-labeled ground-truth set before any production
 * code depends on it.
 *
 * Ship gate: this rubric must hit ≥75% accuracy on the labeled set before
 * the materiality field merges into `FORM_SCHEMAS['10-K' | '10-Q']`.
 *
 * Threshold rationale (from approved plan, AUTOPLAN APPROVED section):
 *   10-K high   — >10% rev/earnings surprise vs prior year, new material risk
 *                 factor, going-concern, control deficiency, leadership
 *                 departure, major segment write-down.
 *   10-K medium — noteworthy guidance change, segment realignment,
 *                 accounting change, or 5-10% YoY metric shift.
 *   10-K low    — routine annual filing, no material divergence from prior.
 *   10-K noise  — no investor-actionable signal.
 *
 *   10-Q high   — guidance cut, miss >5%, new risk factor not in last 10-K,
 *                 control deficiency, segment shutdown, material legal.
 *   10-Q medium — guidance raised/narrowed, 3-5% YoY miss/beat, working-
 *                 capital flag (DSO/DPO swing >15%), segment narrative shift.
 *   10-Q low    — in-line quarter, routine update.
 *   10-Q noise  — no investor-actionable signal.
 */

export type MaterialityScore = 'high' | 'medium' | 'low' | 'noise';
export type MaterialityFormType = '10-K' | '10-K/A' | '10-Q' | '10-Q/A';

export interface MaterialitySignal {
  score: MaterialityScore;
  rationale: string;
}

export interface MaterialityCalibrationInput {
  formType: MaterialityFormType;
  ticker: string;
  companyName: string;
  /**
   * Filing content. The caller decides whether to pass the full processed
   * content or a pre-summarized excerpt. For calibration we pass the
   * processed content truncated to MATERIALITY_MAX_INPUT_CHARS.
   */
  filingContent: string;
}

export const MATERIALITY_MAX_INPUT_CHARS = 60_000;
// Reasoning models (grok-4.20-0309-reasoning) tend toward 200-400 char rationales
// when citing evidence per filing rules. Cap at 400 with 100-char overshoot
// allowance in the parser. Bumped from 200 after 2026-05-13 calibration showed
// 14/30 parse failures due to length, every model output ~220-300 chars.
export const MATERIALITY_RATIONALE_MAX_CHARS = 400;
export const MATERIALITY_RATIONALE_MIN_CHARS = 40;

export const MATERIALITY_SCHEMA = {
  type: 'object',
  required: ['score', 'rationale'],
  properties: {
    score: {
      type: 'string',
      enum: ['high', 'medium', 'low', 'noise'],
      description:
        'Materiality classification. MUST be one of the four enum values exactly.',
    },
    rationale: {
      type: 'string',
      minLength: MATERIALITY_RATIONALE_MIN_CHARS,
      maxLength: MATERIALITY_RATIONALE_MAX_CHARS,
      description:
        'One sentence (40-200 chars) citing the specific filing evidence that drove the score. MUST reference an item number, section name, or directly-quoted phrase.',
    },
  },
} as const;

export const MATERIALITY_SYSTEM_PROMPT = `You are an SEC filing materiality classifier. Read the filing excerpt and emit a single materiality classification using a 4-tier scale.

OUTPUT FORMAT: valid JSON only, no prose before or after.
{"score": "high" | "medium" | "low" | "noise", "rationale": "..."}

RATIONALE LENGTH: 40-400 characters. One sentence, or at most two short sentences. Longer rationales are rejected by the parser. Do not list multiple evidence types — pick the single most-material one and cite it.

CORE RULES:
1. The rationale MUST cite specific filing evidence — an Item number (e.g., "Item 1A"), a named section ("Trends and Uncertainties"), or a directly-quoted phrase. Generic language like "the filing discusses risks" is a failure.
2. NEVER invent figures, percentages, or events the filing does not state. If the evidence for a tier is not in the excerpt, drop to a lower tier.
3. "noise" is a valid and frequent answer. Most routine filings are noise or low. Do not inflate the score to feel useful.
4. NEVER use the phrases "deep dive", "dive into". They are banned company-wide.`;

const BANNED_TIER_PROSE = `\nDO NOT use the words "delve", "crucial", "robust", "comprehensive", "nuanced", "multifaceted", "furthermore", "moreover", "additionally", "pivotal", "landscape", "tapestry", "underscore", "foster", "showcase", "intricate", "vibrant", "fundamental", "significant" in the rationale.`;

const TEN_K_RUBRIC = `RUBRIC for 10-K (annual report):

Materiality is SYMMETRIC — a big upside beat is just as material as a big downside miss. Investors react to both. Do not penalize HIGH for positive surprises.

- HIGH    — Any of: (a) revenue or net income beats OR misses prior year by >10% in either direction, (b) NEW material risk factor not present in the prior 10-K, (c) going-concern language anywhere in Item 1A or auditor's report, (d) control deficiency disclosed in Item 9A, (e) CEO/CFO/Chair departure announced, (f) major segment write-down or impairment >5% of total assets, (g) major restatement of prior-year financials, (h) material acquisition or divestiture announced or closed during the period.
- MEDIUM  — Any of: (a) noteworthy guidance change or revised outlook in MD&A, (b) segment realignment or new segment introduced, (c) accounting principle change, (d) 5-10% YoY revenue or earnings shift in either direction, (e) new material legal proceeding short of "material adverse effect", (f) auditor change, (g) major new product line launched (not just routine product refresh).
- LOW     — Routine annual filing. Numbers in line with prior year (<5% variance in either direction). No new risk factors. No leadership change. No accounting change. Boilerplate MD&A.
- NOISE   — Filings with NO material content. Reserved for: amended 10-K/A correcting a single typo or administrative detail; shell-company or dormant-entity annual; transition reports with no operating results. Do NOT classify a routine large-cap annual as NOISE — that is LOW.`;

const TEN_Q_RUBRIC = `RUBRIC for 10-Q (quarterly report):

Materiality is SYMMETRIC — a big upside beat is just as material as a big downside miss. Both move investor expectations and stock prices. Do not classify a +20% revenue beat as routine just because it is "expected" of a high-growth name.

- HIGH    — Any of: (a) management cuts OR materially raises forward guidance, (b) quarterly revenue or EPS beats OR misses vs consensus by >5% in either direction (or vs prior quarter if no consensus), (c) NEW risk factor not present in last 10-K or last 10-Q, (d) control deficiency disclosed, (e) segment shutdown, divestiture, business-transfer agreement, or major restructuring announced, (f) material legal proceeding initiated or adverse judgment, (g) acquisition closed during the quarter with cash outflow >5% of revenue, (h) new product or service line launched (not just routine refresh).
- MEDIUM  — Any of: (a) guidance narrowed or reaffirmed with notable color change, (b) 3-5% YoY miss or beat on revenue/EPS, (c) working-capital flag (Days Sales Outstanding or Days Payable Outstanding swing >15%), (d) segment narrative shift (e.g., previously bullish segment now described cautiously), (e) accounting estimate change, (f) senior officer transition agreement (CMO, GC, CTO, head of major segment).
- LOW     — In-line quarter. Numbers within ±3% of prior year in either direction. No guidance change. No new risk factors. Routine MD&A. Standard buybacks and 10b5-1 plan disclosures only.
- NOISE   — Filings with NO material content beyond mechanical financial restatement. Reserved for: shell-company quarterly with no operations; pre-revenue entity routine submission. Do NOT classify a large-cap quarterly with full operating results as NOISE — that is LOW.`;

const ROUTING_GUIDANCE = `ROUTING GUIDANCE:
- When the filing contains multiple potentially-material items, score the SINGLE most material one and cite it in the rationale.
- A 10-Q with a guidance cut OR a missed quarter is HIGH, not both — pick the single most consequential.
- "New risk factor" requires confirmation that the language is NOT present in the prior period. If you cannot confirm absence in prior, downgrade by one tier.
- For amended filings (10-K/A, 10-Q/A): the amendment itself can be material (HIGH) if it restates prior financials or discloses new control issues; otherwise score the underlying filing's content.`;

export function buildMaterialityUserPrompt(input: MaterialityCalibrationInput): string {
  const isTenK = input.formType === '10-K' || input.formType === '10-K/A';
  const rubric = isTenK ? TEN_K_RUBRIC : TEN_Q_RUBRIC;
  const excerpt = input.filingContent.slice(0, MATERIALITY_MAX_INPUT_CHARS);
  const truncationNote =
    input.filingContent.length > MATERIALITY_MAX_INPUT_CHARS
      ? `\n[NOTE: filing excerpt truncated at ${MATERIALITY_MAX_INPUT_CHARS} chars from a ${input.filingContent.length}-char source.]`
      : '';

  return `${rubric}

${ROUTING_GUIDANCE}

${BANNED_TIER_PROSE}

FILING METADATA:
- Form type: ${input.formType}
- Ticker: ${input.ticker}
- Company: ${input.companyName}

FILING EXCERPT:${truncationNote}
<filing>
${excerpt}
</filing>

Emit the JSON object now. No prose, no markdown fences.`;
}

export interface ParseResult {
  ok: boolean;
  signal?: MaterialitySignal;
  error?: string;
}

const VALID_SCORES: ReadonlySet<MaterialityScore> = new Set<MaterialityScore>([
  'high',
  'medium',
  'low',
  'noise',
]);

/**
 * Parses the model's raw text response into a MaterialitySignal.
 * Tolerates markdown fences (```json ... ```) and surrounding whitespace.
 * Returns ok=false with an error reason on every failure mode the calibration
 * runner needs to count separately.
 */
export function parseMaterialityResponse(raw: string): ParseResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, error: 'empty_response' };
  }

  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'not_an_object' };
  }

  const obj = parsed as Record<string, unknown>;
  const score = obj.score;
  const rationale = obj.rationale;

  if (typeof score !== 'string') {
    return { ok: false, error: 'missing_score' };
  }
  const normalizedScore = score.toLowerCase().trim() as MaterialityScore;
  if (!VALID_SCORES.has(normalizedScore)) {
    return { ok: false, error: `invalid_score_enum:${score}` };
  }

  if (typeof rationale !== 'string') {
    return { ok: false, error: 'missing_rationale' };
  }
  const trimmedRationale = rationale.trim();
  if (trimmedRationale.length < MATERIALITY_RATIONALE_MIN_CHARS) {
    return { ok: false, error: 'rationale_too_short' };
  }
  if (trimmedRationale.length > MATERIALITY_RATIONALE_MAX_CHARS + 50) {
    // Allow 50-char overshoot to handle minor model verbosity; calibration
    // runner can flag overshoots separately if needed.
    return { ok: false, error: 'rationale_too_long' };
  }

  return {
    ok: true,
    signal: {
      score: normalizedScore,
      rationale: trimmedRationale.slice(0, MATERIALITY_RATIONALE_MAX_CHARS),
    },
  };
}

/**
 * The 4-tier confusion matrix the calibration runner will fill in.
 * Rows are human labels (truth), columns are model predictions.
 */
export type MaterialityConfusionMatrix = Record<
  MaterialityScore,
  Record<MaterialityScore, number>
>;

export function emptyConfusionMatrix(): MaterialityConfusionMatrix {
  const scores: MaterialityScore[] = ['high', 'medium', 'low', 'noise'];
  const matrix = {} as MaterialityConfusionMatrix;
  for (const truth of scores) {
    matrix[truth] = {} as Record<MaterialityScore, number>;
    for (const pred of scores) {
      matrix[truth][pred] = 0;
    }
  }
  return matrix;
}
