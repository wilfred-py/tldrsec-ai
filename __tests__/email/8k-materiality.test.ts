import { isMaterialFiling } from '@/components/ui/email/templates/8k-minimalist-template';

describe('8-K Materiality Classification', () => {
  describe('Dollar-amount awareness', () => {
    it('should classify as material when summary mentions $1B+ amount', () => {
      const result = isMaterialFiling(
        ['8.01'],
        'The company completed a strategic transaction valued at $1,200,000,000.'
      );
      expect(result).toBe(true);
    });

    it('should classify as material when summary mentions "$X billion"', () => {
      const result = isMaterialFiling(
        ['9.01'],
        'Vertiv shelled out $1.85 billion for a data center equipment maker.'
      );
      expect(result).toBe(true);
    });

    it('should classify as material for $500M+ transactions', () => {
      const result = isMaterialFiling(
        ['8.01'],
        'The deal is valued at approximately $750 million.'
      );
      expect(result).toBe(true);
    });

    it('should NOT classify as material for small dollar amounts under $100M', () => {
      const result = isMaterialFiling(
        ['9.01'],
        'The company entered a $5 million supply agreement.'
      );
      expect(result).toBe(false);
    });

    it('should still classify as material by keyword regardless of amount', () => {
      const result = isMaterialFiling(
        ['5.02'],
        'The CEO announced departure effective immediately.'
      );
      expect(result).toBe(true);
    });

    // Comprehensive edge cases (Review Decision #7)
    it('should classify as material for $1.2B shorthand', () => {
      const result = isMaterialFiling(['8.01'], 'The acquisition was valued at $1.2B.');
      expect(result).toBe(true);
    });

    it('should classify as material for $500M shorthand', () => {
      const result = isMaterialFiling(['8.01'], 'Total consideration of $500M in cash.');
      expect(result).toBe(true);
    });

    it('should classify as material for lowercase $750m shorthand', () => {
      const result = isMaterialFiling(['8.01'], 'Deal valued at $750m.');
      expect(result).toBe(true);
    });

    it('should NOT classify as material for $499M (below threshold)', () => {
      const result = isMaterialFiling(['8.01'], 'The contract is worth $499M.');
      expect(result).toBe(false);
    });

    it('should classify as material for "$1,200 million" notation', () => {
      const result = isMaterialFiling(['8.01'], 'Revenue of $1,200 million.');
      expect(result).toBe(true);
    });

    it('should classify as material for losses ("loss of $2 billion")', () => {
      const result = isMaterialFiling(['8.01'], 'The company reported a loss of $2 billion.');
      expect(result).toBe(true);
    });
  });
});
