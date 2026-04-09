import { markdownToHtml } from '../../../../components/ui/email/design-system';

describe('markdownToHtml XSS protection', () => {
  it('escapes script tags', () => {
    const result = markdownToHtml('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes numeric entity bypass (&#60; = <)', () => {
    const result = markdownToHtml('&#60;script&#62;alert(1)&#60;/script&#62;');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('&#60;');
    // & should be escaped to &amp;, so &#60; becomes &amp;#60;
    expect(result).toContain('&amp;#60;');
  });

  it('escapes img onerror injection', () => {
    const result = markdownToHtml('<img src=x onerror=alert(1)>');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('escapes event handler attributes', () => {
    const result = markdownToHtml('<div onmouseover="alert(1)">hover</div>');
    expect(result).not.toContain('<div');
    expect(result).toContain('&lt;div');
  });

  it('returns empty string for undefined input', () => {
    expect(markdownToHtml(undefined)).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(markdownToHtml('')).toBe('');
  });

  it('renders bold markdown correctly after escaping', () => {
    const result = markdownToHtml('**important** text');
    expect(result).toContain('<strong');
    expect(result).toContain('important');
    expect(result).toContain('text');
  });

  it('renders italic markdown correctly after escaping', () => {
    const result = markdownToHtml('*emphasis* here');
    expect(result).toContain('<em');
    expect(result).toContain('emphasis');
  });

  it('renders bullet lists correctly after escaping', () => {
    const result = markdownToHtml('- item one\n- item two');
    expect(result).toContain('item one');
    expect(result).toContain('item two');
  });

  it('renders headers correctly after escaping', () => {
    const result = markdownToHtml('## Section Title');
    expect(result).toContain('Section Title');
    expect(result).toContain('font-weight');
  });

  it('handles mixed safe markdown with attempted injection', () => {
    const result = markdownToHtml('**Revenue** was $25B <script>alert("xss")</script>');
    expect(result).toContain('<strong');
    expect(result).toContain('Revenue');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('handles ampersands in normal text', () => {
    const result = markdownToHtml('AT&T reported earnings');
    expect(result).toContain('AT&amp;T');
  });
});
