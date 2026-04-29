/**
 * Campaign UTM + click-attribution propagation (AC12).
 *
 * Status as of PR 1: AC12 is **not yet implemented** for the campaign route.
 * Email 2 + Email 3 CTAs link directly to `https://tldrsec.app/...` without
 * passing through `/r/filing?...` for variant-aware click attribution.
 *
 * What this suite does:
 * 1. Pins the **current** href contract (direct links) so any change is
 *    intentional and shows up in a diff.
 * 2. Documents the **future** contract under `it.todo` so AC12 stays visible
 *    until a follow-up PR wires up `wrapInRedirect` (lib/email/url-utils.ts:122)
 *    around the campaign CTAs.
 *
 * Mirrors __tests__/email/utm-variant-propagation.test.tsx in spirit (CTA href
 * inspection) but adapted for the inline-HTML campaign templates: we parse
 * the rendered HTML string and pull anchor hrefs via regex rather than
 * `render()` because the campaign output is a string, not a React tree.
 */

jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table><tbody><tr><td>HEADER_STUB</td></tr></tbody></table>'),
}));

import { getCampaignEmailContent } from '@/lib/email/campaign-templates';

const baseOptions = {
  unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=t',
};

/** Pull anchor hrefs from the rendered HTML, excluding the unsubscribe + settings links. */
function ctaHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const re = /<a\s+[^>]*href="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (href.includes('/unsubscribe') || href.includes('/dashboard/settings')) continue;
    hrefs.push(href);
  }
  return hrefs;
}

describe('Campaign CTA href contract (AC12)', () => {
  describe('Email 2 — soft "see how it works" CTA', () => {
    it('currently links directly to https://tldrsec.app (no /r/filing wrap)', async () => {
      const { html } = await getCampaignEmailContent(2, baseOptions);
      const hrefs = ctaHrefs(html);
      expect(hrefs).toContain('https://tldrsec.app');
    });

    // AC12 — once implemented, the CTA should wrap through /r/filing so that
    // server-side click attribution can fire `email_cta_clicked` with the
    // variant tag before the 302. Tracking lives in
    // app/api/r/filing/route.ts and lib/email/url-utils.ts:wrapInRedirect.
    it.todo('AC12: variant=A wraps CTA through /r/filing?v=A&...');
    it.todo('AC12: variant=B wraps CTA through /r/filing?v=B&...');
    it.todo('AC12: no variant → no wrap (direct link preserved)');
  });

  describe('Email 3 — invite CTA', () => {
    it('currently links directly to /sign-up?plan=pro&ref=campaign', async () => {
      const { html } = await getCampaignEmailContent(3, baseOptions);
      const hrefs = ctaHrefs(html);
      expect(hrefs.some(h => h.includes('/sign-up?plan=pro&ref=campaign'))).toBe(true);
    });

    it('CTA href is HTML-safe (& not double-escaped)', async () => {
      // The route uses raw `&` in the URL params (plan=pro&ref=campaign).
      // Pin that we don't accidentally start emitting `&amp;` inside an href
      // attribute, which most clients tolerate but Outlook can mishandle.
      const { html } = await getCampaignEmailContent(3, baseOptions);
      const hrefs = ctaHrefs(html);
      const signupLink = hrefs.find(h => h.includes('/sign-up'));
      expect(signupLink).toBeDefined();
      expect(signupLink).not.toMatch(/&amp;/);
    });

    it.todo('AC12: variant=A wraps invite CTA through /r/filing?v=A&...');
    it.todo('AC12: variant=B wraps invite CTA through /r/filing?v=B&...');
  });

  describe('Email 1 — pure-value email (no CTA)', () => {
    it('contains no marketing CTA href (only unsubscribe + settings)', async () => {
      const { html } = await getCampaignEmailContent(1, baseOptions);
      const hrefs = ctaHrefs(html);
      // Logo image is wrapped at logo-email.png but not as <a>; the EmailHeader
      // stub also has no anchors. Result: zero CTAs in the body.
      expect(hrefs).toEqual([]);
    });
  });
});
