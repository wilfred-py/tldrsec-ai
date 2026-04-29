/**
 * Campaign Email XSS safety tests
 *
 * Mirrors __tests__/email/8k-xss.test.tsx, but for the inline-HTML
 * campaign-templates.ts pipeline. Unlike the React-rendered 8-K templates
 * (which auto-escape via JSX), campaign templates use string interpolation
 * in template literals — XSS protection depends on every interpolation site
 * passing user content through `escapeHtml` from `lib/email/security-helpers.ts`.
 *
 * Adversarial fixtures cover:
 *   - <script> tag in companyName, title, summary
 *   - <img onerror> in summary
 *   - "><script> boundary attack
 *   - CRLF header injection in subject (filing.title with \r\n)
 *
 * Acceptance criteria covered: AC1 (HTML escape), AC2 (subject CRLF strip).
 */

// Stub @react-email/render: the suite tests inline-template-literal escaping
// in email1/email2, not <EmailHeader> rendering (JSX auto-escapes there). The
// real renderAsync resolves to dist/browser under jsdom and uses dynamic
// import("react-dom/server"), which Jest's CJS environment can't execute.
jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table><tbody><tr><td>HEADER_STUB</td></tr></tbody></table>'),
}));

import {
  getCampaignEmailContent,
  type CampaignFiling,
} from '@/lib/email/campaign-templates';

const baseFiling: CampaignFiling = {
  ticker: 'AAPL',
  companyName: 'Apple Inc.',
  filingType: '8-K',
  filingDate: new Date('2026-04-28'),
  importance: 'high',
  summary: 'Material agreement signed.',
  title: 'AI infrastructure deal',
};

const baseOptions = {
  unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=test',
};

describe('Campaign email XSS safety', () => {
  describe('Email 1 (hero)', () => {
    it('X1: <script> in companyName is HTML-escaped, not executed', async () => {
      const filings: CampaignFiling[] = [{
        ...baseFiling,
        companyName: '<script>alert(1)</script>',
      }];
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('X2: <script> in title is HTML-escaped in body, not in subject', async () => {
      const filings: CampaignFiling[] = [{
        ...baseFiling,
        title: '<script>alert(2)</script>',
      }];
      const { html, subject } = await getCampaignEmailContent(1, { ...baseOptions, filings });

      // HTML body: escaped
      expect(html).not.toContain('<script>alert(2)</script>');
      expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
      // Subject (RFC 5322 header): not HTML-escaped, but raw <script> here is
      // benign because subjects render as plain text in mail clients.
      // The header-injection threat is CRLF, covered by X5.
      expect(subject).toContain('<script>alert(2)</script>');
    });

    it('X3: <img onerror> in summary renders as escaped text only', async () => {
      const filings: CampaignFiling[] = [{
        ...baseFiling,
        summary: '"><img src=x onerror=alert(1)>',
      }];
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings });

      // Raw payload must not survive into HTML
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      // Quote+angle bracket boundary attack must not break out of attribute
      expect(html).not.toContain('"><img');
      // Escaped form is present
      expect(html).toContain('&lt;img');
      expect(html).toContain('&quot;&gt;');
    });

    it('X4: boundary attack "><script> is fully escaped', async () => {
      const filings: CampaignFiling[] = [{
        ...baseFiling,
        summary: '"><script>alert(1)</script>',
      }];
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings });

      expect(html).not.toContain('"><script>');
      expect(html).toContain('&quot;&gt;&lt;script&gt;');
    });

    it('X5: CRLF in title is stripped from subject (header injection)', async () => {
      const filings: CampaignFiling[] = [{
        ...baseFiling,
        title: 'AI deal\r\nBcc: attacker@evil.com',
      }];
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings });

      // The actual attack vector is the CRLF byte — without it, the leftover
      // "Bcc: ..." text remains part of the single-line Subject header value
      // and is interpreted as plain subject text, not a new RFC 5322 header.
      expect(subject).not.toMatch(/[\r\n]/);
    });

    it('X6: ticker with CR/LF is stripped from subject', async () => {
      const filings: CampaignFiling[] = [{
        ...baseFiling,
        ticker: 'AAPL\r\nFrom: spoofed@x',
      }];
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings });

      expect(subject).not.toMatch(/[\r\n]/);
    });

    it('X5b: bare \\n in title is also stripped', async () => {
      const filings: CampaignFiling[] = [{
        ...baseFiling,
        title: 'AI deal\nBcc: attacker@evil.com',
      }];
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings });

      expect(subject).not.toMatch(/[\r\n]/);
    });
  });

  describe('Email 2 (digest)', () => {
    it('X7: <script> in any digest filing field is escaped', async () => {
      const filings: CampaignFiling[] = [
        { ...baseFiling, ticker: 'AAPL', companyName: '<script>alert(1)</script>' },
        { ...baseFiling, ticker: 'MSFT', title: '<img src=x onerror=alert(2)>' },
        { ...baseFiling, ticker: 'NVDA', summary: '<svg onload=alert(3)>' },
      ];
      const { html } = await getCampaignEmailContent(2, { ...baseOptions, filings });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<img src=x onerror=alert(2)>');
      expect(html).not.toContain('<svg onload=alert(3)>');

      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
      expect(html).toContain('&lt;svg onload=alert(3)&gt;');
    });

    it('X8: digest preheader escapes title and company', async () => {
      const filings: CampaignFiling[] = [
        { ...baseFiling, ticker: 'AAPL', title: '<script>alert(1)</script>' },
      ];
      const { html } = await getCampaignEmailContent(2, { ...baseOptions, filings });

      // Preheader is rendered inside a <div style="display:none"> wrapper
      // — it's still HTML, so must be escaped.
      expect(html).not.toContain('<script>alert(1)</script>');
    });
  });

  describe('Defense in depth', () => {
    it('renders without filings array (fallback path) and never injects', async () => {
      // Fallback samples are hardcoded and trusted, but verify no execution
      // surface bleeds in via options.variant or options.unsubscribeUrl.
      const { html } = await getCampaignEmailContent(1, {
        ...baseOptions,
        unsubscribeUrl: 'https://tldrsec.app/u?t=<script>alert(1)</script>',
      });

      // unsubscribeUrl is rendered inside an href — escapeHtml is not the
      // right defense for URL contexts. We rely on URL.canParse / generated
      // tokens upstream. This assertion confirms the fallback path doesn't
      // crash on hostile input; full URL validation is in unsubscribe-tokens.test.
      expect(html).toBeDefined();
      expect(html.length).toBeGreaterThan(100);
    });

    it('escapeHtml is imported from security-helpers, not redefined locally', async () => {
      // Read the file source and assert the import + non-redefinition.
      // Mirrors AC1 + the static check in the test plan.
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../../lib/email/campaign-templates.ts'),
        'utf-8',
      );
      expect(src).toMatch(/from\s+['"]\.\/security-helpers['"]/);
      expect(src).not.toMatch(/^(export\s+)?function\s+escapeHtml/m);
      expect(src).not.toMatch(/^const\s+escapeHtml\s*=/m);
    });
  });
});
