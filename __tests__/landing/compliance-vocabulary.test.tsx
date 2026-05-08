/**
 * Compliance-vocabulary regression guard for landing surfaces.
 *
 * Prevents marketing copy from drifting back into language that reads as
 * investment advice or implies a regulated credential. Scans rendered output
 * of hero / CTA / features / footer for forbidden tokens; the allowlist
 * captures intentional regulatory phrasing (e.g. "is not investment advice"
 * in the footer disclaimer).
 *
 * See .claude/tasks/landing-copy-rework.md, decision 5A.
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mocks shared across rendered components — keep aligned with existing
// per-component test files (gmail-inbox-hero, cta-section-v2, features-section-v2).
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSignedIn: false, isLoaded: true, isOnboarded: false }),
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLDivElement>) => <div ref={ref} {...props}>{children}</div>
    ),
    h1: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h1 {...props}>{children}</h1>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <p {...props}>{children}</p>,
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
    section: React.forwardRef(
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLElement>) => <section ref={ref} {...props}>{children}</section>
    ),
    article: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <article {...props}>{children}</article>,
    button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, transition, whileHover, whileTap, onMouseEnter, onMouseLeave, variants, ...rest } = props as Record<string, unknown>;
      return <button {...rest}>{children}</button>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => false,
}));

jest.mock('@/lib/animations/landing-animations', () => ({
  staggerContainer: {},
  staggerItem: {},
  viewportOnce: {},
  meshGradientStyle: {},
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { GmailInboxHero } = require('@/components/landing/sections-v2/gmail-inbox-hero');
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { CTASectionV2 } = require('@/components/landing/sections-v2/cta-section-v2');
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { FeaturesSectionV2 } = require('@/components/landing/sections-v2/features-section-v2');
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { FooterSectionV2 } = require('@/components/landing/sections-v2/footer-section-v2');

/**
 * Forbidden vocabulary on landing surfaces.
 *
 * - "investment-grade" / "investment grade": credit-rating term of art (BBB-/Baa3+),
 *   misappropriated as a quality claim.
 * - "investment analyst": registered-role term under FINRA Rule 2241.
 * - "professional-grade" / "professional grade": implies a credential the
 *   company does not hold.
 * - "recommendation" / "recommend": implies advisory action; we summarize.
 * - "advice": implies advisory action.
 * - "Wall Street analyst": repels the value-investor target persona AND
 *   commoditizes against peers (Quartr, AlphaSense, Stratosphere, etc.).
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /investment[-\s]grade/gi, label: 'investment-grade (credit-rating term)' },
  { pattern: /investment\s+analyst/gi, label: 'investment analyst (FINRA registered role)' },
  { pattern: /professional[-\s]grade/gi, label: 'professional-grade (implied credential)' },
  { pattern: /\brecommend(ation|ed|s)?\b/gi, label: 'recommend/recommendation (advisory verb)' },
  { pattern: /\badvice\b/gi, label: 'advice (advisory noun)' },
  { pattern: /Wall\s+Street\s+analyst/gi, label: 'Wall Street analyst (persona repellent)' },
];

/**
 * Allowlist of intentional phrases. Each entry must have a one-line rationale
 * comment. Every match in rendered output that overlaps an allowed phrase is
 * permitted; everything else fails the test.
 *
 * Lifecycle: each entry should be deletable when the underlying surface is
 * rewritten. Removing an entry hardens the guard.
 */
const ALLOWED_PHRASES: ReadonlyArray<{ phrase: string; reason: string }> = [
  {
    // Footer regulatory disclaimer — the SEC/FINRA convention is to use the word
    // "advice" specifically to negate it. Removing this string would WEAKEN
    // the compliance posture, not strengthen it.
    phrase: 'is not investment advice',
    reason: 'footer regulatory disclaimer — intentional negation of the term',
  },
  // (Removed in step 5 of landing-copy-rework: the "Investment-Grade Quality"
  // feature card was renamed to "Source-Cited Accuracy" per decision 5A. The
  // guard now actively catches any reintroduction of the credit-rating term.)
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove all allowlisted phrases from `text` so the forbidden-pattern scan
 * sees only un-allowlisted occurrences.
 */
function scrubAllowed(text: string, allowed: ReadonlyArray<{ phrase: string }>): string {
  return allowed.reduce(
    (acc, { phrase }) => acc.replace(new RegExp(escapeRegex(phrase), 'gi'), ' '),
    text
  );
}

function findViolations(text: string): Array<{ label: string; matches: string[] }> {
  const scrubbed = scrubAllowed(text, ALLOWED_PHRASES);
  return FORBIDDEN_PATTERNS
    .map(({ pattern, label }) => {
      const matches = [...scrubbed.matchAll(pattern)].map((m) => m[0]);
      return { label, matches };
    })
    .filter((r) => r.matches.length > 0);
}

describe('Landing compliance vocabulary guard', () => {
  it('hero copy contains no forbidden vocabulary (excluding allowlist)', () => {
    const { container } = render(<GmailInboxHero />);
    const text = container.textContent ?? '';
    const violations = findViolations(text);
    expect(violations).toEqual([]);
  });

  it('CTA section contains no forbidden vocabulary (excluding allowlist)', () => {
    const { container } = render(<CTASectionV2 />);
    const text = container.textContent ?? '';
    const violations = findViolations(text);
    expect(violations).toEqual([]);
  });

  it('features section contains no forbidden vocabulary (excluding allowlist)', () => {
    const { container } = render(<FeaturesSectionV2 />);
    const text = container.textContent ?? '';
    const violations = findViolations(text);
    expect(violations).toEqual([]);
  });

  it('footer contains no forbidden vocabulary (excluding allowlist)', () => {
    const { container } = render(<FooterSectionV2 />);
    const text = container.textContent ?? '';
    const violations = findViolations(text);
    expect(violations).toEqual([]);
  });

  it('footer disclaimer is present (positive assertion — the allowlisted phrase must actually exist)', () => {
    // If the footer ever drops "is not investment advice", the allowlist
    // becomes a free pass for forbidden vocabulary elsewhere. Catch that.
    const { container } = render(<FooterSectionV2 />);
    expect(container.textContent).toContain('is not investment advice');
  });

  describe('guard self-check (sanity tests on the scrubber + matcher)', () => {
    it('detects forbidden vocabulary in unscrubbed text', () => {
      const text = 'This is professional-grade research with a recommendation.';
      const violations = findViolations(text);
      expect(violations.length).toBeGreaterThanOrEqual(2);
      expect(violations.map((v) => v.label)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/professional-grade/),
          expect.stringMatching(/recommend/),
        ])
      );
    });

    it('does not flag allowlisted phrases', () => {
      // Only "is not investment advice" remains allowlisted after step 5 of
      // landing-copy-rework (the "Investment-Grade Quality" feature card was
      // renamed to "Source-Cited Accuracy"). The bare "advice" elsewhere in
      // this string would normally be flagged — the allowlist swallows it
      // when it appears as part of the disclaimer phrase.
      const text = 'This service is not investment advice. Read the summary at your own discretion.';
      const violations = findViolations(text);
      expect(violations).toEqual([]);
    });

    it('flags forbidden vocabulary outside an allowlisted phrase', () => {
      // "investment advice" is allowlisted only inside "is not investment advice".
      // Bare "advice" elsewhere must still be caught.
      const text = 'Get personalized advice from our team.';
      const violations = findViolations(text);
      expect(violations.length).toBe(1);
      expect(violations[0].label).toMatch(/advice/);
    });
  });
});
