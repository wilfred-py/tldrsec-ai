/**
 * Tests for <EmailLeadHeader /> — the new shared lead-header that replaces the
 * old "ticker first, headline buried in body" layout. The contract this test
 * locks in: logo+date row appears BEFORE the headline, headline appears BEFORE
 * the ticker line, and the ticker line is the last row.
 *
 * We assert order via container.innerHTML.indexOf() because the tldrSEC pills
 * and table cells split across multiple DOM nodes, which would defeat
 * textContent-based ordering checks.
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { EmailLeadHeader } from '@/components/ui/email/templates/sections/EmailLeadHeader';

describe('EmailLeadHeader', () => {
  const baseProps = {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    filingDate: '2026-01-15',
    headline: 'Apple beats Q1 revenue estimates by 8%',
  };

  it('renders logo before headline before ticker line', () => {
    const { container } = render(<EmailLeadHeader {...baseProps} />);
    const html = container.innerHTML;

    const logoIdx = html.indexOf('alt="tldrSEC"');
    const headlineIdx = html.indexOf('Apple beats Q1');
    const tickerIdx = html.indexOf('Apple Inc.');

    expect(logoIdx).toBeGreaterThanOrEqual(0);
    expect(headlineIdx).toBeGreaterThan(logoIdx);
    expect(tickerIdx).toBeGreaterThan(headlineIdx);
  });

  it('renders the formatted filing date in the header row', () => {
    const { container } = render(<EmailLeadHeader {...baseProps} filingDate="2026-01-15" />);
    expect(container.textContent).toMatch(/Jan 15, 2026/);
  });

  it('accepts a Date object for filingDate', () => {
    const { container } = render(
      <EmailLeadHeader {...baseProps} filingDate={new Date('2026-03-05')} />
    );
    expect(container.textContent).toMatch(/Mar 5, 2026/);
  });

  it('caps long headlines and prepends the ticker when missing', () => {
    const longHeadline = 'beat estimates with record revenue and significant growth across services'.repeat(2);
    const { container } = render(<EmailLeadHeader {...baseProps} headline={longHeadline} />);
    const headlineNode = container.querySelector('h1');
    expect(headlineNode).not.toBeNull();
    expect(headlineNode!.textContent!.startsWith('AAPL: ')).toBe(true);
    expect(headlineNode!.textContent!.endsWith('…')).toBe(true);
  });

  it('does not double-prefix when headline already contains the ticker', () => {
    const { container } = render(
      <EmailLeadHeader {...baseProps} headline="AAPL beats Q1 estimates" />
    );
    const headlineText = container.querySelector('h1')!.textContent!;
    // Ticker should appear once at the start, not twice.
    expect(headlineText).toBe('AAPL beats Q1 estimates');
  });

  it('renders the filer name and role inline with ticker line when provided', () => {
    const { container } = render(
      <EmailLeadHeader
        {...baseProps}
        filerName="Tim Cook"
        filerRole="CEO"
      />
    );
    expect(container.textContent).toMatch(/Tim Cook, CEO/);
  });

  it('omits filer line when filerName is missing or generic "Insider"', () => {
    const { container: noFiler } = render(<EmailLeadHeader {...baseProps} />);
    expect(noFiler.textContent).not.toMatch(/Insider/);

    const { container: insiderFiler } = render(
      <EmailLeadHeader {...baseProps} filerName="Insider" />
    );
    expect(insiderFiler.textContent).not.toMatch(/Insider/);
  });
});
