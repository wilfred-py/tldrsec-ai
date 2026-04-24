/**
 * W4.1: UTM variant propagation from filing template → EmailFooter → CTA href.
 *
 * Each template computes a variant based on what whyItMatters copy it rendered:
 *   - `ai`       — AI whyItMatters rendered (material bucket + AI text)
 *   - `fallback` — hardcoded fallback rendered (material bucket, no AI)
 *   - `note`     — routine bucket (LOW / 10b5-1)
 *   - `neutral`  — descriptive bucket (trust / award)
 *
 * Goal: verify the CTA href carries utm_content=<variant> so click-through
 * attribution per variant is possible.
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form4MinimalistTemplate } from '@/components/ui/email/templates/form4-minimalist-template';
import { Form8KMinimalistTemplate } from '@/components/ui/email/templates/8k-minimalist-template';
import { GenericMinimalistTemplate } from '@/components/ui/email/templates/generic-minimalist-template';
import { FilingTemplateData } from '@/lib/email/types';

const SEC_URL = 'https://www.sec.gov/Archives/edgar/data/0000021344/000155278125000454/e25454_ko-8k.htm';

function makeFiling(overrides: Partial<FilingTemplateData> = {}): FilingTemplateData {
  return {
    companyName: 'Acme Corp',
    symbol: 'ACME',
    filingType: '8-K',
    filingDate: '2026-04-24',
    filingUrl: SEC_URL,
    summaryText: 'Acme Corp announced quarterly earnings.',
    ...overrides,
  };
}

function ctaHref(container: HTMLElement): string | null {
  const links = container.querySelectorAll('a');
  for (const a of Array.from(links)) {
    if (a.textContent?.includes('View Full Filing')) {
      return a.getAttribute('href');
    }
  }
  return null;
}

describe('8-K template UTM propagation', () => {
  it('material + AI whyItMatters → variant=ai', () => {
    const filing = makeFiling({
      filingType: '8-K',
      summaryData: {
        eventType: 'Acquisition',
        itemNumbers: ['1.01'],
        whyItMatters: 'This acquisition meaningfully expands TAM in the adjacent segment.',
      },
    });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    expect(ctaHref(container)).toContain('v=ai');
    // Wrapped in /r/filing so PostHog can capture the click server-side.
    expect(ctaHref(container)).toContain('/r/filing');
  });

  it('material without AI whyItMatters → variant=fallback', () => {
    const filing = makeFiling({
      filingType: '8-K',
      summaryData: {
        eventType: 'Acquisition',
        itemNumbers: ['1.01'],
        financialImpact: 'Unknown',
      },
    });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    expect(ctaHref(container)).toContain('v=fallback');
  });

  it('non-material (routine) 8-K → variant=note', () => {
    const filing = makeFiling({
      filingType: '8-K',
      summaryText: 'Filed exhibit 99.1 supporting routine disclosure.',
      summaryData: {
        eventType: 'Other Events',
        itemNumbers: ['9.01'],
        whyItMatters: 'Should be ignored because bucket is routine.',
      },
    });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    expect(ctaHref(container)).toContain('v=note');
  });
});

describe('Form 4 template UTM propagation', () => {
  const form4Url = 'https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/form4.xml';

  it('HIGH signal (material) → variant=fallback (Form 4 uses hardcoded copy)', () => {
    const filing = makeFiling({
      filingType: 'Form 4',
      filingUrl: form4Url,
      summaryData: {
        signalStrength: 'High - Large open-market purchase',
        transactions: [{ type: 'Purchase', shares: '50000', pricePerShare: '$10.00', code: 'P' }],
      },
    });
    const { container } = render(<Form4MinimalistTemplate filing={filing} />);
    expect(ctaHref(container)).toContain('v=fallback');
  });

  it('LOW signal (10b5-1) → variant=note', () => {
    const filing = makeFiling({
      filingType: 'Form 4',
      filingUrl: form4Url,
      summaryData: {
        signalStrength: 'Low - Pre-scheduled 10b5-1 sale',
        has10b51Plan: true,
        transactions: [{ type: 'Sale', shares: '10000', pricePerShare: '$150.00', code: 'S' }],
      },
    });
    const { container } = render(<Form4MinimalistTemplate filing={filing} />);
    expect(ctaHref(container)).toContain('v=note');
  });

  it('NEUTRAL / award-only → variant=neutral', () => {
    const filing = makeFiling({
      filingType: 'Form 4',
      filingUrl: form4Url,
      summaryData: {
        signalStrength: 'Neutral - Equity award grant',
        transactions: [{ type: 'Award', shares: '1000', pricePerShare: '$0.00', code: 'A' }],
      },
    });
    const { container } = render(<Form4MinimalistTemplate filing={filing} />);
    expect(ctaHref(container)).toContain('v=neutral');
  });
});

describe('Generic template UTM propagation', () => {
  it('AI whyItMatters present → variant=ai', () => {
    const filing = makeFiling({
      filingType: '10-K',
      summaryData: {
        whyItMatters: 'Revenue guidance cut flags possible segment deceleration ahead of Q2.',
        documentDescription: 'Annual report',
      },
    });
    const { container } = render(<GenericMinimalistTemplate filing={filing} />);
    expect(ctaHref(container)).toContain('v=ai');
  });

  it('no AI whyItMatters → variant=fallback', () => {
    const filing = makeFiling({
      filingType: '10-K',
      summaryData: {
        documentDescription: 'Annual report',
      },
    });
    const { container } = render(<GenericMinimalistTemplate filing={filing} />);
    expect(ctaHref(container)).toContain('v=fallback');
  });
});

describe('backward compatibility — unchanged CTA behavior', () => {
  it('CTA still rendered with filing link (no breakage on href structure)', () => {
    const filing = makeFiling({ filingType: '8-K' });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    const href = ctaHref(container);
    expect(href).not.toBeNull();
    // Wrapped in /r/filing redirect — the original SEC URL is the `url` param
    // so the destination still resolves to sec.gov after the click.
    expect(href).toContain('/r/filing');
    expect(href).toContain(encodeURIComponent(SEC_URL));
  });
});
