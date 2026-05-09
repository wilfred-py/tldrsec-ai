/**
 * Tiered-pricing tests for x-ai/grok-4.3.
 *
 * xAI bills grok-4.3 in flat tiers based on input-token volume:
 *   ≤200K input tokens: $1.25/M input, $2.50/M output
 *   >200K input tokens: $2.50/M input, $5.00/M output
 *
 * Boundary: an exactly-200K-input call stays in the cheap tier ("exceeding").
 */

import { calculateCost } from '../token-counter';

jest.mock('../config', () => ({
  TIERED_PRICING_THRESHOLD: 200_000,
  getDefaultModel: jest.fn(() => 'x-ai/grok-4.3'),
  getFallbackModel: jest.fn(() => 'x-ai/grok-4.3'),
}));

describe('calculateCost — grok-4.3 tiered pricing', () => {
  beforeEach(() => {
    delete process.env.XAI_GROK_INPUT_COST;
    delete process.env.XAI_GROK_OUTPUT_COST;
    delete process.env.XAI_GROK_INPUT_COST_HIGH;
    delete process.env.XAI_GROK_OUTPUT_COST_HIGH;
  });

  it('uses ≤200K-tier rates for small calls (default env)', () => {
    const { inputCost, outputCost, totalCost } = calculateCost(1_000, 500, 'x-ai/grok-4.3');
    expect(inputCost).toBeCloseTo(1_000 * 0.00000125, 10); // $0.00125
    expect(outputCost).toBeCloseTo(500 * 0.0000025, 10);   // $0.00125
    expect(totalCost).toBeCloseTo(0.0025, 10);
  });

  it('uses ≤200K-tier rates for exactly-200K input (boundary stays cheap)', () => {
    const result = calculateCost(200_000, 1_000, 'x-ai/grok-4.3');
    // Cheap tier: $1.25/M input, $2.50/M output
    expect(result.inputCost).toBeCloseTo(200_000 * 0.00000125, 10);
    expect(result.outputCost).toBeCloseTo(1_000 * 0.0000025, 10);
  });

  it('uses >200K-tier rates for 200_001 input', () => {
    const result = calculateCost(200_001, 1_000, 'x-ai/grok-4.3');
    // Expensive tier: $2.50/M input, $5.00/M output
    expect(result.inputCost).toBeCloseTo(200_001 * 0.0000025, 10);
    expect(result.outputCost).toBeCloseTo(1_000 * 0.000005, 10);
  });

  it('uses >200K-tier rates for very large calls', () => {
    const result = calculateCost(1_000_000, 8_000, 'x-ai/grok-4.3');
    expect(result.inputCost).toBeCloseTo(1_000_000 * 0.0000025, 10); // $2.50
    expect(result.outputCost).toBeCloseTo(8_000 * 0.000005, 10);     // $0.04
    expect(result.totalCost).toBeCloseTo(2.54, 6);
  });

  it('respects XAI_GROK_INPUT_COST / XAI_GROK_OUTPUT_COST env overrides (≤200K)', () => {
    process.env.XAI_GROK_INPUT_COST = '1.10';
    process.env.XAI_GROK_OUTPUT_COST = '2.30';

    const result = calculateCost(1_000, 500, 'x-ai/grok-4.3');
    expect(result.inputCost).toBeCloseTo(1_000 * (1.10 / 1_000_000), 10);
    expect(result.outputCost).toBeCloseTo(500 * (2.30 / 1_000_000), 10);
  });

  it('respects XAI_GROK_INPUT_COST_HIGH / OUTPUT_COST_HIGH overrides (>200K)', () => {
    process.env.XAI_GROK_INPUT_COST_HIGH = '2.20';
    process.env.XAI_GROK_OUTPUT_COST_HIGH = '4.40';

    const result = calculateCost(300_000, 1_000, 'x-ai/grok-4.3');
    expect(result.inputCost).toBeCloseTo(300_000 * (2.20 / 1_000_000), 10);
    expect(result.outputCost).toBeCloseTo(1_000 * (4.40 / 1_000_000), 10);
  });

  it('defaults to grok-4.3 cheap tier when model is unknown (no crash, no zero)', () => {
    // Previous fallback chain ended with a key that did not exist in the
    // prices map (`x-ai/grok-4-fast:free`), returning undefined and crashing.
    // New behavior: unknown model → grok-4.3 ≤200K-tier defaults.
    const result = calculateCost(1_000, 500, 'unknown/model');
    expect(result.inputCost).toBeCloseTo(1_000 * 0.00000125, 10);
    expect(result.outputCost).toBeCloseTo(500 * 0.0000025, 10);
  });

  it('handles zero-token calls without divide-by-zero or NaN', () => {
    const result = calculateCost(0, 0, 'x-ai/grok-4.3');
    expect(result.inputCost).toBe(0);
    expect(result.outputCost).toBe(0);
    expect(result.totalCost).toBe(0);
  });
});
