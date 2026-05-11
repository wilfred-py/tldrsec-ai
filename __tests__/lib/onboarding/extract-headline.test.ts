import { extractHeadline } from '@/lib/onboarding/extract-headline';

describe('extractHeadline', () => {
  it('strips a single leading #', () => {
    expect(extractHeadline('# Apple beat earnings.')).toBe(
      'Apple beat earnings.'
    );
  });

  it('strips multiple leading ###', () => {
    expect(extractHeadline('### Apple beat earnings.')).toBe(
      'Apple beat earnings.'
    );
  });

  it('returns first sentence terminated by period', () => {
    expect(
      extractHeadline('Apple beat earnings. Revenue was up 12%.')
    ).toBe('Apple beat earnings.');
  });

  it('returns first sentence terminated by exclamation', () => {
    expect(extractHeadline('Apple beat! Big quarter.')).toBe('Apple beat!');
  });

  it('returns first sentence terminated by question mark', () => {
    expect(extractHeadline('Apple turning a corner? Reasons follow.')).toBe(
      'Apple turning a corner?'
    );
  });

  it('returns whole text when there is no sentence terminator', () => {
    expect(extractHeadline('A summary without punctuation')).toBe(
      'A summary without punctuation'
    );
  });

  it('truncates at exactly maxChars including ellipsis when too long', () => {
    const long = 'x'.repeat(300);
    const result = extractHeadline(long, 200);
    expect(result.length).toBe(200);
    expect(result.endsWith('…')).toBe(true);
  });

  it('does not truncate or add ellipsis when length === maxChars', () => {
    const exactly200 = 'x'.repeat(200);
    expect(extractHeadline(exactly200, 200)).toBe(exactly200);
    expect(extractHeadline(exactly200, 200).length).toBe(200);
  });

  it('does not truncate when length < maxChars', () => {
    const text = 'Apple beat.';
    expect(extractHeadline(text, 200)).toBe(text);
  });

  it('handles markdown heading + first sentence + truncation in one call', () => {
    const long =
      '### NVIDIA Corp (NVDA) 10-Q Analysis. ' + 'x'.repeat(300);
    const result = extractHeadline(long, 200);
    expect(result.startsWith('NVIDIA Corp (NVDA) 10-Q Analysis.')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('default maxChars is 200', () => {
    const long = 'x'.repeat(300);
    expect(extractHeadline(long).length).toBe(200);
  });

  it('handles empty input gracefully', () => {
    expect(extractHeadline('')).toBe('');
  });

  it('handles input that is only a heading marker', () => {
    expect(extractHeadline('###')).toBe('');
  });
});
