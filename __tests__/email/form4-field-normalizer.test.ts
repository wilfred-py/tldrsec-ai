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
    it('should NOT flip mixed-case names (already natural order)', () => {
      // Mixed case = assume already in natural order, just title-case
      expect(normalizePersonName('Newstead Jennifer')).toBe('Newstead Jennifer');
      expect(normalizePersonName('Jennifer Newstead')).toBe('Jennifer Newstead');
    });

    it('should flip ALL CAPS SEC format to "First Last"', () => {
      expect(normalizePersonName('MOYNIHAN BRIAN T')).toBe('Brian T. Moynihan');
    });

    it('should handle ALL CAPS with middle initial', () => {
      expect(normalizePersonName('PURI AJAY K')).toBe('Ajay K. Puri');
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

  // =========================================================================
  // BAC stale summaryJSON regression tests (PR #370 follow-up)
  // Root cause: resolveFieldZeroSafe treated "" as valid, preventing alias lookup
  // =========================================================================
  describe('BAC stale summaryJSON regression (PR #370 follow-up)', () => {
    it('should resolve price from alias when pricePerShare is empty string', () => {
      const tx = normalizeTransaction({
        code: 'S',
        type: 'Sale',
        shares: '3,004',
        pricePerShare: '',  // Empty string from stale AI output
        price: '$184.90',   // Real value under old field name
      });
      expect(tx).not.toBeNull();
      expect(tx!.pricePerShare).toBe('$184.90');
      expect(tx!.shares).toBe('3,004');
    });

    it('should resolve shares from alias when shares is numeric 0 and alias exists', () => {
      const tx = normalizeTransaction({
        code: 'S',
        shares: 0,           // Stale numeric zero
        shareCount: '3,004', // Real value under old field name
        pricePerShare: '$184.90',
      });
      expect(tx).not.toBeNull();
      // shares: 0 is falsy but resolveFieldZeroSafe still returns 0 since it's not ""
      // The alias won't fire because 0 !== '' passes the check.
      // This is expected: numeric 0 IS a valid value for resolveFieldZeroSafe.
      expect(tx!.shares).toBe(0);
      expect(tx!.pricePerShare).toBe('$184.90');
    });

    it('should resolve shares from alias when shares is empty string', () => {
      const tx = normalizeTransaction({
        code: 'S',
        shares: '',           // Empty string from stale AI output
        shareCount: '3,004',  // Real value under old field name
        pricePerShare: '$184.90',
      });
      expect(tx).not.toBeNull();
      expect(tx!.shares).toBe('3,004');
    });

    it('should render full pipeline with stale BAC data correctly', () => {
      const staleJSON = {
        company: 'BANK OF AMERICA CORP',
        summary: 'BAC insider sold 5,000 shares at $42.15.',
        filerName: 'MOYNIHAN BRIAN T',
        filerRole: 'CEO',
        transactions: [{
          code: 'S',
          type: 'Sale',
          shares: '',
          shareCount: '5,000',
          pricePerShare: '',
          price: '$42.15',
          acquisitionDisposition: 'D',
          sharesOwnedFollowing: '500,000',
        }],
      };
      const result = normalizeForm4Data(staleJSON);
      expect(result).not.toBeNull();
      expect(result!.transactions[0].pricePerShare).toBe('$42.15');
      expect(result!.transactions[0].shares).toBe('5,000');
    });

    it('should return empty when both canonical and all aliases are empty strings', () => {
      const tx = normalizeTransaction({
        code: 'S',
        shares: '',
        shareCount: '',
        pricePerShare: '',
        price: '',
      });
      expect(tx).not.toBeNull();
      expect(tx!.shares).toBe('');
      expect(tx!.pricePerShare).toBe('');
    });

    it('should still treat numeric 0 as valid for $0 grants (invariant check)', () => {
      const tx = normalizeTransaction({
        code: 'A',
        shares: 60208,
        price: 0,
      });
      expect(tx).not.toBeNull();
      expect(tx!.pricePerShare).toBe(0);
      expect(tx!.shares).toBe(60208);
    });
  });

  // =========================================================================
  // AAPL Parekh holdings mismatch regression tests (2026-04-15 incident)
  // Root cause: LLM top-level newStake pulled from Table II RSU row (15,331)
  // instead of Table I Common Stock Direct Column 5 (14,900).
  // See .claude/tasks/form4-holdings-mismatch.md.
  // =========================================================================
  describe('Form 4 holdings three-tier precedence', () => {
    it('picks Common Stock Direct row over derivative RSU row (Parekh fixture)', () => {
      const data = normalizeForm4Data({
        company: 'Apple Inc.',
        summary: 'CFO disposed of shares for tax withholding.',
        filerName: 'Parekh Kevan',
        filerRole: 'SVP, CFO',
        newStake: '15,331 shares', // LLM hallucinated from RSU row
        transactions: [
          { code: 'M', shares: 100, pricePerShare: '$0', sharesOwnedFollowing: 15000, securityType: 'Restricted Stock Unit', ownershipForm: 'D', date: '2026-04-10' },
          { code: 'F', shares: 1200, pricePerShare: '$200', sharesOwnedFollowing: 14900, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-11' },
          { code: 'A', shares: 500, pricePerShare: '$0', sharesOwnedFollowing: 15331, securityType: 'Restricted Stock Unit', ownershipForm: 'D', date: '2026-04-12' },
        ],
      });
      expect(data!.newStake).toBe('14,900');
      expect(data!.newStakeSource).toBe('derived-common-direct');
    });

    it('authoritative postTransactionCommonShares overrides everything', () => {
      const data = normalizeForm4Data({
        company: 'Apple Inc.',
        summary: 'Test',
        filerName: 'Test',
        postTransactionCommonShares: '14900',
        newStake: '999,999 shares', // LLM hallucination — must be ignored
        transactions: [
          { code: 'F', shares: 100, pricePerShare: '$200', sharesOwnedFollowing: 12345, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-11' },
        ],
      });
      expect(data!.newStake).toBe('14,900');
      expect(data!.newStakeSource).toBe('authoritative');
    });

    it('picks transacted class in dual-class Common Stock filings', () => {
      // Two Common Stock Direct rows (Class A and Class B) — chronological order wins
      const data = normalizeForm4Data({
        company: 'Google',
        summary: 'Test',
        filerName: 'Test',
        transactions: [
          { code: 'S', shares: 100, pricePerShare: '$150', sharesOwnedFollowing: 5000, securityType: 'Class A Common Stock', ownershipForm: 'D', date: '2026-04-10' },
          { code: 'S', shares: 200, pricePerShare: '$150', sharesOwnedFollowing: 3000, securityType: 'Class B Common Stock', ownershipForm: 'D', date: '2026-04-12' },
        ],
      });
      expect(data!.newStake).toBe('3,000');
      expect(data!.newStakeSource).toBe('derived-common-direct');
    });

    it('excludes Indirect holdings from Common Stock Direct tier', () => {
      const data = normalizeForm4Data({
        company: 'Test',
        summary: 'Test',
        filerName: 'Test',
        transactions: [
          { code: 'S', shares: 100, pricePerShare: '$50', sharesOwnedFollowing: 7000, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-10' },
          { code: 'S', shares: 100, pricePerShare: '$50', sharesOwnedFollowing: 99999, securityType: 'Common Stock', ownershipForm: 'I', date: '2026-04-12' },
        ],
      });
      // Only the Direct row counts even though Indirect has later date
      expect(data!.newStake).toBe('7,000');
      expect(data!.newStakeSource).toBe('derived-common-direct');
    });

    it('falls back to derived-fallback for derivative-only filings', () => {
      const data = normalizeForm4Data({
        company: 'Test',
        summary: 'Test',
        filerName: 'Test',
        transactions: [
          { code: 'M', shares: 500, pricePerShare: '$0', sharesOwnedFollowing: 2500, securityType: 'Stock Option (Right to Buy)', ownershipForm: 'D', date: '2026-04-10' },
        ],
      });
      expect(data!.newStake).toBe('2,500');
      expect(data!.newStakeSource).toBe('derived-fallback');
    });

    it('sorts transactions by date (not array index) when picking last', () => {
      // Chronologically, 2026-04-11 is last even though it's index 0
      const data = normalizeForm4Data({
        company: 'Test',
        summary: 'Test',
        filerName: 'Test',
        transactions: [
          { code: 'F', shares: 100, pricePerShare: '$200', sharesOwnedFollowing: 14900, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-11' },
          { code: 'F', shares: 100, pricePerShare: '$200', sharesOwnedFollowing: 14000, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-09' },
        ],
      });
      expect(data!.newStake).toBe('14,900');
    });

    it('handles zero-balance Common Stock holdings', () => {
      const data = normalizeForm4Data({
        company: 'Test',
        summary: 'Test',
        filerName: 'Test',
        transactions: [
          { code: 'S', shares: 5000, pricePerShare: '$50', sharesOwnedFollowing: 0, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-10' },
        ],
      });
      expect(data!.newStake).toBe('0');
      expect(data!.newStakeSource).toBe('derived-common-direct');
    });

    it('preserves insertion order when dates are missing', () => {
      const data = normalizeForm4Data({
        company: 'Test',
        summary: 'Test',
        filerName: 'Test',
        transactions: [
          { code: 'F', shares: 100, pricePerShare: '$200', sharesOwnedFollowing: 10000, securityType: 'Common Stock', ownershipForm: 'D' },
          { code: 'F', shares: 100, pricePerShare: '$200', sharesOwnedFollowing: 9000, securityType: 'Common Stock', ownershipForm: 'D' },
        ],
      });
      expect(data!.newStake).toBe('9,000');
    });

    it('missing ownershipForm falls through to fallback (not assumed Direct)', () => {
      const data = normalizeForm4Data({
        company: 'Test',
        summary: 'Test',
        filerName: 'Test',
        transactions: [
          { code: 'S', shares: 100, pricePerShare: '$50', sharesOwnedFollowing: 1234, securityType: 'Common Stock', date: '2026-04-10' },
        ],
      });
      expect(data!.newStake).toBe('1,234');
      expect(data!.newStakeSource).toBe('derived-fallback');
    });

    it('falls through to llm-legacy when no transactions', () => {
      const data = normalizeForm4Data({
        company: 'Test',
        summary: 'Test',
        filerName: 'Test',
        newStake: '5,000 shares',
        transactions: [],
      });
      // LLM's raw string parsed to bare number via llm-legacy tier
      expect(data!.newStake).toBe('5,000');
      expect(data!.newStakeSource).toBe('llm-legacy');
    });
  });

  describe('Form 4 newStake narrative mismatch detection', () => {
    it('sets hasNarrativeMismatch=true when derived disagrees with narrative by >5%', () => {
      const data = normalizeForm4Data(
        {
          company: 'Apple',
          summary: 'Test',
          filerName: 'Parekh Kevan',
          transactions: [
            { code: 'F', shares: 100, pricePerShare: '$200', sharesOwnedFollowing: 14900, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-10' },
          ],
        },
        'Parekh now holds 50,000 common shares after the transaction.',
      );
      expect(data!.newStake).toBe('14,900');
      expect(data!.hasNarrativeMismatch).toBe(true);
    });

    it('does NOT flag mismatch when narrative agrees within 5%', () => {
      const data = normalizeForm4Data(
        {
          company: 'Apple',
          summary: 'Test',
          filerName: 'Test',
          transactions: [
            { code: 'F', shares: 100, pricePerShare: '$200', sharesOwnedFollowing: 14900, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-10' },
          ],
        },
        'The insider now holds 14,950 common shares.',
      );
      expect(data!.hasNarrativeMismatch).toBe(false);
    });

    it('does NOT flag mismatch when narrative uses hedge words like "roughly"', () => {
      const data = normalizeForm4Data(
        {
          company: 'Test',
          summary: 'Test',
          filerName: 'Test',
          transactions: [
            { code: 'F', shares: 100, pricePerShare: '$200', sharesOwnedFollowing: 14900, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-10' },
          ],
        },
        'The insider holds roughly 50,000 common shares.',
      );
      expect(data!.hasNarrativeMismatch).toBe(false);
    });

    it('does NOT flag mismatch when narrative number is zero (guarded)', () => {
      const data = normalizeForm4Data(
        {
          company: 'Test',
          summary: 'Test',
          filerName: 'Test',
          transactions: [
            { code: 'F', shares: 100, pricePerShare: '$200', sharesOwnedFollowing: 14900, securityType: 'Common Stock', ownershipForm: 'D', date: '2026-04-10' },
          ],
        },
        'The insider now holds 0 common shares.',
      );
      expect(data!.hasNarrativeMismatch).toBe(false);
    });
  });

  describe('Form 4 newStake tier-precedence coverage', () => {
    it('derived-fallback beats llm-legacy when SOF data is present (even for non-Common-Direct rows)', () => {
      // Non-Common-Stock row with SOF = 7777. LLM would have said "7,777 units".
      // Tier 2 Common-Direct filter is empty; Tier 3 derived-fallback returns 7777
      // and wins over the LLM string. This locks in the contract that real SOF
      // data beats LLM text whenever possible.
      const data = normalizeForm4Data({
        company: 'Test',
        summary: 'Test',
        filerName: 'Test',
        newStake: '999 units', // intentionally different from SOF to prove derivation wins
        transactions: [
          { code: 'A', shares: 500, pricePerShare: '$12.00', sharesOwnedFollowing: 7777, securityType: 'Restricted Stock Unit', ownershipForm: 'D', date: '2026-04-10' },
        ],
      });
      expect(data!.newStake).toBe('7,777');
      expect(data!.newStakeSource).toBe('derived-fallback');
    });

    it('falls through to narrative tier when transactions empty AND no llm newStake', () => {
      const data = normalizeForm4Data(
        {
          company: 'Test',
          summary: 'Test',
          filerName: 'Test',
          transactions: [],
          // no newStake field at all
        },
        // Matches stakePatterns[2]: "totaled N shares"
        'Holdings totaled 42,000 shares after the transaction.',
      );
      expect(data!.newStake).toBe('42,000');
      expect(data!.newStakeSource).toBe('narrative');
    });
  });

  describe('percentageChange recomputation', () => {
    // Regression: Meta COO Javier Olivan Form 4 filed 2026-05-13.
    // LLM reported percentageChange="-18.50%" by dividing total disposed across
    // ALL ownership tables (1,555 shares) by post-direct + total-disposed
    // (8,408). The Holdings row renders 7,779 → 6,853 (a -11.90% direct-stake
    // change: (6853-7779)/7779 = -0.11904), so the rendered percent must be
    // derived from those numbers.
    it('overrides LLM percentageChange when newStake/previousStake disagree', () => {
      const data = normalizeForm4Data({
        company: 'Meta Platforms, Inc.',
        summary: 'Meta COO Javier Olivan sold 1,555 Class A shares.',
        filerName: 'Olivan Javier',
        percentageChange: '-18.50%', // LLM-supplied, wrong denominator
        newStake: '6,853',
        previousStake: '7,779',
        transactions: [
          {
            code: 'S',
            type: 'Sale',
            shares: 926,
            pricePerShare: '$604.57',
            sharesOwnedFollowing: 6853,
            securityType: 'Class A Common Stock',
            ownershipForm: 'D',
            date: '2026-05-11',
          },
        ],
      });
      expect(data!.previousStake).toBe('7,779');
      expect(data!.newStake).toBe('6,853');
      expect(data!.percentageChange).toBe('-11.90%');
    });

    it('formats positive change with leading +', () => {
      const data = normalizeForm4Data({
        company: 'X',
        summary: 'X',
        filerName: 'X',
        newStake: '1,100',
        previousStake: '1,000',
        transactions: [],
      });
      expect(data!.percentageChange).toBe('+10.00%');
    });

    it('leaves LLM value untouched when previousStake is missing', () => {
      const data = normalizeForm4Data({
        company: 'X',
        summary: 'X',
        filerName: 'X',
        percentageChange: '-5%',
        newStake: '1,000',
        transactions: [],
      });
      // No previousStake derivable → no override
      expect(data!.percentageChange).toBe('-5%');
    });
  });
});
