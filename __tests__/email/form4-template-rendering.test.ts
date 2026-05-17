/**
 * Form 4 Template Rendering Tests
 *
 * Tests for trust transfer color coding and visual representation
 * in Form 4 email templates.
 */

import * as React from 'react';

// Import the helper functions we need to test
// Note: These will need to be exported from the template file
import {
  isTransferTransaction,
  getTransactionTypeConfig,
  isGiftTransaction,
  isPurchaseTransaction,
  getOwnershipBreakdown,
} from '../../components/ui/email/templates/form4-minimalist-template';

describe('Form 4 Template Transfer Rendering', () => {
  describe('Transaction Type Configuration', () => {
    it('should render trust transfers with blue color coding', () => {
      const config = getTransactionTypeConfig('Trust Transfer');

      expect(config.color).toBe('#3B82F6'); // Blue
      expect(config.icon).toBe('🔄');
      expect(config.label).toBe('Transfer');
    });

    it('should render family transfers with blue color coding', () => {
      const config = getTransactionTypeConfig('Family Transfer');

      expect(config.color).toBe('#3B82F6'); // Blue
      expect(config.icon).toBe('🔄');
      expect(config.label).toBe('Transfer');
    });

    it('should handle transfer type variations', () => {
      const variations = [
        'trust transfer',
        'TRUST TRANSFER',
        'Trust Transfer',
        'transfer to trust',
        'Transfer',
      ];

      for (const type of variations) {
        const config = getTransactionTypeConfig(type);
        expect(config.label).toBe('Transfer');
        expect(config.color).toBe('#3B82F6');
      }
    });
  });

  describe('Transaction Type Detection', () => {
    it('should identify transfer transactions correctly', () => {
      const transferTx = { type: 'Trust Transfer' };
      const familyTransferTx = { type: 'Family Transfer' };
      const saleTx = { type: 'Sale' };

      expect(isTransferTransaction(transferTx)).toBe(true);
      expect(isTransferTransaction(familyTransferTx)).toBe(true);
      expect(isTransferTransaction(saleTx)).toBe(false);
    });

    it('should not categorize trust transfers as purchases', () => {
      const transferTransaction = { type: 'Trust Transfer' };

      expect(isGiftTransaction(transferTransaction)).toBe(false);
      expect(isPurchaseTransaction(transferTransaction)).toBe(false);
    });

    it('should not categorize trust transfers as gifts', () => {
      // Even though transfers may be at $0, they are not gifts
      const transferTransaction = {
        type: 'Trust Transfer',
        pricePerShare: '$0',
        acquisitionDisposition: 'D',
      };

      expect(isGiftTransaction(transferTransaction)).toBe(false);
    });
  });

  describe('Color Differentiation', () => {
    it('should have distinct colors for all transaction types', () => {
      const purchaseConfig = getTransactionTypeConfig('Purchase');
      const saleConfig = getTransactionTypeConfig('Sale');
      const giftConfig = getTransactionTypeConfig('Gift');
      const transferConfig = getTransactionTypeConfig('Trust Transfer');

      // All colors should be different
      const colors = [
        purchaseConfig.color,
        saleConfig.color,
        giftConfig.color,
        transferConfig.color,
      ];
      const uniqueColors = new Set(colors);

      expect(uniqueColors.size).toBe(4);
    });

    it('should use consistent blue palette for transfers', () => {
      const trustTransfer = getTransactionTypeConfig('Trust Transfer');
      const familyTransfer = getTransactionTypeConfig('Family Transfer');
      const genericTransfer = getTransactionTypeConfig('Transfer');

      // All transfer types should use blue
      expect(trustTransfer.color).toBe('#3B82F6');
      expect(familyTransfer.color).toBe('#3B82F6');
      expect(genericTransfer.color).toBe('#3B82F6');
    });
  });

  describe('Background Color Accessibility', () => {
    it('should have accessible background colors for transfers', () => {
      const config = getTransactionTypeConfig('Trust Transfer');

      // Background should be light blue
      expect(config.bgColor).toBe('#EBF8FF');

      // Text color should contrast well with background
      expect(config.textColor).toBe('#1E40AF');
    });
  });

  describe('Icon Consistency', () => {
    it('should use rotation icon for transfers', () => {
      const trustTransfer = getTransactionTypeConfig('Trust Transfer');
      const familyTransfer = getTransactionTypeConfig('Family Transfer');

      // All transfers should use the rotation/cycle icon
      expect(trustTransfer.icon).toBe('🔄');
      expect(familyTransfer.icon).toBe('🔄');
    });

    it('should differentiate icons by transaction type', () => {
      const purchase = getTransactionTypeConfig('Purchase');
      const sale = getTransactionTypeConfig('Sale');
      const gift = getTransactionTypeConfig('Gift');
      const transfer = getTransactionTypeConfig('Trust Transfer');

      // All icons should be different
      expect(purchase.icon).not.toBe(transfer.icon);
      expect(sale.icon).not.toBe(transfer.icon);
      expect(gift.icon).not.toBe(transfer.icon);
    });
  });
});

