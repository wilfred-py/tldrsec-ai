/**
 * Form 4 AI Schema → Template Classification Regression Tests
 *
 * These tests verify that data shaped like ACTUAL AI output (from unified-prompts.ts)
 * classifies correctly in the email template.
 *
 * Key difference from summary-quality-2026-02-18.test.ts: those tests provide `code`
 * explicitly with template-native field names. These tests use AI-schema field names
 * (e.g., `price` instead of `pricePerShare`) to catch data flow mismatches.
 */

import {
  aggregateTransactionsByType,
} from '../../components/ui/email/templates/form4-minimalist-template';
import { parseStringTransaction, parseResponse } from '../../lib/ai/parsers/response-parser';
import { generateFilingPrompt, FORM_SCHEMAS } from '../../lib/ai/prompts/unified-prompts';

// Helper: create transaction shaped like AI output (unified-prompts.ts Form 4 schema)
function aiTx(overrides: {
  code: string;
  type: string;
  shares: string;
  price: string;          // AI field name (NOT pricePerShare)
  date?: string;
  acquisitionDisposition?: string;
}) {
  return overrides;
}

describe('Form 4: AI Schema → Template Classification', () => {
  describe('code field enables correct classification', () => {
    it('should classify code A + type "Award/Grant" as award (not other)', () => {
      const transactions = [
        aiTx({ code: 'A', type: 'Award/Grant', shares: '2,500', price: '$0', acquisitionDisposition: 'A' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('award');
    });

    it('should classify code S + type "Sale" as sale', () => {
      const transactions = [
        aiTx({ code: 'S', type: 'Sale', shares: '10,000', price: '$150.50', acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('sale');
    });

    it('should classify code G + type "Gift" as gift', () => {
      const transactions = [
        aiTx({ code: 'G', type: 'Gift', shares: '5,000', price: '$0', acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('gift');
    });

    it('should classify code P + type "Purchase" as purchase', () => {
      const transactions = [
        aiTx({ code: 'P', type: 'Purchase', shares: '1,000', price: '$200', acquisitionDisposition: 'A' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('purchase');
    });

    it('should classify code M + type "Exercise" as exercise', () => {
      const transactions = [
        aiTx({ code: 'M', type: 'Exercise', shares: '5,000', price: '$25', acquisitionDisposition: 'A' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('exercise');
    });
  });

  describe('price field maps to dollar values (not $0)', () => {
    it('should compute correct totalValue from AI price field', () => {
      const transactions = [
        aiTx({ code: 'S', type: 'Sale', shares: '10,000', price: '$150', acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result[0].totalValue).toBe(1500000); // 10000 * 150
      expect(result[0].totalValue).not.toBe(0);
    });

    it('should show shares for $0 gift transactions (not misleading "$0")', () => {
      const transactions = [
        aiTx({ code: 'G', type: 'Gift', shares: '73,252', price: '$0', acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result[0].type).toBe('gift');
      expect(result[0].totalShares).toBe(73252);
      expect(result[0].totalValue).toBe(0);
    });
  });

  describe('backward compatibility: old summaryJSON with price field', () => {
    it('should handle transaction with price (no pricePerShare) from old DB records', () => {
      // Old summaryJSON stored price as "price", not "pricePerShare"
      const oldFormatTx = { code: 'S', type: 'Sale', shares: '5,000', price: '$100' };
      const result = aggregateTransactionsByType([oldFormatTx]);
      expect(result[0].type).toBe('sale');
      expect(result[0].totalValue).toBe(500000);
    });
  });

  describe('type-only fallback (no code field)', () => {
    it('should classify type "Award/Grant" as award when code is missing', () => {
      const tx = { type: 'Award/Grant', shares: '2,500', price: '$0' };
      const result = aggregateTransactionsByType([tx]);
      expect(result[0].type).toBe('award');
    });

    it('should classify type "Sale" as sale when code is missing', () => {
      const tx = { type: 'Sale', shares: '10,000', price: '$150' };
      const result = aggregateTransactionsByType([tx]);
      expect(result[0].type).toBe('sale');
    });
  });

  // =========================================================================
  // Phase 2: String transaction parsing + structural validation
  // =========================================================================

  describe('parseStringTransaction: AI string → structured object', () => {
    it('should parse "Sold 80 Common Stock shares at $412.460 (S, D)"', () => {
      const result = parseStringTransaction('Sold 80 Common Stock shares at $412.460 (S, D)');
      expect(result).not.toBeNull();
      expect(result!.code).toBe('S');
      expect(result!.type).toBe('Sale');
      expect(result!.shares).toBe('80');
      expect(result!.pricePerShare).toBe('$412.460');
      expect(result!.acquisitionDisposition).toBe('D');
    });

    it('should parse "Exercised into 40,000 Common Stock shares at $14.99 (M, A)"', () => {
      const result = parseStringTransaction('Exercised into 40,000 Common Stock shares at $14.99 (M, A)');
      expect(result).not.toBeNull();
      expect(result!.code).toBe('M');
      expect(result!.type).toBe('Exercise');
      expect(result!.shares).toBe('40,000');
      expect(result!.pricePerShare).toBe('$14.99');
      expect(result!.acquisitionDisposition).toBe('A');
    });

    it('should parse "Exercised 40,000 Non-Qualified Stock Option at $0.000 (M, D)"', () => {
      const result = parseStringTransaction('Exercised 40,000 Non-Qualified Stock Option at $0.000 (M, D)');
      expect(result).not.toBeNull();
      expect(result!.code).toBe('M');
      expect(result!.shares).toBe('40,000');
      expect(result!.pricePerShare).toBe('$0.000');
    });

    it('should parse gift transactions "(G, D)"', () => {
      const result = parseStringTransaction('Gifted 5,000 shares at $0 (G, D)');
      expect(result).not.toBeNull();
      expect(result!.code).toBe('G');
      expect(result!.type).toBe('Gift');
    });

    it('should return null for unparseable strings', () => {
      expect(parseStringTransaction('some random text')).toBeNull();
      expect(parseStringTransaction('')).toBeNull();
    });

    it('parsed string transactions should classify correctly', () => {
      const parsed = parseStringTransaction('Sold 10,000 Common Stock shares at $150 (S, D)')!;
      const result = aggregateTransactionsByType([parsed]);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('sale');
      expect(result[0].totalValue).toBe(1500000);
    });
  });

  describe('template structural validation: spread strings filtered out', () => {
    it('should classify valid structured transactions even when mixed with invalid ones', () => {
      // When a string is spread: { ...\"Sold 80 shares\" } produces {"0":"S","1":"o",...}
      // aggregateTransactionsByType gets called with whatever the template passes
      const spreadString = { '0': 'S', '1': 'o', '2': 'l', '3': 'd' } as unknown as { type?: string; code?: string; shares?: string };

      // The spread string has no type/code/shares — it should not classify as anything
      const result = aggregateTransactionsByType([spreadString]);
      // It goes to "other" because no classifier matches, but totalShares/totalValue are 0
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('other');
      expect(result[0].totalShares).toBe(0);
      expect(result[0].totalValue).toBe(0);
    });
  });

  // =========================================================================
  // Phase 3: formatSchemaDescription renders array item fields
  // =========================================================================

  describe('formatSchemaDescription: array item fields visible in prompt', () => {
    it('should include transaction field names (code, type, shares, pricePerShare) in generated prompt', () => {
      const prompt = generateFilingPrompt({
        formType: '4',
        filingContent: 'test content',
        ticker: 'TEST',
      });
      // The user prompt should contain the inner field names
      expect(prompt.userPrompt).toContain('"code"');
      expect(prompt.userPrompt).toContain('"type"');
      expect(prompt.userPrompt).toContain('"shares"');
      expect(prompt.userPrompt).toContain('"pricePerShare"');
    });

    it('should mark inner required fields as REQUIRED in the prompt', () => {
      const prompt = generateFilingPrompt({
        formType: '4',
        filingContent: 'test content',
        ticker: 'TEST',
      });
      // code, type, shares, pricePerShare are required in the items schema
      expect(prompt.userPrompt).toMatch(/"code".*REQUIRED/);
      expect(prompt.userPrompt).toMatch(/"shares".*REQUIRED/);
    });

    it('should include sharesOwnedFollowing field in generated prompt', () => {
      const prompt = generateFilingPrompt({
        formType: '4',
        filingContent: 'test content',
        ticker: 'TEST',
      });
      expect(prompt.userPrompt).toContain('"sharesOwnedFollowing"');
      expect(prompt.userPrompt).toContain('Beneficially Owned Following');
    });

    it('Form 4 schema should define sharesOwnedFollowing in transaction items', () => {
      const schema = FORM_SCHEMAS['4'];
      const txItems = schema.properties.transactions.items;
      expect(txItems?.properties).toHaveProperty('sharesOwnedFollowing');
    });
  });

  // =========================================================================
  // Phase 3: Field-name aliasing in normalizer (via parseResponse)
  // =========================================================================

  describe('normalizer: field-name aliasing for variant AI field names', () => {
    it('should map transactionCode to code', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Test summary',
        filerName: 'John Doe',
        transactions: [
          { transactionCode: 'S', shares: '1,000', pricePerShare: '$100' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const tx = (result.data as Record<string, unknown>).transactions as Record<string, unknown>[];
      expect(tx[0].code).toBe('S');
      expect(tx[0].transactionCode).toBeUndefined();
    });

    it('should map transactionType to type', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Test summary',
        filerName: 'John Doe',
        transactions: [
          { code: 'P', transactionType: 'Purchase', shares: '500', pricePerShare: '$50' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const tx = (result.data as Record<string, unknown>).transactions as Record<string, unknown>[];
      expect(tx[0].type).toBe('Purchase');
      expect(tx[0].transactionType).toBeUndefined();
    });

    it('should infer code from type when code is empty', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Test summary',
        filerName: 'John Doe',
        transactions: [
          { code: '', type: 'Sale', shares: '10,000', pricePerShare: '$150' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const tx = (result.data as Record<string, unknown>).transactions as Record<string, unknown>[];
      expect(tx[0].code).toBe('S');
    });

    it('should infer type from code when type is empty', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Test summary',
        filerName: 'John Doe',
        transactions: [
          { code: 'G', type: '', shares: '5,000', pricePerShare: '$0' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const tx = (result.data as Record<string, unknown>).transactions as Record<string, unknown>[];
      expect(tx[0].type).toBe('Gift');
    });

    it('should not overwrite existing code when transactionCode also present', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Test summary',
        filerName: 'John Doe',
        transactions: [
          { code: 'S', transactionCode: 'P', shares: '1,000', pricePerShare: '$100' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const tx = (result.data as Record<string, unknown>).transactions as Record<string, unknown>[];
      expect(tx[0].code).toBe('S'); // Original code preserved
    });

    it('aliased transactions should classify correctly downstream', () => {
      // Simulate what NVDA E2E produced: transactionCode instead of code
      const nvdaTx = { transactionCode: 'A', shares: 55558, pricePerShare: '$0' };
      const aiResponse = JSON.stringify({
        company: 'NVIDIA',
        summary: 'Stock awards',
        filerName: 'Test Person',
        transactions: [nvdaTx]
      });
      const result = parseResponse(aiResponse, '4');
      const tx = (result.data as Record<string, unknown>).transactions as Record<string, unknown>[];
      // After normalizer aliasing, aggregation should classify as award
      const classified = aggregateTransactionsByType(tx);
      expect(classified[0].type).toBe('award');
    });
  });

  // =========================================================================
  // Phase 3: Post-transaction ownership → newStake derivation
  // =========================================================================

  describe('normalizer: sharesOwnedFollowing → newStake derivation', () => {
    it('should derive newStake from last transactions sharesOwnedFollowing', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Insider sale',
        filerName: 'John Doe',
        transactions: [
          { code: 'S', type: 'Sale', shares: '10,000', pricePerShare: '$100', sharesOwnedFollowing: '90,000' },
          { code: 'S', type: 'Sale', shares: '5,000', pricePerShare: '$101', sharesOwnedFollowing: '85,000' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      expect(data.newStake).toBe('85000 shares'); // Last transaction's post-ownership
    });

    it('should not overwrite existing newStake', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Insider sale',
        filerName: 'John Doe',
        newStake: '100,000 shares',
        transactions: [
          { code: 'S', type: 'Sale', shares: '10,000', pricePerShare: '$100', sharesOwnedFollowing: '90,000' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      expect(data.newStake).toBe('100,000 shares'); // Existing value preserved
    });

    it('should skip sharesOwnedFollowing when empty/missing', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Insider sale',
        filerName: 'John Doe',
        transactions: [
          { code: 'S', type: 'Sale', shares: '10,000', pricePerShare: '$100' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      expect(data.newStake).toBeUndefined();
    });

    it('should strip bracket artifacts from sharesOwnedFollowing', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Insider award',
        filerName: 'John Doe',
        transactions: [
          { code: 'A', type: 'Award', shares: '103,278', pricePerShare: '$0', sharesOwnedFollowing: '659,729]' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      // Code A + $0 price = derivative grant → suffix is "derivative securities"
      expect(data.newStake).toBe('659729 derivative securities');
      expect(data.newStake).not.toContain(']');
    });
  });

  // =========================================================================
  // Phase 4: previousStake + percentageChange derivation
  // =========================================================================

  describe('normalizer: previousStake derivation from transactions', () => {
    it('should derive previousStake for a sale (disposition)', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Insider sale',
        filerName: 'John Doe',
        transactions: [
          { code: 'S', type: 'Sale', shares: '10,000', pricePerShare: '$100', acquisitionDisposition: 'D', sharesOwnedFollowing: '90,000' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      expect(data.previousStake).toBe('100000 shares'); // 90000 + 10000
      expect(data.newStake).toBe('90000 shares');
    });

    it('should derive previousStake for an award (acquisition)', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Stock award',
        filerName: 'John Doe',
        transactions: [
          { code: 'A', type: 'Award', shares: '50,000', pricePerShare: '$0', acquisitionDisposition: 'A', sharesOwnedFollowing: '150,000' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      // Code A + $0 price = derivative grant → suffix matches newStake
      expect(data.previousStake).toBe('100000 derivative securities'); // 150000 - 50000
      expect(data.newStake).toBe('150000 derivative securities');
    });

    it('should derive previousStake for sale inferred from code S', () => {
      // No explicit acquisitionDisposition, but code S implies disposition
      const aiResponse = JSON.stringify({
        company: 'Coca-Cola',
        summary: 'Insider sale',
        filerName: 'Jane Smith',
        transactions: [
          { code: 'S', type: 'Sale', shares: '5,000', pricePerShare: '$60', sharesOwnedFollowing: '223,330' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      expect(data.previousStake).toBe('228330 shares'); // 223330 + 5000
    });

    it('should derive percentageChange from previousStake and newStake', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Insider sale',
        filerName: 'John Doe',
        transactions: [
          { code: 'S', type: 'Sale', shares: '10,000', pricePerShare: '$100', acquisitionDisposition: 'D', sharesOwnedFollowing: '90,000' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      expect(data.percentageChange).toBe('-10.00%'); // (90000 - 100000) / 100000 = -10%
    });

    it('should show positive percentageChange for acquisitions', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Stock award',
        filerName: 'John Doe',
        transactions: [
          { code: 'A', type: 'Award', shares: '50,000', pricePerShare: '$0', acquisitionDisposition: 'A', sharesOwnedFollowing: '150,000' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      expect(data.percentageChange).toBe('50.00%'); // (150000 - 100000) / 100000 = +50%
    });

    it('should not derive previousStake when already set', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Insider sale',
        filerName: 'John Doe',
        previousStake: '200,000 shares',
        transactions: [
          { code: 'S', type: 'Sale', shares: '10,000', pricePerShare: '$100', acquisitionDisposition: 'D', sharesOwnedFollowing: '90,000' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      expect(data.previousStake).toBe('200,000 shares');
    });

    it('should use first tx for previousStake with multiple transactions', () => {
      const aiResponse = JSON.stringify({
        company: 'Tesla',
        summary: 'Multiple insider transactions',
        filerName: 'Elon Musk',
        transactions: [
          { code: 'M', type: 'Exercise', shares: '10,000', pricePerShare: '$25', acquisitionDisposition: 'A', sharesOwnedFollowing: '110,000' },
          { code: 'S', type: 'Sale', shares: '5,000', pricePerShare: '$250', acquisitionDisposition: 'D', sharesOwnedFollowing: '105,000' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const data = result.data as Record<string, unknown>;
      // First tx: Exercise (acquisition), shares=10000, after=110000 → before = 110000 - 10000 = 100000
      expect(data.previousStake).toBe('100000 shares');
      // Last tx: after=105000
      expect(data.newStake).toBe('105000 shares');
      // Change: (105000 - 100000) / 100000 = +5%
      expect(data.percentageChange).toBe('5.00%');
    });
  });

  // =========================================================================
  // Phase 4: Bracket artifact cleanup
  // =========================================================================

  describe('normalizer: bracket artifact cleanup', () => {
    it('should strip brackets from code field', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Test',
        filerName: 'John Doe',
        transactions: [
          { code: 'A]', type: 'Award', shares: '100', pricePerShare: '$0' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const tx = (result.data as Record<string, unknown>).transactions as Record<string, unknown>[];
      expect(tx[0].code).toBe('A');
    });

    it('should strip brackets from shares field', () => {
      const aiResponse = JSON.stringify({
        company: 'Test Corp',
        summary: 'Test',
        filerName: 'John Doe',
        transactions: [
          { code: 'S', type: 'Sale', shares: '[10,000]', pricePerShare: '$100' }
        ]
      });
      const result = parseResponse(aiResponse, '4');
      const tx = (result.data as Record<string, unknown>).transactions as Record<string, unknown>[];
      expect(tx[0].shares).toBe('10,000');
    });
  });
});
