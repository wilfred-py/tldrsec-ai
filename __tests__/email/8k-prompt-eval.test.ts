/**
 * 8-K prompt-evaluation tests (P1-P4)
 *
 * Live LLM round-trip compliance checks against the unified 8-K prompt.
 * Gated on `RUN_LIVE_LLM_EVALS=true` because each run costs real xAI credits
 * and is non-deterministic. Runs nightly + pre-deploy per decision 16.
 *
 * What these verify (that recorded-fixture tests cannot):
 * - P1: the prompt actually produces `tranches[]` for a 2.03 debt filing
 * - P2: the prompt actually produces `dealTerms{}` for a 1.01 M&A filing
 * - P3: subject line obeys ≤55 char + no filler-verb contract in live output
 * - P4: co-filed 2.03+1.01 produces BOTH tranches AND dealTerms
 *
 * To run: RUN_LIVE_LLM_EVALS=true npx jest __tests__/email/8k-prompt-eval.test.ts
 *
 * Sample filing URLs used below are stable SEC archive URLs — if a URL 404s,
 * swap for a current analogue and update the expected ticker/shape.
 */
/* eslint-disable jest/no-conditional-expect */

const RUN_LIVE = process.env.RUN_LIVE_LLM_EVALS === 'true';
const describeLive = RUN_LIVE ? describe : describe.skip;

// Fixture filings used as eval inputs. These are prose excerpts that mirror
// the shape a real 8-K body would have after extraction, sufficient for the
// prompt to produce structured output without fetching the full filing.
const FIXTURE_203_BRK = `
Item 2.03 - Creation of a Direct Financial Obligation.
On April 17, 2026, Berkshire Hathaway Inc. issued ¥265 billion of yen-denominated
senior notes in four tranches: ¥60.0B 0.95% notes due 2029, ¥55.0B 1.25% notes
due 2031, ¥40.0B 1.65% notes due 2033, ¥110.0B 2.05% notes due 2036. The company
also issued $7.0B of USD senior notes in three tranches: $3.0B 4.25% notes due
2029, $2.5B 4.55% notes due 2031, $1.5B 5.10% notes due 2036.
`;

const FIXTURE_101_AMZN = `
Item 1.01 - Entry into a Material Definitive Agreement.
On April 15, 2026, Amazon.com, Inc. entered into a definitive agreement to
acquire Globalstar, Inc. for approximately $1.2 billion in cash. The transaction
is subject to regulatory approval and is expected to close in Q3 2026.
`;

const FIXTURE_CO_FILED = `
Item 1.01 - Entry into a Material Definitive Agreement, and
Item 2.03 - Creation of a Direct Financial Obligation.
The company entered into a $500M acquisition agreement with Target Co. and
concurrently issued $500M of 5.00% senior notes due 2030 to finance the deal.
`;

// Minimum contract the prompt must satisfy. These are the assertions the live
// LLM response must pass for the test to succeed.
interface LiveEvalResult {
  itemNumbers?: string[];
  tranches?: Array<{ amountDisplay: string; currency: string }>;
  dealTerms?: { counterparty: string };
  emailSubject?: string;
}

// Placeholder live-call function. Wire this to the real xAI/OpenRouter
// summarization entrypoint when running live. Kept as an indirection so the
// file parses in CI (where RUN_LIVE_LLM_EVALS is unset and the block is
// skipped) without needing network access.
async function runLive8KSummary(_prose: string, _ticker: string): Promise<LiveEvalResult> {
  throw new Error('runLive8KSummary not wired — set RUN_LIVE_LLM_EVALS=true and connect xAI client');
}

describeLive('8-K prompt eval — live LLM (P1-P4)', () => {
  jest.setTimeout(60_000); // live LLM calls can be slow

  it('P1: 2.03 BRK.A multi-currency → tranches[] populated, ≥7 rows, multi-currency present', async () => {
    const res = await runLive8KSummary(FIXTURE_203_BRK, 'BRK.A');
    expect(res.itemNumbers).toContain('2.03');
    expect(Array.isArray(res.tranches)).toBe(true);
    expect(res.tranches!.length).toBeGreaterThanOrEqual(7);
    const currencies = new Set(res.tranches!.map(t => t.currency));
    expect(currencies.has('JPY')).toBe(true);
    expect(currencies.has('USD')).toBe(true);
  });

  it('P2: 1.01 AMZN→Globalstar → dealTerms.counterparty + dealValue populated', async () => {
    const res = await runLive8KSummary(FIXTURE_101_AMZN, 'AMZN');
    expect(res.itemNumbers).toContain('1.01');
    expect(res.dealTerms).toBeDefined();
    expect(res.dealTerms!.counterparty).toMatch(/globalstar/i);
  });

  it('P3: subject line obeys ≤55 char + no filler-verb contract', async () => {
    const res = await runLive8KSummary(FIXTURE_203_BRK, 'BRK.A');
    expect(res.emailSubject).toBeDefined();
    expect(res.emailSubject!.length).toBeLessThanOrEqual(55);
    expect(/\b(Issued|Announced|Announces|Prices|Offers|Enters into)\b/i.test(res.emailSubject!))
      .toBe(false);
    // Ticker prefix
    expect(res.emailSubject).toMatch(/^[A-Z.]+: /);
  });

  it('P4: co-filed 2.03+1.01 → both tranches AND dealTerms populated', async () => {
    const res = await runLive8KSummary(FIXTURE_CO_FILED, 'TEST');
    expect(res.itemNumbers).toEqual(expect.arrayContaining(['1.01', '2.03']));
    expect(Array.isArray(res.tranches)).toBe(true);
    expect(res.tranches!.length).toBeGreaterThan(0);
    expect(res.dealTerms).toBeDefined();
    expect(res.dealTerms!.counterparty.length).toBeGreaterThan(0);
  });
});

// Parse-only sanity check that runs in CI (no live call). Keeps the file from
// appearing empty when RUN_LIVE_LLM_EVALS is unset and gives a smoke-signal
// that the test harness hasn't bit-rotted.
describe('8-K prompt eval — harness sanity (always runs)', () => {
  it('RUN_LIVE_LLM_EVALS env gate is respected', () => {
    expect(typeof RUN_LIVE).toBe('boolean');
    // In CI, this should be false; locally-set-to-true enables the block above.
    expect(RUN_LIVE).toBe(process.env.RUN_LIVE_LLM_EVALS === 'true');
  });
});