/**
 * Render-order block — locks in the new lead-with-headline layout contract for
 * Form 4: logo → headline → ticker line → badge cluster (form + signal pills)
 * → body. If anyone reverts to the old "ticker first, headline buried in body"
 * layout, these assertions fail loudly.
 */
describe('Form 4 render order (post-restructure)', () => {
  // We import inside describe to avoid pulling React/render at module load
  // time when the utility-only tests above run in isolation.
  const { render } = require('@testing-library/react') as typeof import('@testing-library/react');
  const { Form4MinimalistTemplate } = require('../../components/ui/email/templates/form4-minimalist-template') as typeof import('../../components/ui/email/templates/form4-minimalist-template');

  const baseFiling = {
    companyName: 'Apple Inc.',
    symbol: 'AAPL',
    filingType: '4',
    filingDate: '2026-01-15',
    filingUrl: 'https://www.sec.gov/example',
    summaryText: 'Insider transaction.',
    summaryData: {
      headline: 'Tim Cook sold 50,000 AAPL shares',
      filerName: 'Tim Cook',
      filerRole: 'CEO',
    },
  };

  it('renders logo before headline before ticker line before form badge', () => {
    const { container } = render(
      React.createElement(Form4MinimalistTemplate, { filing: baseFiling as never }),
    );
    const html = container.innerHTML;

    const logoIdx = html.indexOf('alt="tldrSEC"');
    const headlineIdx = html.search(/<h1[^>]*>/);
    // "Apple Inc." also appears in hidden preheader text; anchor at headlineIdx.
    const tickerIdx = html.indexOf('Apple Inc.', Math.max(0, headlineIdx));
    // Form badge always renders the filing type label — look for it AFTER the
    // ticker line so the match is guaranteed to be the body badge, not any
    // accidental upstream occurrence.
    const badgeIdx = html.indexOf('Insider', Math.max(0, tickerIdx));

    expect(logoIdx).toBeGreaterThanOrEqual(0);
    expect(headlineIdx).toBeGreaterThan(logoIdx);
    expect(tickerIdx).toBeGreaterThan(headlineIdx);
    expect(badgeIdx).toBeGreaterThan(tickerIdx);
  });

  it('renders the filer name inline with the ticker line, not in a separate "Filer:" row', () => {
    const { container } = render(
      React.createElement(Form4MinimalistTemplate, { filing: baseFiling as never }),
    );
    // The ticker line should now carry "AAPL · Apple Inc. · Tim Cook, CEO".
    // That's the one place the filer identity renders — no dedicated table row.
    expect(container.textContent).toMatch(/Tim Cook, CEO/);
  });
});

describe('getOwnershipBreakdown — all indirect entities shown', () => {
  // Regression: Meta COO Javier Olivan Form 4 filed 2026-05-13
  // (https://www.sec.gov/Archives/edgar/data/1326801/000095010326007167/ownership.xml)
  // reports 5 distinct ownership entities (1 direct + 4 indirect). A prior
  // `.slice(0, 3)` cap silently dropped the 4th and 5th entries from the
  // rendered breakdown, hiding the trust holding 85,189 shares.
  it('returns every distinct (form, nature) entity — does not cap at 3', () => {
    const metaOlivanTransactions = [
      { ownershipForm: 'D', ownershipNature: '', sharesOwnedFollowing: '6853' },
      { ownershipForm: 'I', ownershipNature: 'By Olivan D LLC', sharesOwnedFollowing: '7556' },
      { ownershipForm: 'I', ownershipNature: 'By Olivan Reinhold D LLC', sharesOwnedFollowing: '2258' },
      { ownershipForm: 'I', ownershipNature: 'By Reinhold D LLC', sharesOwnedFollowing: '7556' },
      { ownershipForm: 'I', ownershipNature: 'By Olivan Reinhold Family Revocable Trust u/a/d 10/16/12', sharesOwnedFollowing: '85189' },
    ];

    const breakdown = getOwnershipBreakdown(metaOlivanTransactions);

    expect(breakdown).not.toBeNull();
    expect(breakdown).toHaveLength(5);

    const natures = breakdown!.map(b => b.nature);
    expect(natures).toContain('By Reinhold D LLC');
    expect(natures).toContain('By Olivan Reinhold Family Revocable Trust u/a/d 10/16/12');

    const trust = breakdown!.find(b => b.nature.startsWith('By Olivan Reinhold Family'));
    expect(trust).toBeDefined();
    expect(trust!.form).toBe('Indirect');
    expect(trust!.shares).toBe('85,189');
  });

  it('returns null when all transactions share one (form, nature) bucket', () => {
    const allDirect = [
      { ownershipForm: 'D', ownershipNature: '', sharesOwnedFollowing: '1000' },
      { ownershipForm: 'D', ownershipNature: '', sharesOwnedFollowing: '900' },
    ];
    expect(getOwnershipBreakdown(allDirect)).toBeNull();
  });
});

