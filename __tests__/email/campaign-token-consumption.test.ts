/**
 * Campaign token consumption (AC4).
 *
 * Pins that the campaign templates source signal-band + badge colors from the
 * design-system tokens (`SignalColors`, `EmailColors`, `BadgeColors`) rather
 * than inlining hex literals at the importance/badge interpolation sites.
 *
 * Why this matters: the 11 filing templates (8-K, 10-K, Form 4, etc.) all
 * derive their importance palette from `SignalColors[importanceToSignalLevel(x)]`.
 * If campaign emails drift to one-off hex codes, brand consistency breaks AND
 * any future palette tweak (e.g., raising contrast for accessibility) won't
 * propagate.
 *
 * Two-pronged check:
 *   1. **Static** — the source file imports `SignalColors`, `EmailColors`,
 *      and `importanceToSignalLevel`, and does not redefine the band hex
 *      values inline. Layout chrome (page bg, border lines) is allowed to
 *      use raw hex for now — see `KNOWN_LAYOUT_HEX` below.
 *   2. **Render-time** — for each importance level, the rendered HTML
 *      contains the exact `SignalColors[level].bgColor` and `borderColor`
 *      tokens. Any future "inline override" of a band color would fail
 *      this assertion.
 */

jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table><tbody><tr><td>HEADER_STUB</td></tr></tbody></table>'),
}));

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getCampaignEmailContent,
  type CampaignFiling,
} from '@/lib/email/campaign-templates';
import {
  SignalColors,
  EmailColors,
} from '@/components/ui/email/design-system';

const baseOptions = { unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=t' };

function makeFiling(overrides: Partial<CampaignFiling> = {}): CampaignFiling {
  return {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    filingType: '8-K',
    filingDate: new Date('2026-04-28'),
    importance: 'high',
    summary: 'Material agreement signed.',
    title: 'Quarterly results',
    ...overrides,
  };
}

const SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'lib/email/campaign-templates.ts'),
  'utf8',
);

// Hex literals for layout chrome (page bg, border lines, footer text). These
// are NOT importance-band signals and are allowed pending a full token sweep.
// Pinning them here makes any expansion of the inline-hex set explicit.
const KNOWN_LAYOUT_HEX = new Set([
  '#1e293b', // logo fallback color
  '#f4f4f5', // page bg
  '#ffffff', // card bg + badge text
  '#e2e8f0', // hr / border-top
  '#94a3b8', // footer text muted
  '#cbd5e1', // copyright muted
  '#F3F4F6', // FILING_BADGE_BG (token-equivalent — BadgeColors.neutral.bg)
  '#334155', // body slate copy
  '#64748b', // soft helper text
  '#f8fafc', // pull-quote bg in invite email
  '#1e3a8a', // CTA primary (locked from design-shotgun)
  '#2563eb', // CTA blue (E2 + E3 — pre-token-sweep)
  '#475569', // slate body copy in digest intro (collides with LOW.textColor; see it.todo below)
  '#6B7280', // appears in code comment (// #6B7280) — false-positive from regex scan
]);

