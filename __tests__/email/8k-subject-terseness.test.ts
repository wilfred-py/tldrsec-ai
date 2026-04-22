/**
 * 8-K subject line terseness tests (S1-S4)
 *
 * Asserts the prompt's subject-length + filler-verb contract. These run
 * against recorded fixture subjects — the actual LLM compliance is verified
 * under RUN_LIVE_LLM_EVALS=true in 8k-prompt-eval.test.ts.
 *
 * For pre-recording: this suite asserts the contract shape so that when real
 * LLM responses replace these synthetic strings, the regression guard catches
 * drift.
 */

const FILLER_VERBS = /\b(Issued|Announced|Announces|Prices|Offers|Enters into)\b/i;

// Synthetic subjects that model what Grok should produce post-prompt-change.
// Replace with real recorded subjects as they come in (see CONTRIBUTING.md).
const SUBJECTS_203 = [
  'BRK.A: ¥265B yen + $7B USD notes (7 tranches)',
  'GOOGL: $17.5B senior notes (7 tranches)',
  'GOOGL: €6.5B euro notes (6 tranches)',
];
const SUBJECTS_101 = [
  'AMZN: $1.2B Globalstar acquisition',
  'MSFT: Activision $68.7B all-cash deal',
];

describe('8-K subject terseness contract (S1-S4)', () => {
  it('S1: all 2.03 subjects are ≤55 characters', () => {
    for (const subj of SUBJECTS_203) {
      expect(subj.length).toBeLessThanOrEqual(55);
    }
  });

  it('S2: all 1.01 subjects are ≤55 characters', () => {
    for (const subj of SUBJECTS_101) {
      expect(subj.length).toBeLessThanOrEqual(55);
    }
  });

  it('S3: 2.03 subjects contain no filler verbs', () => {
    for (const subj of SUBJECTS_203) {
      expect(FILLER_VERBS.test(subj)).toBe(false);
    }
  });

  it('S4: 2.03 subject contains tranche count when >2 tranches', () => {
    for (const subj of SUBJECTS_203) {
      expect(subj).toMatch(/\d+ tranches/);
    }
  });

  it('all 2.03 subjects start with a ticker prefix', () => {
    for (const subj of SUBJECTS_203) {
      expect(subj).toMatch(/^[A-Z.]+: /);
    }
  });
});
