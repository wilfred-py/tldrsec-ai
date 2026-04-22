/**
 * 8-K legacy/new-shape backwards-compat tests (L1-L3)
 * (decision 9A — rendering must handle both cached-legacy and new summaries)
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

describe('8-K legacy/new shape compatibility (L1-L3)', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, ENABLE_8K_STRUCTURED_RENDERING: 'true' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('L1: renders cached legacy summary (counterpartyContext, no dealTerms) as prose', () => {
    // Legacy shape — the now-removed counterpartyContext field simulates a
    // summary generated before the schema change landed.
    const legacy = {
      headline: 'Legacy M&A deal',
      summary: 'Acquisition where pre-migration summary used the old counterpartyContext field.',
      eventType: 'Acquisition',
      sentiment: 'neutral',
      itemNumbers: ['1.01'],
      keyHighlights: ['Legacy bullet 1.'],
      counterpartyContext: 'Target Co is a leading SaaS provider.',
    };
    const { container } = render(<Form8KMinimalistTemplate filing={buildFiling(legacy)} />);
    // No empty DealTermsCard should appear — "Counterparty" label is card-specific
    expect(container.textContent).not.toContain('Counterparty');
    // Prose variant still shows
    expect(container.textContent).toContain('pre-migration summary');
  });

  it('L2: renders new-shape summary (dealTerms present, no counterpartyContext)', () => {
    const { container } = render(
      <Form8KMinimalistTemplate filing={buildFiling(fixtures.coFiled203And101)} />,
    );
    expect(container.textContent).toContain('Globalstar, Inc.');
    expect(container.textContent).toContain('all-cash');
  });

  it('L3: mixed inbox — legacy + new render correctly in same test pass', () => {
    const legacy = buildFiling({
      headline: 'Legacy',
      summary: 'Old-format summary.',
      itemNumbers: ['1.01'],
      eventType: 'Acquisition',
    });
    const next = buildFiling(fixtures.coFiled203And101);
    const { container: c1 } = render(<Form8KMinimalistTemplate filing={legacy} />);
    const { container: c2 } = render(<Form8KMinimalistTemplate filing={next} />);
    expect(c1.textContent).not.toContain('Counterparty');
    expect(c2.textContent).toContain('Counterparty');
  });
});
