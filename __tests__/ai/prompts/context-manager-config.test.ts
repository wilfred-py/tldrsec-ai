/**
 * Regression tests for DEFAULT_CONTEXT_CONFIGS.
 *
 * These pin the load-bearing chunk-size / overlap values that v0.0.25.4 set
 * for 10-Q processing. The 8000→24000 bump was the fix for the wrong-revenue
 * bug (FDS Q2 reported $560M instead of $611M because the income-statement
 * table got truncated mid-row at 8000 chars). A future merge conflict or
 * accidental revert would silently regress that bug — these tests catch it.
 */

import { DEFAULT_CONTEXT_CONFIGS } from '@/lib/ai/prompts/context-manager';

describe('DEFAULT_CONTEXT_CONFIGS — 10-Q load-bearing values', () => {
  it('uses a 10-Q chunk size large enough to fit a full income-statement table', () => {
    const cfg = DEFAULT_CONTEXT_CONFIGS['10-Q'];
    expect(cfg.maxChunkSize).toBeGreaterThanOrEqual(24000);
  });

  it('uses a 10-Q overlap large enough to bridge wide tables across chunks', () => {
    const cfg = DEFAULT_CONTEXT_CONFIGS['10-Q'];
    expect(cfg.overlapSize).toBeGreaterThanOrEqual(2000);
  });

  it('keeps 10-K chunk size in the same family (>= 12000) so annual-report sections fit', () => {
    const cfg = DEFAULT_CONTEXT_CONFIGS['10-K'];
    expect(cfg.maxChunkSize).toBeGreaterThanOrEqual(12000);
  });
});
