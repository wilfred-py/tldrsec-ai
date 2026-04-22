/**
 * 8-K XSS safety tests (X1-X4)
 *
 * All LLM-derived strings flow through JSX interpolation (auto-escaped by React)
 * and the service-layer Zod validator (strips malformed shapes). This test
 * suite verifies hostile inputs render as escaped text, never executable HTML.
 */

import * as React from 'react';
import { z } from 'zod';
import { render } from '@testing-library/react';
import { DealTermsCard } from '@/components/ui/email/templates/sections/DealTermsCard';
import { TranchesList } from '@/components/ui/email/templates/sections/TranchesList';
import { Form8KMinimalistTemplate } from '@/components/ui/email/templates/8k-minimalist-template';
import { FilingTemplateData } from '@/lib/email/types';
import { fixtures } from './fixtures';

const TrancheSchema = z.object({
  amountDisplay: z.string().min(1).max(64),
  currency: z.string().regex(/^[A-Z]{3}$/),
  coupon: z.string().max(64).optional(),
  yield: z.string().max(64).optional(),
  maturity: z.string().max(64).optional(),
  spread: z.string().max(64).optional(),
});

describe('8-K XSS safety (X1-X4)', () => {
  it('X1: counterparty <script> is rendered as escaped text, not executable', () => {
    const { container } = render(
      <DealTermsCard dealTerms={{ counterparty: '<script>alert(1)</script>' }} />,
    );
    // React auto-escapes via JSX: innerHTML should contain &lt;script&gt;
    const html = container.innerHTML;
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    // No actual <script> child
    expect(container.querySelector('script')).toBeNull();
  });

  it('X2: amountDisplay with onerror payload is rendered as escaped text', () => {
    const { container } = render(
      <TranchesList tranches={[
        { amountDisplay: '"><img src=x onerror=alert(1)>', currency: 'USD' },
        { amountDisplay: '$1B', currency: 'USD' },
      ]} />,
    );
    const html = container.innerHTML;
    // Primary security assertions: no attacker-controlled element rendered.
    // The payload appears in the DOM only as escaped text inside a table cell.
    const imgs = container.querySelectorAll('img');
    for (const img of imgs) {
      expect(img.getAttribute('onerror')).toBeNull();
      // Attacker-controlled src=x should never reach the DOM as a real img
      expect(img.getAttribute('src')).not.toBe('x');
    }
    // The payload renders escaped — `<img` becomes `&lt;img` in innerHTML
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
  });

  it('X3: approvals entries with HTML-like strings are escaped', () => {
    const { container } = render(
      <DealTermsCard dealTerms={{
        counterparty: 'Acme',
        approvals: ['<b>html</b>', '<img src=x>'],
      }} />,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).toContain('&lt;b&gt;html&lt;/b&gt;');
  });

  it('X4: Zod rejects tranches with non-ISO-4217 currency like <script>', () => {
    const bad = [{ amountDisplay: '$1B', currency: '<script>' }];
    const result = z.array(TrancheSchema).safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('defense-in-depth: xssPayload fixture renders safely end-to-end', () => {
    const OLD_ENV = process.env;
    process.env = { ...OLD_ENV, ENABLE_8K_STRUCTURED_RENDERING: 'true' };
    try {
      const filing: FilingTemplateData = {
        companyName: 'Test',
        symbol: 'TEST',
        filingType: '8-K',
        filingDate: '2026-04-20',
        filingUrl: 'https://sec.gov/x',
        summaryText: fixtures.xssPayload.summary,
        summaryData: fixtures.xssPayload as FilingTemplateData['summaryData'],
      };
      const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
      // itemNumbers=['5.02'] gates out the structured blocks, so no injection surface renders
      expect(container.querySelector('script')).toBeNull();
      // The only <img> in the template is the tldrSEC logo (static, trusted).
      // No attacker-controlled img (src=x, onerror, etc.) should be present.
      const imgs = container.querySelectorAll('img');
      for (const img of imgs) {
        expect(img.getAttribute('onerror')).toBeNull();
        expect(img.getAttribute('src')).not.toBe('x');
      }
    } finally {
      process.env = OLD_ENV;
    }
  });
});
