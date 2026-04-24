/**
 * Tests for capHeadline() — caps headlines at a word boundary with ellipsis.
 * Critical for protecting the lead-header from overflowing into the badge row
 * (especially the generic-template fallback that pulls full summaryText).
 */

import { capHeadline } from '@/components/ui/email/design-system';

describe('capHeadline', () => {
  it('returns empty string for undefined input', () => {
    expect(capHeadline(undefined)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(capHeadline('')).toBe('');
  });

  it('returns trimmed text unchanged when under the cap', () => {
    expect(capHeadline('  Apple beats earnings  ')).toBe('Apple beats earnings');
  });

  it('returns text unchanged when exactly at the cap', () => {
    const text = 'a'.repeat(90);
    expect(capHeadline(text)).toBe(text);
  });

  it('truncates at the nearest word boundary above 60% of cap', () => {
    const text = 'Apple announced record quarterly revenue and significant growth in services across all segments worldwide';
    const result = capHeadline(text, 90);
    expect(result.length).toBeLessThanOrEqual(91); // 90 + ellipsis
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toMatch(/\s…$/); // no trailing whitespace before ellipsis
  });

  it('strips trailing punctuation before appending ellipsis', () => {
    const text = 'Apple announced record quarterly revenue, exceeding analyst estimates and expanding services worldwide.';
    const result = capHeadline(text, 90);
    expect(result.endsWith(',…')).toBe(false);
    expect(result.endsWith('.…')).toBe(false);
    expect(result.endsWith('…')).toBe(true);
  });

  it('honors a custom max length', () => {
    expect(capHeadline('one two three four five six', 10)).toBe('one two…');
  });

  it('hard-truncates when no word boundary exists in the upper portion', () => {
    const text = 'a'.repeat(120);
    const result = capHeadline(text, 90);
    expect(result.length).toBe(91); // 90 chars + ellipsis
  });
});
