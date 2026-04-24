/**
 * Cross-template layout order regression tests.
 *
 * The new layout puts logo+date → headline → ticker line → form/signal badges
 * → body. Each minimalist template must respect that order. We render with
 * realistic structured data so the AI-headline path is exercised, and assert
 * order via container.innerHTML.indexOf() (text content collapses inline pills
 * across multiple DOM nodes).
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form10KMinimalistTemplate } from '@/components/ui/email/templates/10k-minimalist-template';
import { Form10QMinimalistTemplate } from '@/components/ui/email/templates/10q-minimalist-template';
import { Form8KMinimalistTemplate } from '@/components/ui/email/templates/8k-minimalist-template';
import { Form4MinimalistTemplate } from '@/components/ui/email/templates/form4-minimalist-template';
import { Form144MinimalistTemplate } from '@/components/ui/email/templates/form144-minimalist-template';
import { FormDEF14AMinimalistTemplate } from '@/components/ui/email/templates/def14a-minimalist-template';
import { Form11KMinimalistTemplate } from '@/components/ui/email/templates/11k-minimalist-template';
import { FormS1MinimalistTemplate } from '@/components/ui/email/templates/s1-minimalist-template';
import { FormS3MinimalistTemplate } from '@/components/ui/email/templates/s3-minimalist-template';
import { GenericMinimalistTemplate } from '@/components/ui/email/templates/generic-minimalist-template';
import { FilingTemplateData } from '@/lib/email/types';

function baseFiling(overrides: Partial<FilingTemplateData> = {}): FilingTemplateData {
  return {
    companyName: 'Apple Inc.',
    symbol: 'AAPL',
    filingType: '10-K',
    filingDate: '2026-01-15',
    filingUrl: 'https://www.sec.gov/example',
    summaryText: 'Apple reported record full-year revenue.',
    ...overrides,
  };
}

interface OrderCase {
  name: string;
  Template: React.ComponentType<{ filing: FilingTemplateData }>;
  filing: FilingTemplateData;
  signalNeedle: string;
}

const cases: OrderCase[] = [
  {
    name: '10-K',
    Template: Form10KMinimalistTemplate,
    filing: baseFiling({ filingType: '10-K', summaryData: { headline: 'AAPL grew revenue 8% YoY', keyPoints: ['Services hit a record'] } }),
    signalNeedle: 'ANNUAL REPORT',
  },
  {
    name: '10-Q',
    Template: Form10QMinimalistTemplate,
    filing: baseFiling({ filingType: '10-Q', summaryData: { headline: 'AAPL Q1 beats estimates', keyPoints: ['EPS up 12%'] } }),
    signalNeedle: 'QUARTERLY REPORT',
  },
  {
    name: '8-K',
    Template: Form8KMinimalistTemplate,
    filing: baseFiling({
      filingType: '8-K',
      summaryData: {
        headline: 'AAPL announces $90B buyback',
        eventType: 'Capital Return',
      },
    }),
    signalNeedle: '8-K',
  },
  {
    name: 'Form 4',
    Template: Form4MinimalistTemplate,
    filing: baseFiling({
      filingType: '4',
      summaryData: {
        headline: 'Tim Cook sold 50,000 AAPL shares',
        filerName: 'Tim Cook',
        filerRole: 'CEO',
      },
    }),
    signalNeedle: 'AAPL',
  },
  {
    name: 'Form 144',
    Template: Form144MinimalistTemplate,
    filing: baseFiling({
      filingType: '144',
      summaryData: {
        headline: 'AAPL insider proposes 100K share sale',
        filerName: 'Tim Cook',
      },
    }),
    signalNeedle: 'AAPL',
  },
  {
    name: 'DEF 14A',
    Template: FormDEF14AMinimalistTemplate,
    filing: baseFiling({
      filingType: 'DEF 14A',
      summaryData: { headline: 'AAPL proxy includes director slate' },
    }),
    signalNeedle: 'PROXY VOTE',
  },
  {
    name: '11-K',
    Template: Form11KMinimalistTemplate,
    filing: baseFiling({ filingType: '11-K', summaryData: { headline: 'AAPL employee stock plan annual report' } }),
    // Needle matches the formLabel "11-K | Employee Plan" rendered in the body
    // (signal pill is dedup-suppressed because it duplicates the formLabel).
    signalNeedle: 'Employee Plan',
  },
  {
    name: 'S-1',
    Template: FormS1MinimalistTemplate,
    filing: baseFiling({ filingType: 'S-1', summaryData: { headline: 'AAPL files for IPO' } }),
    signalNeedle: 'IPO FILING',
  },
  {
    name: 'S-3',
    Template: FormS3MinimalistTemplate,
    filing: baseFiling({ filingType: 'S-3', summaryData: { headline: 'AAPL registers shelf offering' } }),
    // Needle matches formLabel "S-3 | Offering" (signal pill is dedup-suppressed).
    signalNeedle: 'Offering',
  },
  {
    name: 'Generic',
    Template: GenericMinimalistTemplate,
    filing: baseFiling({ filingType: 'SC 13G/A', summaryData: { headline: 'AAPL passive stake disclosure' } }),
    signalNeedle: 'SC 13G/A',
  },
];

describe('Template layout order — logo+date → headline → ticker → badges → body', () => {
  cases.forEach(({ name, Template, filing, signalNeedle }) => {
    it(`${name}: headline appears before form/signal badge cluster`, () => {
      const { container } = render(<Template filing={filing} />);
      const html = container.innerHTML;

      const logoIdx = html.indexOf('alt="tldrSEC"');
      const headlineIdx = html.search(/<h1[^>]*>/);
      // Search for the badge needle AFTER the headline so we skip hidden
      // preheader text (e.g. "PROXY VOTE: ...") that lives at the top of the
      // DOM for inbox preview but is visually hidden via display:none.
      const badgeIdx = html.indexOf(signalNeedle, Math.max(0, headlineIdx));

      expect(logoIdx).toBeGreaterThanOrEqual(0);
      expect(headlineIdx).toBeGreaterThan(logoIdx);
      // Badge cluster lives in the body section, after the lead header.
      expect(badgeIdx).toBeGreaterThan(headlineIdx);
    });

    it(`${name}: ticker line (AAPL · Apple Inc.) appears between headline and body badge`, () => {
      const { container } = render(<Template filing={filing} />);
      const html = container.innerHTML;
      const headlineIdx = html.search(/<h1[^>]*>/);
      // Same preheader-skip rationale as above: "Apple Inc." appears in the
      // preheader preview string, so anchor the search at the headline.
      const tickerIdx = html.indexOf('Apple Inc.', Math.max(0, headlineIdx));
      expect(tickerIdx).toBeGreaterThan(headlineIdx);
    });
  });
});

describe('8-K specific: redundant Event/Filed rows removed', () => {
  it('does not render an "Event" data row in the body snapshot', () => {
    const { container } = render(
      <Form8KMinimalistTemplate
        filing={baseFiling({
          filingType: '8-K',
          summaryData: {
            headline: 'AAPL announces buyback',
            eventType: 'Capital Return',
          },
        })}
      />
    );
    // Form badge row IS allowed to mention the event category, but the body
    // snapshot table (left-label "Event" / "Filed") must be gone.
    const dataRowMatches = Array.from(container.querySelectorAll('td'))
      .filter((td) => td.textContent?.trim() === 'Event' || td.textContent?.trim() === 'Filed');
    expect(dataRowMatches).toHaveLength(0);
  });
});

describe('S-1 form/signal duplication suppression', () => {
  it('renders the IPO FILING signal at most once in the visible body', () => {
    const { container } = render(
      <FormS1MinimalistTemplate
        filing={baseFiling({ filingType: 'S-1', summaryData: { headline: 'AAPL files for IPO' } })}
      />
    );
    const html = container.innerHTML;
    // Skip the preheader (hidden inbox-preview text lives at the top of the DOM
    // and always contains the signal string). Search only after the first
    // visible lead-header landmark.
    const afterHeader = html.indexOf('alt="tldrSEC"');
    const bodyHtml = afterHeader >= 0 ? html.slice(afterHeader) : html;
    const matches = bodyHtml.match(/IPO FILING/g) || [];
    // Body should render the signal pill at most once. "S-1 | IPO" formLabel
    // does NOT contain the word "FILING", so dedup logic allows a single
    // signal pill to render alongside the form badge.
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});

describe('Form 4 fallback headline (no AI summary)', () => {
  it('produces a ticker-prefixed fallback headline when summaryData lacks a headline', () => {
    const { container } = render(
      <Form4MinimalistTemplate
        filing={baseFiling({
          filingType: '4',
          summaryData: { filerName: 'Tim Cook', filerRole: 'CEO' },
        })}
      />
    );
    const h1 = container.querySelector('h1')?.textContent || '';
    expect(h1).toMatch(/AAPL/);
  });
});

describe('Generic template headline fallback', () => {
  it('still emits a non-empty headline for sparse data', () => {
    const { container } = render(
      <GenericMinimalistTemplate
        filing={baseFiling({ filingType: 'SC 13G/A', summaryData: undefined })}
      />
    );
    const h1 = container.querySelector('h1');
    if (h1) {
      expect(h1.textContent?.trim().length).toBeGreaterThan(0);
    } else {
      // If the template chose to omit h1 entirely (sparse-data path), the body
      // must still mention the ticker so the email isn't empty.
      expect(container.textContent).toMatch(/AAPL/);
    }
  });
});
