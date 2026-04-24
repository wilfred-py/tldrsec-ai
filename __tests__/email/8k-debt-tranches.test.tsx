/**
 * 8-K Item 2.03 debt tranches — rendering tests (T1-T11)
 *
 * Tests the TranchesList component + its wiring in Form8KMinimalistTemplate.
 * Uses @testing-library/react to render into JSDOM, then asserts on resulting
 * HTML / DOM.
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form8KMinimalistTemplate } from '@/components/ui/email/templates/8k-minimalist-template';
import { TranchesList } from '@/components/ui/email/templates/sections/TranchesList';
import { FilingTemplateData } from '@/lib/email/types';
import { fixtures } from './fixtures';

function buildFiling(summaryData: Record<string, unknown>): FilingTemplateData {
  return {
    companyName: 'Test Corp',
    symbol: 'TEST',
    filingType: '8-K',
    filingDate: '2026-04-20',
    filingUrl: 'https://sec.gov/test',
    summaryText: (summaryData.summary as string) || '',
    summaryData: summaryData as FilingTemplateData['summaryData'],
  };
}

describe('8-K debt tranches rendering (T1-T11)', () => {
  it('T1: renders table for multi-tranche BRK.A with both JPY + USD subheaders', () => {
    const { container } = render(
      <Form8KMinimalistTemplate filing={buildFiling(fixtures.brkMultiCurrency)} />,
    );
    const tables = container.querySelectorAll('table');
    expect(tables.length).toBeGreaterThan(0);
    // Count the tranche rows — 7 tranches
    const trancheCells = container.querySelectorAll('td');
    const text = container.textContent || '';
    expect(text).toContain('JPY');
    expect(text).toContain('USD');
    // Sample tranche amounts present
    expect(text).toContain('¥60.0B');
    expect(text).toContain('$3.0B');
    expect(trancheCells.length).toBeGreaterThan(7);
  });

  it('T2: renders inline block for single tranche, not a standalone tranches table', () => {
    const { container } = render(
      <TranchesList tranches={[{ amountDisplay: '$500M', currency: 'USD', coupon: '5.250%', maturity: '2032' }]} />,
    );
    // Single-tranche renderer is a div, not a table
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain('$500M');
    expect(container.textContent).toContain('5.250%');
    expect(container.textContent).toContain('due 2032');
  });

  it('T3: falls back to prose when tranches empty array provided', () => {
    const filing = buildFiling({ ...fixtures.emptyTranches, tranches: [] });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    // No tranche totals line present
    expect(container.textContent).not.toContain('tranches)');
    // Prose summary is present
    expect(container.textContent).toContain('$1B will fund operations');
  });

  it('T4: falls back to prose when tranches field is undefined', () => {
    const filing = buildFiling(fixtures.emptyTranches);
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    expect(container.textContent).not.toContain('tranches)');
    expect(container.textContent).toContain('$1B will fund operations');
  });

  it('T5: multi-currency tranches render both currency subheaders', () => {
    const { container } = render(<TranchesList tranches={fixtures.brkMultiCurrency.tranches} />);
    const text = container.textContent || '';
    const jpyIdx = text.indexOf('JPY');
    const usdIdx = text.indexOf('USD');
    expect(jpyIdx).toBeGreaterThan(-1);
    expect(usdIdx).toBeGreaterThan(-1);
    // Order: JPY subheader appears before USD subheader (JPY tranches come first in fixture)
    expect(jpyIdx).toBeLessThan(usdIdx);
  });

  it('T6: renders em-dash for missing spread / optional fields without layout break', () => {
    const { container } = render(
      <TranchesList tranches={[
        { amountDisplay: '$1B', currency: 'USD', coupon: '4%', maturity: '2030' },
        { amountDisplay: '$500M', currency: 'USD', coupon: '3.5%', maturity: '2028' },
      ]} />,
    );
    // Em-dash is U+2014
    expect(container.textContent).toContain('\u2014');
    // Table still renders
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('T7: respects itemNumbers gate — no 2.03 = no table', () => {
    const filing = buildFiling({
      ...fixtures.brkMultiCurrency,
      itemNumbers: ['5.02'], // only executive change, NOT debt
    });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    // No tranches-specific label like "tranches)" from TotalsLine
    expect(container.textContent).not.toMatch(/\d+ tranches\)/);
  });

  it('T9: renders perpetual maturity as "Perpetual"', () => {
    const { container } = render(<TranchesList tranches={fixtures.perpetualMaturity.tranches} />);
    expect(container.textContent).toContain('Perpetual');
  });

  it('T10: renders floating coupon "SOFR + 125bps" as-is', () => {
    const { container } = render(<TranchesList tranches={fixtures.floatingRate.tranches} />);
    expect(container.textContent).toContain('SOFR + 125bps');
  });

  it('T11: rendered HTML for brkMultiCurrency + 25-tranche synthetic is <90KB (Gmail clipping budget)', () => {
    const synth25: Array<{ amountDisplay: string; currency: string; coupon?: string; maturity?: string }> = [];
    for (let i = 0; i < 25; i++) {
      synth25.push({
        amountDisplay: `$${(i + 1) * 100}M`,
        currency: 'USD',
        coupon: `${(3 + i * 0.1).toFixed(3)}%`,
        maturity: `${2027 + (i % 20)}`,
      });
    }
    const filing = buildFiling({
      ...fixtures.brkMultiCurrency,
      tranches: synth25,
    });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    const html = container.innerHTML;
    expect(html.length).toBeLessThan(90_000);
  });
});
