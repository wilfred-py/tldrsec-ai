/**
 * Filing template-selection tests.
 *
 * Exercises the `selectFilingTemplate` interface — the one seam every email
 * send path crosses to turn a [Filing] type into a renderable template. Tests
 * assert on observable outcomes (which template name is selected, that the
 * selected component renders) rather than on any internal lookup table.
 */

import { render } from '@testing-library/react';
import * as React from 'react';
import { selectFilingTemplate } from '@/lib/email/template-selection';
import { FilingTemplateData } from '@/lib/email/types';

const baseFiling: FilingTemplateData = {
  companyName: 'Test Company',
  symbol: 'TEST',
  ticker: 'TEST',
  filingType: '10-K',
  filingDate: '2025-12-01',
  filingUrl: 'https://example.com/filing',
  summaryText: 'Test summary text',
  summaryData: {},
};

describe('selectFilingTemplate', () => {
  describe('selects the right template name per form type', () => {
    const cases: Array<{ formType: string; expected: string }> = [
      // Form 4 and related insider-trading forms (3/4/5 share the template)
      { formType: 'Form 4', expected: 'form4_minimalist' },
      { formType: 'FORM 4', expected: 'form4_minimalist' },
      { formType: 'FORM4', expected: 'form4_minimalist' },
      { formType: '4', expected: 'form4_minimalist' },
      { formType: 'Form 3', expected: 'form4_minimalist' },
      { formType: '3', expected: 'form4_minimalist' },
      { formType: 'Form 5', expected: 'form4_minimalist' },
      { formType: '5', expected: 'form4_minimalist' },

      // 10-K variants
      { formType: '10-K', expected: '10k_minimalist' },
      { formType: '10K', expected: '10k_minimalist' },
      { formType: 'Form 10-K', expected: '10k_minimalist' },

      // 10-Q variants
      { formType: '10-Q', expected: '10q_minimalist' },
      { formType: '10Q', expected: '10q_minimalist' },
      { formType: 'Form 10-Q', expected: '10q_minimalist' },

      // 8-K variants
      { formType: '8-K', expected: '8k_minimalist' },
      { formType: '8K', expected: '8k_minimalist' },
      { formType: 'FORM 8-K', expected: '8k_minimalist' },

      // Form 144 variants
      { formType: '144', expected: 'form144_minimalist' },
      { formType: 'Form 144', expected: 'form144_minimalist' },
      { formType: 'FORM 144', expected: 'form144_minimalist' },

      // Specialized forms that the filings generator previously dropped to
      // generic — they now resolve consistently on every send path.
      { formType: 'DEF 14A', expected: 'def14a_minimalist' },
      { formType: 'Schedule 13D', expected: '13d_legacy' },
      { formType: 'SC 13D', expected: '13d_legacy' },
      { formType: 'S-1', expected: 's1_minimalist' },
      { formType: 'S-3', expected: 's3_minimalist' },
      { formType: 'Form 11-K', expected: '11k_minimalist' },

      // Unknown -> generic fallback
      { formType: 'UNKNOWN-FORM', expected: 'generic_minimalist' },
      { formType: '', expected: 'generic_minimalist' },
    ];

    cases.forEach(({ formType, expected }) => {
      it(`selects "${expected}" for "${formType}"`, () => {
        expect(selectFilingTemplate(formType).name).toBe(expected);
      });
    });
  });

  it('is case- and prefix-insensitive: "Form 4" and "FORM 4" select the same template', () => {
    expect(selectFilingTemplate('Form 4').name).toBe(selectFilingTemplate('FORM 4').name);
    expect(selectFilingTemplate('Form 4').component).toBe(selectFilingTemplate('FORM 4').component);
  });

  it('tolerates null/undefined form types via the generic fallback', () => {
    expect(selectFilingTemplate(undefined).name).toBe('generic_minimalist');
    expect(selectFilingTemplate(null).name).toBe('generic_minimalist');
  });

  describe('selected component renders without throwing', () => {
    const formTypes = ['Form 4', '10-K', '10-Q', '8-K', 'Form 144', 'DEF 14A', 'Schedule 13D', 'Unknown'];

    formTypes.forEach((formType) => {
      it(`renders for "${formType}"`, () => {
        const { component: Template } = selectFilingTemplate(formType);
        const filing = { ...baseFiling, filingType: formType };
        const { container } = render(React.createElement(Template, { filing }));
        expect(container.innerHTML).toBeTruthy();
        expect(container.innerHTML.length).toBeGreaterThan(0);
      });
    });
  });
});
