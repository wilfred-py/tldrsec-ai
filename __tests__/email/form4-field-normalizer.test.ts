/**
 * Form 4 Field Normalizer Tests
 *
 * Regression tests for the 6 bugs found in the Form 4 template audit:
 * Bug 1: price:0 not aliased to pricePerShare (falsy check)
 * Bug 2: action not aliased to type
 * Bug 3: sharesOwnedFollowing missing from AI output
 * Bug 4: filerRole/relationship field name mismatch
 * Bug 5: filerName showing "Insider" despite being present
 * Bug 6: Character-indexed transaction objects from string spread
 */

import {
  normalizeTransaction,
  normalizeForm4Data,
  parseStringTransaction,
  isCharacterIndexedObject,
  reconstructFromCharIndexed,
  normalizePersonName,
  truncateWithEllipsis,
  NormalizedTransaction,
} from '../../lib/email/form4-field-normalizer';

describe('Form 4 Field Normalizer', () => {
  describe('normalizeTransaction', () => {
    // Bug 1: price:0 must be aliased to pricePerShare
    it('should alias price:0 to pricePerShare (zero is valid for grants)', () => {
      const tx = normalizeTransaction({
        code: 'A',
        shares: 60208,
        price: 0,
      });
      expect(tx).not.toBeNull();
      expect(tx!.pricePerShare).toBe(0);
      expect(tx!.code).toBe('A');
    });

    it('should alias price:$250.12 to pricePerShare', () => {
      const tx = normalizeTransaction({
        code: 'F',
        shares: 32528,
        price: '$250.12',
      });
      expect(tx).not.toBeNull();
      expect(tx!.pricePerShare).toBe('$250.12');
    });

    it('should not overwrite existing pricePerShare with price alias', () => {
      const tx = normalizeTransaction({
        code: 'S',
        shares: 100,
        pricePerShare: '$50.00',
        price: '$49.99', // Should be ignored
      });
      expect(tx!.pricePerShare).toBe('$50.00');
    });

    // Bug 2: action must be aliased to type
    it('should alias action to type', () => {
      const tx = normalizeTransaction({
        code: 'M',
        shares: 60208,
        action: 'Acquired',
      });
      expect(tx).not.toBeNull();
      // action is resolved as type via alias chain
      expect(tx!.type).toBe('Acquired');
      expect(tx!.code).toBe('M');
    });

    it('should infer type from code when action is not present', () => {
      const tx = normalizeTransaction({
        code: 'M',
        shares: 60208,
      });
      expect(tx).not.toBeNull();
      expect(tx!.type).toBe('Exercise');
    });

    it('should alias transactionCode to code', () => {
      const tx = normalizeTransaction({
        transactionCode: 'S',
        shares: 100,
        pricePerShare: '$50',
      });
      expect(tx!.code).toBe('S');
      expect(tx!.type).toBe('Sale');
    });

    it('should infer code from type keyword', () => {
      const tx = normalizeTransaction({
        type: 'Sale',
        shares: 100,
      });
      expect(tx!.code).toBe('S');
    });

    it('should infer type from code', () => {
      const tx = normalizeTransaction({
        code: 'G',
        shares: 500,
      });
      expect(tx!.type).toBe('Gift');
    });

    // Bug 6: Character-indexed objects must be detected and rejected
    it('should reject character-indexed objects from string spread bug', () => {
      const charIndexed = {
        '0': 'S', '1': 'o', '2': 'l', '3': 'd', '4': ' ',
        '5': '3', '6': ',', '7': '0', '8': '0', '9': '4',
      };
      const tx = normalizeTransaction(charIndexed);
      expect(tx).toBeNull();
    });

    it('should return null for empty objects', () => {
      expect(normalizeTransaction({})).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(normalizeTransaction(null)).toBeNull();
      expect(normalizeTransaction(undefined)).toBeNull();
    });

    it('should strip bracket artifacts from shares field', () => {
      const tx = normalizeTransaction({
        code: 'S',
        shares: '[10,000]',
        pricePerShare: '$50',
      });
      expect(tx!.shares).toBe('10,000');
    });

    it('should handle sharesOwnedFollowing when present', () => {
      const tx = normalizeTransaction({
        code: 'S',
        shares: 100,
        pricePerShare: '$50',
        sharesOwnedFollowing: 14788,
      });
      expect(tx!.sharesOwnedFollowing).toBe(14788);
    });

    it('should resolve sharesOwnedFollowing from aliases', () => {
      const tx = normalizeTransaction({
        code: 'S',
        shares: 100,
        remainingShares: 14788,
      });
      expect(tx!.sharesOwnedFollowing).toBe(14788);
    });
  });

  describe('isCharacterIndexedObject', () => {
    it('should detect character-indexed objects', () => {
      expect(isCharacterIndexedObject({
        '0': 'S', '1': 'o', '2': 'l', '3': 'd',
      })).toBe(true);
    });

    it('should not flag normal transaction objects', () => {
      expect(isCharacterIndexedObject({
        code: 'S', shares: 100, pricePerShare: '$50',
      })).toBe(false);
    });

    it('should not flag arrays or primitives', () => {
      expect(isCharacterIndexedObject([])).toBe(false);
      expect(isCharacterIndexedObject('hello')).toBe(false);
      expect(isCharacterIndexedObject(null)).toBe(false);
    });
  });

  describe('reconstructFromCharIndexed', () => {
    it('should reconstruct the original string', () => {
      const obj = { '0': 'S', '1': 'o', '2': 'l', '3': 'd' };
      expect(reconstructFromCharIndexed(obj)).toBe('Sold');
    });
  });

  describe('parseStringTransaction', () => {
    it('should parse short format: "Sold 80 shares at $412.46 (S, D)"', () => {
      const tx = parseStringTransaction('Sold 80 Common Stock shares at $412.460 (S, D)');
      expect(tx).not.toBeNull();
      expect(tx!.code).toBe('S');
      expect(tx!.shares).toBe('80');
      expect(tx!.pricePerShare).toBe('$412.460');
      expect(tx!.acquisitionDisposition).toBe('D');
    });

    it('should parse verbose format: "(Code: S, Disposition)"', () => {
      const tx = parseStringTransaction(
        'Sold 3,004 shares of Common stock at $184.90 per share on 2026-03-13 (Code: S, Disposition)'
      );
      expect(tx).not.toBeNull();
      expect(tx!.code).toBe('S');
      expect(tx!.shares).toBe('3,004');
      expect(tx!.pricePerShare).toBe('$184.90');
      expect(tx!.acquisitionDisposition).toBe('D');
    });

    it('should handle format with "Acquisition" keyword', () => {
      const tx = parseStringTransaction(
        'Acquired 18,082 Common Stock shares at $0.00 via derivative exercise (code M) on 2026-03-15 (M, Acquisition)'
      );
      expect(tx).not.toBeNull();
      expect(tx!.code).toBe('M');
      expect(tx!.acquisitionDisposition).toBe('A');
    });

    it('should return null for empty strings', () => {
      expect(parseStringTransaction('')).toBeNull();
      expect(parseStringTransaction(null as unknown as string)).toBeNull();
    });

    it('should extract shares from RSU format', () => {
      const tx = parseStringTransaction('Acquired 47,048 RSU at $0 (A, A)');
      expect(tx).not.toBeNull();
      expect(tx!.shares).toBe('47,048');
    });
  });

  describe('normalizeForm4Data', () => {
    // Bug 4: filerRole must be resolved from both 'filerRole' and 'relationship'
    it('should resolve filerRole from filerRole field', () => {
      const data = normalizeForm4Data({
        company: 'Apple Inc.',
        summary: 'Test summary',
        filerName: 'Newstead Jennifer',
        filerRole: 'SVP, GC and Secretary',
        transactions: [],
      });
      expect(data!.filerRole).toBe('SVP, GC and Secretary');
    });

    it('should resolve filerRole from relationship field (alias)', () => {
      const data = normalizeForm4Data({
        company: 'Apple Inc.',
        summary: 'Test summary',
        filerName: 'Newstead Jennifer',
        relationship: 'Director',
        transactions: [],
      });
      expect(data!.filerRole).toBe('Director');
    });

    // Bug 5: filerName must be resolved when present
    it('should resolve filerName when present in summaryJSON', () => {
      const data = normalizeForm4Data({
        company: 'Apple Inc.',
        summary: 'Test',
        filerName: 'Newstead Jennifer',
        transactions: [],
      });
      expect(data!.filerName).toBe('Newstead Jennifer');
      expect(data!.filerName).not.toBe('Insider');
    });

    it('should resolve filerName from reportingPerson alias', () => {
      const data = normalizeForm4Data({
        company: 'Test Corp',
        summary: 'Test',
        reportingPerson: 'Smith John',
        transactions: [],
      });
      expect(data!.filerName).toBe('Smith John');
    });

    it('should return null for null/undefined input', () => {
      expect(normalizeForm4Data(null)).toBeNull();
      expect(normalizeForm4Data(undefined)).toBeNull();
    });

    it('should normalize transactions with non-standard field names', () => {
      const data = normalizeForm4Data({
        company: 'Apple Inc.',
        summary: 'Test',
        filerName: 'Test Person',
        transactions: [
          { code: 'M', price: 0, table: 'I', action: 'Acquired', shares: 60208, security: 'Common Stock' },
          { code: 'F', price: '$250.12', table: 'I', action: 'Disposed', shares: 32528, security: 'Common Stock' },
        ],
      });
      expect(data!.transactions.length).toBe(2);
      expect(data!.transactions[0].pricePerShare).toBe(0); // Bug 1 fix: price:0 aliased
      expect(data!.transactions[0].code).toBe('M');
      expect(data!.transactions[1].pricePerShare).toBe('$250.12');
    });

    it('should filter out character-indexed transactions', () => {
      const data = normalizeForm4Data({
        company: 'NVIDIA CORP',
        summary: 'Test',
        filerName: 'Dabiri John',
        transactions: [
          { '0': 'S', '1': 'o', '2': 'l', '3': 'd', '4': ' ', '5': '3' },
        ],
      });
      expect(data!.transactions.length).toBe(0);
    });

    it('should handle string transactions in array', () => {
      const data = normalizeForm4Data({
        company: 'Test Corp',
        summary: 'Test',
        filerName: 'Test Person',
        transactions: [
          'Sold 3,004 shares of Common stock at $184.90 per share (S, D)',
        ],
      });
      expect(data!.transactions.length).toBe(1);
      expect(data!.transactions[0].code).toBe('S');
      expect(data!.transactions[0].shares).toBe('3,004');
    });

    it('should derive newStake from last transaction sharesOwnedFollowing', () => {
      const data = normalizeForm4Data({
        company: 'Test',
        summary: 'Test',
        filerName: 'Test',
        transactions: [
          { code: 'S', shares: 100, pricePerShare: '$50', sharesOwnedFollowing: 900 },
        ],
      });
      expect(data!.newStake).toBe('900');
    });
  });

  describe('normalizePersonName', () => {
    it('should flip "Last First" to "First Last"', () => {
      expect(normalizePersonName('Newstead Jennifer')).toBe('Jennifer Newstead');
    });

    it('should handle ALL CAPS SEC format', () => {
      expect(normalizePersonName('MOYNIHAN BRIAN T')).toBe('Brian T. Moynihan');
    });

    it('should handle middle initial', () => {
      expect(normalizePersonName('Puri Ajay K')).toBe('Ajay K. Puri');
    });

    it('should preserve entity names', () => {
      const result = normalizePersonName('BANK OF AMERICA CORP /DE/');
      expect(result).toContain('Bank');
      // Entity names get title-cased including the designator
      expect(result).toMatch(/\/[Dd][Ee]\//);
    });

    it('should handle empty/null input', () => {
      expect(normalizePersonName('')).toBe('');
      expect(normalizePersonName(null as unknown as string)).toBe('');
    });

    it('should handle single word names', () => {
      expect(normalizePersonName('MADONNA')).toBe('Madonna');
    });
  });

  describe('truncateWithEllipsis', () => {
    it('should truncate long strings', () => {
      expect(truncateWithEllipsis('EVP, Worldwide Field Operations', 30)).toBe('EVP, Worldwide Field Operatio\u2026');
    });

    it('should not truncate short strings', () => {
      expect(truncateWithEllipsis('Director', 30)).toBe('Director');
    });

    it('should handle empty strings', () => {
      expect(truncateWithEllipsis('', 30)).toBe('');
    });
  });
});
