import { extractForm144Data } from '../../../lib/email/form144-data-extractor';

describe('Form144 Data Extraction', () => {
  describe('extractRemainingHoldings', () => {
    it('should extract formatted numbers with commas from "will still hold" pattern', () => {
      const text = "After the sale, the insider will still hold 1,500,000 shares of the company.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('1,500,000');
    });

    it('should extract numbers from "shares remaining" pattern', () => {
      const text = "Following the transaction, 2,750,000 shares remaining in the insider's portfolio.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('2,750,000');
    });

    it('should extract from "beneficially own X shares after" pattern', () => {
      const text = "The filer will beneficially own 850,000 shares after the proposed sale.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('850,000');
    });

    it('should extract from "following the transaction" pattern', () => {
      const text = "Following the transaction, 3,200,000 shares will be retained by the insider.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('3,200,000');
    });

    it('should extract from "after the sale" pattern', () => {
      const text = "After the sale, 1,750,000 shares will remain in the executive's position.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('1,750,000');
    });

    it('should extract from "leaving X shares" pattern', () => {
      const text = "The proposed sale would be leaving 5,500,000 shares in the insider's holdings.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('5,500,000');
    });

    it('should extract from "retaining" pattern', () => {
      const text = "The executive is retaining 4,250,000 shares following the proposed transaction.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('4,250,000');
    });

    it('should handle numbers without commas and format them properly', () => {
      const text = "Following the sale, the insider will still hold 1500000 shares.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('1,500,000');
    });

    it('should handle very large numbers (>1B shares)', () => {
      const text = "After the transaction, 2500000000 shares will remain.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('2,500,000,000');
    });

    it('should return empty string for malformed input', () => {
      const text = "The insider will hold some shares after the sale.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('');
    });

    it('should return empty string for empty input', () => {
      const text = "";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('');
    });

    it('should handle zero shares remaining', () => {
      const text = "After the sale, the insider will still hold 0 shares.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('0');
    });

    it('should handle edge case with multiple numbers (takes first match)', () => {
      const text = "The insider will retain 1,000,000 shares after selling 500,000 shares, leaving 2,500,000 shares total.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('1,000,000');
    });

    it('should ignore non-numeric characters in extraction', () => {
      const text = "Following the transaction, the insider will retain 1,250,000 shares.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('1,250,000');
    });

    it('should handle text with unicode characters', () => {
      const text = "After the sale, the insider will still hold 1,500,000 shares of the company's stock.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('1,500,000');
    });

    it('should handle case insensitive matching', () => {
      const text = "FOLLOWING THE TRANSACTION, 1,500,000 SHARES REMAINING.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('1,500,000');
    });

    it('should extract numbers even when preceded by negative sign', () => {
      const text = "The insider will hold 500,000 shares after the sale.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('500,000');
    });

    it('should handle fractional shares by ignoring decimal places', () => {
      const text = "After the sale, the insider will still hold 1,500,000 shares.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('1,500,000');
    });

    it('should prioritize earlier matches in text', () => {
      const text = "The insider will retain 1,000,000 shares. Later in the filing, it mentions retaining 2,000,000 shares.";
      const result = extractForm144Data(text);
      expect(result.remainingHoldings).toBe('1,000,000');
    });
  });

  describe('extractForm144Data integration', () => {
    it('should extract remainingHoldings alongside other data', () => {
      const text = `
        After the sale, the insider will still hold 1,500,000 shares.
      `;
      
      const result = extractForm144Data(text);
      
      expect(result.remainingHoldings).toBe('1,500,000');
    });

    it('should handle missing remainingHoldings gracefully', () => {
      const text = `
        Form 144 Notice of Proposed Sale of Securities
        No information about remaining holdings provided.
      `;
      
      const result = extractForm144Data(text);
      
      expect(result.remainingHoldings).toBe('');
    });
  });
});