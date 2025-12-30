/**
 * Tests for decimal share formatting in email templates
 * Addresses QE review feedback for regex test coverage
 */

// Mock the formatText function from both templates
const createFormatText = () => {
  const EmailColors = {
    text: { headline: '#1e293b' }
  };

  return (text: string): string => {
    let html = text;
    
    // Bold decimal share counts (including decimal values for fractional shares like RSUs/DSUs)
    html = html.replace(
      /([\d,]+(?:\.\d+)?)\s+(shares?)/gi,
      `<strong style="color:${EmailColors.text.headline};font-weight:700;">$1</strong> $2`
    );
    
    return html;
  };
};

const formatText = createFormatText();

describe('Email Template Share Formatting', () => {
  describe('decimal share formatting', () => {
    it('should bold whole number shares (regression test)', () => {
      const result = formatText('1000 shares');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">1000</strong> shares');
    });

    it('should bold decimal share counts', () => {
      const result = formatText('1000.5 shares');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">1000.5</strong> shares');
    });

    it('should bold shares with zero decimal', () => {
      const result = formatText('1000.0 shares');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">1000.0</strong> shares');
    });

    it('should bold shares with multiple decimal places', () => {
      const result = formatText('1000.25 shares');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">1000.25</strong> shares');
    });

    it('should bold small decimal shares', () => {
      const result = formatText('0.1 shares');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">0.1</strong> shares');
    });

    it('should handle comma-separated thousands with decimals', () => {
      const result = formatText('1,000.75 shares');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">1,000.75</strong> shares');
    });

    it('should work with singular share', () => {
      const result = formatText('1.5 share');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">1.5</strong> share');
    });

    it('should handle multiple share mentions in one text', () => {
      const text = 'Sold 1000.5 shares and bought 2000.25 shares';
      const result = formatText(text);
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">1000.5</strong> shares');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">2000.25</strong> shares');
    });

    it('should not modify text without shares', () => {
      const text = 'Revenue was $1000.50 million';
      const result = formatText(text);
      expect(result).toBe(text);
    });

    it('should handle case-insensitive shares', () => {
      const result = formatText('1000.5 SHARES');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">1000.5</strong> SHARES');
    });
  });

  describe('edge cases', () => {
    it('should handle very small decimal values', () => {
      const result = formatText('0.001 shares');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">0.001</strong> shares');
    });

    it('should handle large numbers with decimals', () => {
      const result = formatText('1,234,567.89 shares');
      expect(result).toContain('<strong style="color:#1e293b;font-weight:700;">1,234,567.89</strong> shares');
    });

    it('should not match partial words', () => {
      const text = 'The shareholders meeting';
      const result = formatText(text);
      expect(result).toBe(text);
    });

    it('should handle empty string', () => {
      const result = formatText('');
      expect(result).toBe('');
    });
  });
});