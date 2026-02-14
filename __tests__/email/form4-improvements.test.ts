import { extractForm4Data } from '@/lib/email/form4-data-extractor';

describe('Form 4 Improved Extraction', () => {
  describe('Filer name extraction - expanded patterns', () => {
    it('should extract name from "filed by FIRSTNAME LASTNAME" format', () => {
      const result = extractForm4Data('Form 4 filed by VAIBHAV TANEJA for Tesla Inc.');
      expect(result.filerName).toBe('Vaibhav Taneja');
    });

    it('should extract name from summaryJSON filerName field reference', () => {
      const result = extractForm4Data('Vaibhav Taneja, Chief Financial Officer, reported transactions.');
      expect(result.filerName).toBe('Vaibhav Taneja');
    });

    it('should extract name when followed by comma and role', () => {
      const result = extractForm4Data('A Form 4 was filed by Elon Musk, CEO of Tesla.');
      expect(result.filerName).toBe('Elon Musk');
    });

    it('should handle ALL CAPS names', () => {
      const result = extractForm4Data('**Reporting Person**: JOHN DOE');
      expect(result.filerName).toBe('John Doe');
    });

    it('should handle names with middle initials', () => {
      const result = extractForm4Data('**Filer**: Mary J. Smith');
      expect(result.filerName).toBe('Mary J. Smith');
    });

    it('should handle hyphenated last names', () => {
      const result = extractForm4Data('**Reporting Person**: Sarah Johnson-Williams');
      expect(result.filerName).toBe('Sarah Johnson-Williams');
    });
  });

  describe('Multi-transaction extraction', () => {
    it('should extract both sale and gift from combined summary', () => {
      const text = `
        Vaibhav Taneja sold 56,820 shares at $450.66, fetching $25.6 million.
        Additionally, four gift transactions totaling 73,252 shares at $0 per share.
      `;
      const result = extractForm4Data(text);

      const saleTransactions = result.transactions.filter(t =>
        t.type.toLowerCase().includes('sale')
      );
      const giftTransactions = result.transactions.filter(t =>
        t.type.toLowerCase().includes('gift')
      );

      expect(saleTransactions.length).toBeGreaterThanOrEqual(1);
      expect(giftTransactions.length).toBeGreaterThanOrEqual(1);
    });

    it('should not double-count gift as transfer', () => {
      const text = 'Gift of 10,000 shares to family trust at $0.';
      const result = extractForm4Data(text);
      expect(result.transactions.length).toBe(1);
    });
  });

  describe('Share count display', () => {
    it('should always populate shares field for sale transactions', () => {
      const text = 'The insider sold 56,820 shares at $450.66 weighted average.';
      const result = extractForm4Data(text);
      expect(result.transactions[0].shares).toBeTruthy();
      expect(parseInt(result.transactions[0].shares.replace(/,/g, ''))).toBeGreaterThan(0);
    });

    it('should populate shares field for gift transactions', () => {
      const text = 'Gift transactions totaling 73,252 shares.';
      const result = extractForm4Data(text);
      expect(result.transactions[0].shares).toBeTruthy();
    });
  });

  // Empty/no-match/partial-match tests (Review Decision #12)
  describe('Graceful degradation', () => {
    it('should return default empty state for empty string', () => {
      const result = extractForm4Data('');
      expect(result.filerName).toBe('');
      expect(result.transactions).toEqual([]);
    });

    it('should return default state for unrecognizable text', () => {
      const result = extractForm4Data('This is random text with no recognizable patterns.');
      expect(result.filerName).toBe('');
      expect(result.transactions).toEqual([]);
    });

    it('should extract name but no transactions when only name is present', () => {
      const result = extractForm4Data('**Reporting Person**: John Smith filed a form.');
      expect(result.filerName).toBeTruthy();
      expect(result.transactions).toEqual([]);
    });

    it('should extract transaction but no name when only transaction is present', () => {
      const result = extractForm4Data('An insider sold 10,000 shares at $50.');
      expect(result.filerName).toBe('');
      expect(result.transactions.length).toBeGreaterThan(0);
    });
  });
});
