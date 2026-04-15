/**
 * Tests for 8-K headline quality gate, sentence boundary detection, and layout changes
 */

import { findFirstSentenceBoundary } from '@/components/ui/email/templates/8k-minimalist-template';

describe('findFirstSentenceBoundary', () => {
  it('finds boundary after first sentence', () => {
    const text = 'AMZN entered a merger agreement. The deal is valued at $1.2B.';
    const idx = findFirstSentenceBoundary(text);
    expect(idx).toBe(33); // after ". "
    expect(text.slice(idx).trim()).toBe('The deal is valued at $1.2B.');
  });

  it('returns -1 for single sentence', () => {
    expect(findFirstSentenceBoundary('Just one sentence here')).toBe(-1);
  });

  it('returns -1 for empty string', () => {
    expect(findFirstSentenceBoundary('')).toBe(-1);
  });

  it('returns -1 for null/undefined', () => {
    expect(findFirstSentenceBoundary(null as unknown as string)).toBe(-1);
  });

  it('skips abbreviations like Corp. and Inc.', () => {
    const text = 'Amazon.com Inc. acquired GlobalStar Corp. for $1.2B. The transaction closes in Q3.';
    const idx = findFirstSentenceBoundary(text);
    // Should skip "Inc." and "Corp." and find the boundary after "$1.2B."
    expect(text.slice(idx).trim()).toBe('The transaction closes in Q3.');
  });

  it('skips Mr. Mrs. Dr. abbreviations', () => {
    const text = 'Mr. Smith announced the acquisition. The deal is valued at $500M.';
    const idx = findFirstSentenceBoundary(text);
    expect(text.slice(idx).trim()).toBe('The deal is valued at $500M.');
  });

  it('skips decimal numbers like $1.5 billion', () => {
    const text = 'The deal is valued at $1.5 billion in cash. Shareholders approved the merger.';
    const idx = findFirstSentenceBoundary(text);
    expect(text.slice(idx).trim()).toBe('Shareholders approved the merger.');
  });

  it('handles text ending with period but no second sentence', () => {
    const text = 'AMZN entered a merger agreement.';
    expect(findFirstSentenceBoundary(text)).toBe(-1);
  });

  it('handles period followed by newline as sentence boundary', () => {
    const text = 'First sentence.\nSecond sentence.';
    const idx = findFirstSentenceBoundary(text);
    expect(idx).toBe(16); // after ".\n"
    expect(text.slice(idx).trim()).toBe('Second sentence.');
  });
});
