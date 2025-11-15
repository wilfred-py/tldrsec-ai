/**
 * Unit tests for counter utility functions
 */

import {
  separateDigits,
  compareDigits,
  calculateSeparatorPositions,
  sanitizeCount
} from '../utils';

describe('separateDigits', () => {
  it('handles single digit', () => {
    expect(separateDigits(5)).toEqual([5]);
  });

  it('handles multiple digits', () => {
    expect(separateDigits(147)).toEqual([1, 4, 7]);
  });

  it('handles zero', () => {
    expect(separateDigits(0)).toEqual([0]);
  });

  it('handles large numbers', () => {
    expect(separateDigits(1234567)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles decimal numbers by flooring', () => {
    expect(separateDigits(147.89)).toEqual([1, 4, 7]);
  });

  it('returns fallback for invalid inputs', () => {
    expect(separateDigits(NaN)).toEqual([1, 4, 7]);
    expect(separateDigits(Infinity)).toEqual([1, 4, 7]);
    expect(separateDigits(-5)).toEqual([1, 4, 7]);
  });
});

describe('compareDigits', () => {
  it('detects no change when counts are equal', () => {
    const result = compareDigits(147, 147);
    expect(result.hasChanged).toBe(false);
    expect(result.digits).toEqual([1, 4, 7]);
    expect(result.changedIndices).toEqual([]);
  });

  it('detects change in single digit', () => {
    const result = compareDigits(147, 148);
    expect(result.hasChanged).toBe(true);
    expect(result.digits).toEqual([1, 4, 8]);
    expect(result.changedIndices).toEqual([2]); // Last digit changed
  });

  it('detects multiple digit changes', () => {
    const result = compareDigits(147, 258);
    expect(result.hasChanged).toBe(true);
    expect(result.digits).toEqual([2, 5, 8]);
    expect(result.changedIndices).toEqual([0, 1, 2]); // All digits changed
  });

  it('detects digit count change', () => {
    const result = compareDigits(999, 1000);
    expect(result.hasChanged).toBe(true);
    expect(result.digits).toEqual([1, 0, 0, 0]);
    expect(result.changedIndices).toEqual([0, 1, 2, 3]); // All positions changed
  });

  it('handles decreasing digit count', () => {
    const result = compareDigits(1000, 999);
    expect(result.hasChanged).toBe(true);
    expect(result.digits).toEqual([9, 9, 9]);
    expect(result.changedIndices).toEqual([0, 1, 2, 3]); // All positions changed
  });
});

describe('calculateSeparatorPositions', () => {
  it('returns empty array for less than 4 digits', () => {
    expect(calculateSeparatorPositions(1)).toEqual([]);
    expect(calculateSeparatorPositions(2)).toEqual([]);
    expect(calculateSeparatorPositions(3)).toEqual([]);
  });

  it('calculates single separator for 4 digits', () => {
    expect(calculateSeparatorPositions(4)).toEqual([3]);
  });

  it('calculates multiple separators for 7 digits', () => {
    expect(calculateSeparatorPositions(7)).toEqual([3, 6]);
  });

  it('calculates separators for very large numbers', () => {
    expect(calculateSeparatorPositions(10)).toEqual([3, 6, 9]);
  });
});

describe('sanitizeCount', () => {
  it('passes through valid positive integers', () => {
    expect(sanitizeCount(0)).toBe(0);
    expect(sanitizeCount(147)).toBe(147);
    expect(sanitizeCount(9999)).toBe(9999);
  });

  it('floors decimal numbers', () => {
    expect(sanitizeCount(147.89)).toBe(147);
    expect(sanitizeCount(99.1)).toBe(99);
  });

  it('returns default for non-number types', () => {
    expect(sanitizeCount('147')).toBe(147); // Default fallback
    expect(sanitizeCount(null)).toBe(147);
    expect(sanitizeCount(undefined)).toBe(147);
    expect(sanitizeCount({})).toBe(147);
  });

  it('returns default for invalid numbers', () => {
    expect(sanitizeCount(NaN)).toBe(147);
    expect(sanitizeCount(Infinity)).toBe(147);
    expect(sanitizeCount(-Infinity)).toBe(147);
  });

  it('returns 0 for negative numbers', () => {
    expect(sanitizeCount(-5)).toBe(0);
    expect(sanitizeCount(-147)).toBe(0);
  });

  it('caps extremely large numbers at 1M', () => {
    expect(sanitizeCount(1_000_001)).toBe(1_000_000);
    expect(sanitizeCount(9_999_999)).toBe(1_000_000);
  });
});
