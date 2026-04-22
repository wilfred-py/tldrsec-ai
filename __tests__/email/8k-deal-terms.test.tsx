/**
 * 8-K deal terms — DealTermsCard rendering tests (D1-D5)
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form8KMinimalistTemplate } from '@/components/ui/email/templates/8k-minimalist-template';
import { DealTermsCard } from '@/components/ui/email/templates/sections/DealTermsCard';
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

describe('8-K DealTermsCard rendering (D1-D5)', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, ENABLE_8K_STRUCTURED_RENDERING: 'true' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('D1: renders DealTermsCard for 1.01 filing with all fields', () => {
    const filing = buildFiling({
      ...fixtures.coFiled203And101,
      itemNumbers: ['1.01'], // isolate to 1.01 for this test
    });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    const text = container.textContent || '';
    expect(text).toContain('Globalstar, Inc.');
    expect(text).toContain('$1.2B');
    expect(text).toContain('all-cash');
    expect(text).toContain('Q3 2026');
    expect(text).toContain('HSR'); // approvals
    expect(text).toContain('satellite connectivity'); // rationale
  });

  it('D2: caps approvals at 3 + "+N more"', () => {
    const approvals = ['HSR', 'EU Commission', 'CFIUS', 'FCC', 'shareholder vote'];
    const { container } = render(
      <DealTermsCard dealTerms={{ counterparty: 'Acme Corp', approvals }} />,
    );
    const text = container.textContent || '';
    expect(text).toContain('HSR');
    expect(text).toContain('EU Commission');
    expect(text).toContain('CFIUS');
    expect(text).toContain('+2 more');
    // FCC and shareholder vote should NOT appear as visible items
    expect(text).not.toContain('FCC');
    expect(text).not.toContain('shareholder vote');
  });

  it('D3: falls back to prose when dealTerms absent', () => {
    const filing = buildFiling({
      headline: 'M&A deal',
      summary: 'An acquisition where the LLM did not populate dealTerms.',
      eventType: 'Acquisition',
      itemNumbers: ['1.01'],
      sentiment: 'neutral',
    });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    // No DealTermsCard artifacts — label "Counterparty" comes only from the card
    expect(container.textContent).not.toContain('Counterparty');
    // Prose remains
    expect(container.textContent).toContain('acquisition');
  });

  it('D4: itemNumbers gate blocks on wrong item type', () => {
    const filing = buildFiling({
      ...fixtures.coFiled203And101,
      itemNumbers: ['5.02'], // exec change — neither 1.01 nor 2.01
    });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    // DealTermsCard should not render (no Counterparty label)
    expect(container.textContent).not.toContain('Counterparty');
  });

  it('D5: co-filed 2.03+1.01 renders DealTermsCard before TranchesList', () => {
    const filing = buildFiling(fixtures.coFiled203And101);
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    const html = container.innerHTML;
    const cardIdx = html.indexOf('Globalstar, Inc.');
    const tablesHeader = html.indexOf('Maturity');
    expect(cardIdx).toBeGreaterThan(-1);
    expect(tablesHeader).toBeGreaterThan(-1);
    expect(cardIdx).toBeLessThan(tablesHeader);
  });
});
