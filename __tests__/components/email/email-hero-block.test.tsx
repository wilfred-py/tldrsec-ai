/**
 * EmailHeroBlock unit tests (PR 2 — Hybrid voice).
 *
 * JSX-level tests for the campaign E1 hero. The outer
 * __tests__/email/campaign-rendering.test.tsx mocks renderAsync at the
 * boundary and only asserts that the component was composed in. This suite
 * verifies the actual rendered output: ticker prefix, capHeadline truncation,
 * whyItMatters left-rail, color tokens, and empty-state handling.
 *
 * Mirrors the assertion style of __tests__/components/email/email-formatting.test.tsx.
 */

import { render } from '@testing-library/react';
import { EmailHeroBlock } from '@/components/ui/email/templates/sections/EmailHeroBlock';
import { EmailColors } from '@/components/ui/email/design-system';

describe('<EmailHeroBlock>', () => {
  describe('headline', () => {
    it('renders the headline with a ticker prefix when one is missing', () => {
      const { container } = render(
        <EmailHeroBlock ticker="AAPL" headline="prepaid $4.5B for TSMC capacity through 2028" />,
      );
      expect(container.textContent).toContain(
        'AAPL: prepaid $4.5B for TSMC capacity through 2028',
      );
    });

    it('preserves an existing ticker prefix without duplicating it', () => {
      const { container } = render(
        <EmailHeroBlock ticker="AAPL" headline="AAPL: prepaid $4.5B for TSMC capacity" />,
      );
      // No "AAPL: AAPL:" duplication.
      expect(container.textContent).not.toMatch(/AAPL:\s+AAPL:/);
      expect(container.textContent).toContain('AAPL: prepaid $4.5B for TSMC capacity');
    });

    it('truncates long headlines via capHeadline(90) by default', () => {
      const longHeadline =
        'AAPL announced its largest ever quarterly capital return program plus a refreshed mid-cycle product roadmap';
      const { container } = render(
        <EmailHeroBlock ticker="AAPL" headline={longHeadline} />,
      );
      // Truncated body ends with the ellipsis character …
      expect(container.textContent).toMatch(/…\s*$/);
      // capHeadline cuts at the upper 60% of max — the full original tail
      // ("mid-cycle product roadmap") must NOT appear.
      expect(container.textContent).not.toContain('mid-cycle product roadmap');
    });

    it('respects a custom headlineMaxChars override', () => {
      const headline = 'AAPL: prepaid four point five billion dollars for TSMC capacity through twenty twenty eight';
      const { container } = render(
        <EmailHeroBlock ticker="AAPL" headline={headline} headlineMaxChars={40} />,
      );
      // 40-char cap should kick in well before the full headline length.
      const visible = (container.textContent || '').replace(/\s+/g, ' ').trim();
      expect(visible.length).toBeLessThanOrEqual(40);
      expect(visible).toMatch(/…$/);
    });

    it('renders nothing for the headline row when capHeadline returns empty', () => {
      // capHeadline of '' is still ''; an empty `headline` should render no <h1>.
      const { container } = render(
        <EmailHeroBlock ticker="AAPL" headline="" />,
      );
      expect(container.querySelector('h1')).toBeNull();
    });

    it('uses the EmailColors.text.headline token for the h1 color', () => {
      const { container } = render(
        <EmailHeroBlock ticker="AAPL" headline="prepaid $4.5B for TSMC capacity" />,
      );
      const h1 = container.querySelector('h1');
      expect(h1).not.toBeNull();
      // jsdom normalizes `color: #RRGGBB` to `color: rgb(r, g, b)` in the
      // serialized style attribute. Convert the token to its rgb() form
      // before comparing.
      const hex = EmailColors.text.headline.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      expect(h1!.getAttribute('style')).toContain(`rgb(${r}, ${g}, ${b})`);
    });
  });

  describe('whyItMatters gloss', () => {
    it('renders whyItMatters with a brand-purple left rail when provided', () => {
      const { container } = render(
        <EmailHeroBlock
          ticker="AAPL"
          headline="prepaid $4.5B for TSMC"
          whyItMatters="Locks supply, signals chip-cycle bet two years out."
        />,
      );
      expect(container.textContent).toContain(
        'Locks supply, signals chip-cycle bet two years out.',
      );
      // The brand-purple left rail uses EmailColors.semantic.accent
      // (#7C3AED) on a 3px solid border-left.
      const rail = container.querySelector('div[style*="border-left"]');
      expect(rail).not.toBeNull();
      expect(rail!.getAttribute('style')!.toLowerCase()).toContain(
        EmailColors.semantic.accent.toLowerCase(),
      );
    });

    it('omits the whyItMatters row entirely when prop is undefined', () => {
      const { container } = render(
        <EmailHeroBlock ticker="AAPL" headline="prepaid $4.5B for TSMC" />,
      );
      expect(container.querySelector('div[style*="border-left"]')).toBeNull();
    });

    it('omits the whyItMatters row when prop is an empty string', () => {
      const { container } = render(
        <EmailHeroBlock ticker="AAPL" headline="prepaid $4.5B" whyItMatters="" />,
      );
      expect(container.querySelector('div[style*="border-left"]')).toBeNull();
    });
  });

  describe('escaping', () => {
    it('renders user content as text — JSX auto-escapes hostile input', () => {
      const { container } = render(
        <EmailHeroBlock
          ticker="AAPL"
          headline="<script>alert(1)</script>"
          whyItMatters="<img src=x onerror=alert(2)>"
        />,
      );
      // No raw script/img tags should be in the rendered HTML.
      const html = container.innerHTML;
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<img src=x onerror=alert(2)>');
      // The escaped form survives as text content.
      expect(container.textContent).toContain('<script>alert(1)</script>');
      expect(container.textContent).toContain('<img src=x onerror=alert(2)>');
    });
  });
});
