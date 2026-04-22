/**
 * 8-K extractor↔template seam integration tests (I1-I4)
 * (decision 10A — use recorded Grok JSON fixtures to lock down the contract)
 *
 * These use the `fixtures/*.json` recordings that stand in for real Grok
 * responses. When the Grok 4.1 Fast prompt is re-evaluated, refresh these
 * fixtures — see CONTRIBUTING.md § "8-K prompt changes".
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form8KMinimalistTemplate } from '@/components/ui/email/templates/8k-minimalist-template';
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

describe('8-K integration — recorded fixture → rendered HTML (I1-I4)', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, ENABLE_8K_STRUCTURED_RENDERING: 'true' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('I1: BRK.A recorded response → table present with 7 tranche rows', () => {
    const { container } = render(
      <Form8KMinimalistTemplate filing={buildFiling(fixtures.brkMultiCurrency)} />,
    );
    expect(container.querySelector('table')).not.toBeNull();
    const text = container.textContent || '';
    // All 7 tranches shown
    expect(text).toContain('¥60.0B');
    expect(text).toContain('¥55.0B');
    expect(text).toContain('¥40.0B');
    expect(text).toContain('¥110.0B');
    expect(text).toContain('$3.0B');
    expect(text).toContain('$2.5B');
    expect(text).toContain('$1.5B');
  });

  it('I2: GOOGL $17.5B recorded response → structured block renders (single-currency)', () => {
    const { container } = render(
      <Form8KMinimalistTemplate filing={buildFiling(fixtures.googleSingleCurrency)} />,
    );
    const text = container.textContent || '';
    expect(text).toContain('7 tranches');
    expect(text).toContain('$2.0B');
    expect(text).toContain('$3.0B');
  });

  it('I3: 1.01 recorded response → DealTermsCard renders with counterparty + deal value', () => {
    const { container } = render(
      <Form8KMinimalistTemplate filing={buildFiling(fixtures.coFiled203And101)} />,
    );
    const text = container.textContent || '';
    expect(text).toContain('Globalstar, Inc.');
    expect(text).toContain('$1.2B');
  });

  it('I4: validation-failure shape → graceful prose fallback, no empty table', () => {
    // Simulate what service layer outputs after stripping invalid tranches
    const afterValidation = { ...fixtures.malformedAmount };
    // Service would have stripped tranches — simulate by deleting
    const stripped: Record<string, unknown> = { ...afterValidation };
    delete stripped.tranches;
    const { container } = render(
      <Form8KMinimalistTemplate filing={buildFiling(stripped)} />,
    );
    // No standalone tranches table — the main content area
    // The only tables that could appear are the legacy dataSnapshot table (labels)
    // Assertion: no "Amount / Coupon / Maturity" header row (unique to TranchesList)
    expect(container.textContent).not.toContain('Maturity');
    // Prose still renders
    expect(container.textContent).toContain('non-numeric garbage');
  });
});
