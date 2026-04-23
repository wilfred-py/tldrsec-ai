/**
 * Form 4 "Watch for" Rendering Tests
 *
 * Guards against regression of the Form 4 "Watch for" revamp:
 * - The hardcoded "SEC transaction code: ..." bullet is deleted.
 * - Only `vestingDetails` (AI-extracted forward-looking content) drives the
 *   "Watch for" section now.
 * - The section is suppressed entirely when there's no vestingDetails.
 *
 * Also includes one regression guard for the S-3 template, which shares the
 * `Watch for:` header style, to ensure the Form 4 deletion didn't touch
 * shared rendering.
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form4MinimalistTemplate } from '@/components/ui/email/templates/form4-minimalist-template';
import { FormS3MinimalistTemplate } from '@/components/ui/email/templates/s3-minimalist-template';
import { FilingTemplateData } from '@/lib/email/types';

function createForm4Filing(overrides: Partial<FilingTemplateData> = {}): FilingTemplateData {
  return {
    companyName: 'Test Corp',
    symbol: 'TEST',
    filingType: 'Form 4',
    filingDate: '2026-01-10',
    filingUrl: 'https://sec.gov/test',
    ...overrides,
  };
}

describe('Form 4 Watch for section', () => {
  it('does NOT render the "Watch for:" section for an award-only filing (Parekh screenshot case)', () => {
    // Reproduces the user-reported screenshot: Apple CFO Parekh award-only
    // filing with transaction codes A/M/F but no vestingDetails.
    const filing = createForm4Filing({
      summaryData: {
        filerName: 'Kevan Parekh',
        filerRole: 'CFO',
        transactions: [
          { type: 'Grant', shares: '5000', code: 'A', acquisitionDisposition: 'A' },
          { type: 'Option Exercise', shares: '10000', code: 'M', acquisitionDisposition: 'A' },
          { type: 'Tax Withholding', shares: '2000', code: 'F', acquisitionDisposition: 'D' },
        ],
      },
    });

    const { container } = render(<Form4MinimalistTemplate filing={filing} />);

    expect(container.textContent).not.toMatch(/Watch for:/);
    expect(container.textContent).not.toMatch(/SEC transaction code:/);
  });

  it('renders ONLY the vesting bullet when vestingDetails is present (no transaction-code bullet)', () => {
    const filing = createForm4Filing({
      summaryData: {
        filerName: 'Jane Doe',
        filerRole: 'Director',
        vestingDetails: '25% vests on 2027-01-15; remainder quarterly over 3 years',
        transactions: [
          { type: 'Grant', shares: '10000', code: 'A', acquisitionDisposition: 'A' },
        ],
      },
    });

    const { container } = render(<Form4MinimalistTemplate filing={filing} />);

    expect(container.textContent).toMatch(/Watch for:/);
    expect(container.textContent).toMatch(/Vesting schedule:/);
    expect(container.textContent).toContain('25% vests on 2027-01-15');
    expect(container.textContent).not.toMatch(/SEC transaction code:/);
  });

  it('does NOT render the "Watch for:" section when transactions exist but vestingDetails is absent (regression guard on the deleted code path)', () => {
    const filing = createForm4Filing({
      summaryData: {
        filerName: 'John Smith',
        filerRole: 'CEO',
        transactions: [
          { type: 'Sale', shares: '50000', pricePerShare: '$200', code: 'S', acquisitionDisposition: 'D' },
        ],
      },
    });

    const { container } = render(<Form4MinimalistTemplate filing={filing} />);

    expect(container.textContent).not.toMatch(/Watch for:/);
    expect(container.textContent).not.toMatch(/SEC transaction code:/);
  });
});

describe('S-3 Watch for section (regression guard for shared styles)', () => {
  it('still renders "Use of proceeds:" with useOfProceeds bullets', () => {
    const filing: FilingTemplateData = {
      companyName: 'Test Corp',
      symbol: 'TEST',
      filingType: 'S-3',
      filingDate: '2026-01-10',
      filingUrl: 'https://sec.gov/test',
      summaryData: {
        offeringType: 'Secondary Offering',
        offeringAmount: '$500M',
        useOfProceeds: [
          'General corporate purposes',
          'Debt repayment',
          'Working capital',
        ],
      },
    };

    const { container } = render(<FormS3MinimalistTemplate filing={filing} />);

    expect(container.textContent).toMatch(/Use of proceeds:/);
    expect(container.textContent).toContain('General corporate purposes');
    expect(container.textContent).toContain('Debt repayment');
  });
});