describe('Campaign token consumption (AC4)', () => {
  describe('Static — source-file imports + no inline band hex', () => {
    it('imports SignalColors, EmailColors, importanceToSignalLevel from design-system', () => {
      expect(SOURCE).toMatch(
        /from ['"]@\/components\/ui\/email\/design-system['"]/,
      );
      expect(SOURCE).toContain('SignalColors');
      expect(SOURCE).toContain('EmailColors');
      expect(SOURCE).toContain('importanceToSignalLevel');
    });

    it('does not inline the loud SignalColors band hex values (HIGH amber, MODERATE indigo)', () => {
      // The source SHOULD reference `SignalColors[level].bgColor` — never the
      // raw hex. Forbids leaking the HIGH (amber) and MODERATE (indigo)
      // palettes into template literals; these are *purely* signal colors
      // with no other use elsewhere in email design.
      //
      // The two LOW slate values (#475569 textColor + #94A3B8 borderColor)
      // are intentionally excluded — they double as generic muted body /
      // footer copy across the layout chrome, where the hex appears for
      // reasons unrelated to importance signaling. Tracked by the it.todo
      // below.
      const bandHex = [
        SignalColors.HIGH.bgColor,
        SignalColors.HIGH.borderColor,
        SignalColors.HIGH.textColor,
        SignalColors.MODERATE.bgColor,
        SignalColors.MODERATE.borderColor,
        SignalColors.MODERATE.textColor,
        SignalColors.LOW.bgColor,
      ];
      for (const hex of bandHex) {
        const re = new RegExp(hex.replace('#', '\\#'), 'i');
        expect(SOURCE).not.toMatch(re);
      }
    });

    // Documents residual AC4 friction: the digest intro and footer chrome
    // inline #475569 + #94A3B8, which collide with SignalColors.LOW.textColor
    // and .borderColor respectively. Both uses are semantically "muted slate
    // body copy", not "LOW importance" — but a strict "zero hex" reading of
    // AC4 still wants these gone. Refactor path: add a `EmailColors.text.slate`
    // token in design-system.ts and import here.
    it.todo('AC4 strict: refactor #475569 + #94A3B8 in chrome to non-band tokens');

    it('all remaining inline hex literals are layout chrome (whitelist)', () => {
      // Any new inline hex outside KNOWN_LAYOUT_HEX must be intentional —
      // either add it to the whitelist (with a comment explaining why) or
      // refactor it into a design token.
      const hexRe = /#[0-9A-Fa-f]{6}\b/g;
      const found = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = hexRe.exec(SOURCE)) !== null) {
        found.add(m[0]);
      }
      const unexpected = [...found].filter(h => !KNOWN_LAYOUT_HEX.has(h));
      expect(unexpected).toEqual([]);
    });
  });

  describe('Render-time — band colors trace to SignalColors tokens', () => {
    // E1 dropped the importance band entirely in PR 2 — the locked Hybrid
    // voice puts the importance signal into the dry headline + gloss, not
    // into a colored card. The digest (E2) keeps colored bands because
    // scannability is the digest's reason to exist.
    it.each([
      ['high', 'HIGH'] as const,
      ['medium', 'MODERATE'] as const,
      ['low', 'LOW'] as const,
    ])('digest importance=%s renders %s band bg + border tokens', async (importance, level) => {
      const filing = makeFiling({ importance });
      const { html } = await getCampaignEmailContent(2, { ...baseOptions, filings: [filing] });
      expect(html).toContain(SignalColors[level].bgColor);
      expect(html).toContain(SignalColors[level].borderColor);
    });

    it('digest importance=critical collapses into HIGH band (no fourth color)', async () => {
      const filing = makeFiling({ importance: 'critical' });
      const { html } = await getCampaignEmailContent(2, { ...baseOptions, filings: [filing] });
      expect(html).toContain(SignalColors.HIGH.bgColor);
      // The MODERATE bg should NOT appear for a critical filing.
      expect(html).not.toContain(SignalColors.MODERATE.bgColor);
    });

    it('hero (E1) renders WITHOUT signal-band colors — band moved out of E1', async () => {
      const filing = makeFiling({ importance: 'high' });
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(html).not.toContain(SignalColors.HIGH.bgColor);
      expect(html).not.toContain(SignalColors.MODERATE.bgColor);
      expect(html).not.toContain(SignalColors.LOW.bgColor);
    });

    it('digest renders 3 distinct signal palettes when filings span all bands', async () => {
      const filings = [
        makeFiling({ ticker: 'AAPL', importance: 'high', title: 'h1' }),
        makeFiling({ ticker: 'MSFT', importance: 'medium', title: 'h2' }),
        makeFiling({ ticker: 'NVDA', importance: 'low', title: 'h3' }),
      ];
      const { html } = await getCampaignEmailContent(2, { ...baseOptions, filings });
      expect(html).toContain(SignalColors.HIGH.bgColor);
      expect(html).toContain(SignalColors.MODERATE.bgColor);
      expect(html).toContain(SignalColors.LOW.bgColor);
    });

    it('hero body copy uses EmailColors.text.body token', async () => {
      // Headline + meta colors live inside <EmailHeroBlock> JSX (mocked at
      // the renderAsync boundary in this suite — see EmailHeroBlock unit
      // tests for those assertions). Here we only verify the body-paragraph
      // color flowed through into the inline-template-literal output.
      const { html } = await getCampaignEmailContent(1, baseOptions);
      expect(html).toContain(EmailColors.text.body);
    });
  });
});
