/**
 * Single source of truth for marketing copy across the landing surfaces.
 *
 * Surfaces covered:
 *   - Homepage hero       → components/landing/sections-v2/gmail-inbox-hero.tsx
 *   - Waitlist hero       → components/landing/focused-investor-hero.tsx
 *   - Page metadata       → app/page.tsx
 *   - OG image            → app/opengraph-image.tsx
 *   - Structured data     → components/structured-data.tsx
 *   - Features section    → components/landing/sections-v2/features-section-v2.tsx
 *   - CTA section         → components/landing/sections-v2/cta-section-v2.tsx
 *
 * Tests import the same constants — see __tests__/components/landing/.
 */

// ─── Homepage Hero ─────────────────────────────────────────────────────────

/**
 * H1 is rendered with a single emphasized phrase.
 * `text` is the full plain-text version (used for tests, SEO, screen readers).
 * `parts` drives the JSX render — `gradient: true` parts get the editorial
 * italic-accent treatment (.editorial-accent). Field name kept as `gradient`
 * for back-compat with the existing render path; semantics are "emphasized."
 */
export const HOMEPAGE_HERO_H1 = {
  text: 'Every filing. Summarized. Delivered.',
  parts: [
    { text: 'Every filing. Summarized. ', gradient: false },
    { text: 'Delivered', gradient: true },
    { text: '.', gradient: false },
  ],
} as const;

export const HOMEPAGE_HERO_CONTROL = {
  eyebrow: 'For investors and analysts',
  h1: HOMEPAGE_HERO_H1,
  subhead:
    'Every SEC filing your portfolio companies submit, in your inbox minutes after it publishes.',
  trustMetrics: [
    { value: '10 min', label: 'filing-to-inbox' },
    { value: '99.9%', label: 'uptime' },
    { value: 'All types', label: 'of SEC filings' },
  ],
  /**
   * Hero CTA button label varies by auth state.
   * - unauth: not signed in
   * - incompleteOnboarding: signed in but onboarding incomplete
   * - onboarded: signed in and onboarded (currently this state hides the CTA;
   *   string retained for the future "Go to Dashboard" path documented in the vault)
   */
  ctaButton: {
    unauth: 'Get Summaries Like This',
    incompleteOnboarding: 'Complete Setup',
    onboarded: 'Go to Dashboard',
  },
  /**
   * Caption rendered under the CTA, varies by auth state.
   * onboarded users see no caption (empty string).
   */
  caption: {
    unauth: '7-day free trial. Cancel anytime.',
    incompleteOnboarding: 'Just one more step!',
    onboarded: '',
  },
  widgetCaption: 'Click any email to preview',
  widgetHeader: 'SEC Filing Summaries',
} as const;

/**
 * Variant arm of the landing-hero PostHog experiment (`landing-hero-copy-v2`).
 *
 * Retired: both arms now render the control copy. The export is retained so
 * `getHeroCopy('variant')`, the PostHog flag config, and existing test imports
 * keep resolving without churn. Re-introduce a distinct variant by replacing
 * this alias with a new copy bundle.
 */
export const HOMEPAGE_HERO_VARIANT = HOMEPAGE_HERO_CONTROL;

/**
 * Backwards-compatible alias: most call sites still import HOMEPAGE_HERO and
 * always render the control arm. Kept stable so test files and unrelated
 * components don't churn.
 */
export const HOMEPAGE_HERO = HOMEPAGE_HERO_CONTROL;

export type HeroVariant = 'control' | 'variant';

/**
 * Resolve the hero copy bundle for a given experiment variant.
 *
 * Falls back to control on any unrecognized value so the public landing page
 * is robust against (a) PostHog returning an unexpected flag value, (b) a
 * future rename of variant keys, and (c) misuse of the prop type.
 */
export function getHeroCopy(variant: HeroVariant | string | null | undefined) {
  return variant === 'variant' ? HOMEPAGE_HERO_VARIANT : HOMEPAGE_HERO_CONTROL;
}

// ─── Waitlist Hero ─────────────────────────────────────────────────────────

/**
 * Waitlist H1 has a colored highlight on the trailing phrase.
 */
/**
 * Waitlist hero — aligned with the Form-4 / insider-buying wedge framing
 * that the homepage variant arm uses (decision 2A: align /waitlist with /).
 * Coherent positioning across the two marketing surfaces; distinct subhead
 * because waitlist is pre-launch (email capture) rather than trial signup.
 */
export const WAITLIST_HERO_H1 = {
  text: 'Know when insiders buy. Understand every filing your portfolio companies publish.',
  parts: [
    { text: 'Know when ', highlight: false },
    { text: 'insiders buy', highlight: true },
    { text: '. Understand ', highlight: false },
    { text: 'every filing', highlight: true },
    { text: ' your portfolio companies publish.', highlight: false },
  ],
} as const;

export const WAITLIST_HERO_SUBHEAD = {
  text: 'AI summaries on every filing your portfolio companies publish — minutes after they hit EDGAR. Be first to access.',
  parts: [
    { text: 'AI summaries on every filing', highlight: true },
    { text: ' your portfolio companies publish — minutes after they hit EDGAR. Be first to access.', highlight: false },
  ],
} as const;

export const WAITLIST_HERO = {
  h1: WAITLIST_HERO_H1,
  subhead: WAITLIST_HERO_SUBHEAD,
} as const;

// ─── Page Metadata (app/page.tsx) ──────────────────────────────────────────

export const PAGE_METADATA = {
  title: 'Insider Trades + SEC Filings From Your Portfolio | tldrSEC',
  description:
    'AI summaries on every SEC filing your portfolio companies publish — annual reports, quarterlies, insider trades, and material events — minutes after they hit EDGAR.',
  keywords: [
    'insider trading alerts',
    'Form 4 summaries',
    'SEC filing summary',
    '10-K summary',
    '10-Q summary',
    '8-K filing summary',
    'portfolio filing alerts',
    'SEC filing analysis',
    'AI financial analysis',
    'investment research tool',
    'SEC EDGAR summary',
    'earnings report summary',
  ],
  openGraph: {
    title: 'Insider Trades + SEC Filings From Your Portfolio | tldrSEC',
    description:
      'AI summaries on every filing your portfolio companies publish — including insider trades from Form 4 — minutes after they hit EDGAR.',
  },
  twitter: {
    title: 'Insider Trades + SEC Filings From Your Portfolio | tldrSEC',
    description:
      'AI summaries on every filing your portfolio companies publish — including insider trades from Form 4 — minutes after they hit EDGAR.',
  },
  canonical: 'https://tldrsec.app',
} as const;

// ─── OG Image (app/opengraph-image.tsx) ────────────────────────────────────

export const OG_IMAGE = {
  alt: 'tldrSEC - Insider Trades and SEC Filings From Your Portfolio',
  headline: 'Know when insiders buy.',
  subhead: 'AI summaries on every filing your portfolio companies publish.',
  // Recognition affordances for SEC-savvy readers; retained from prior design.
  filingTypeChips: ['10-K', '10-Q', '8-K', 'Form 4', '13F'] as const,
} as const;

// ─── Structured Data (components/structured-data.tsx) ──────────────────────

export const STRUCTURED_DATA = {
  websiteDescription:
    'AI summaries on every SEC filing your portfolio companies publish — including insider trades from Form 4 — minutes after they hit EDGAR.',
  organizationDescription:
    'AI-powered SEC filing analysis for smarter investment decisions.',
} as const;

// ─── Features Section ──────────────────────────────────────────────────────

export const FEATURES_SECTION = {
  heading: 'Built for Modern Investors',
  subhead:
    'Everything you need to stay informed about the companies you care about.',
  cards: [
    {
      title: '300+ Pages → 2 Minutes',
      description:
        'Our AI distills lengthy SEC filings into clear, actionable summaries you can read in minutes.',
    },
    {
      title: 'Real-Time Monitoring',
      description:
        'Get notified the moment a company you track files with the SEC. Never miss critical updates.',
    },
    {
      title: 'Smart Notifications',
      description:
        'Customize alerts by filing type, company, or keywords. Only get what matters to you.',
    },
    {
      // Renamed from "Filing-Type Analysis" — frame alignment (decision 7A,
      // Form-4 / insider-buying wedge).
      title: 'Insider-Trade Tracking',
      description:
        'Form 4 trades from officers and 10%+ holders, summarized the moment they file. Other tools miss this.',
    },
    {
      // Renamed from "Investment-Grade Quality" — compliance vocabulary scrub
      // (decision 5A: "investment-grade" is a credit-rating term of art).
      title: 'Source-Cited Accuracy',
      description:
        'Every claim links to the original SEC filing line. Trust the read; verify with one click.',
    },
    {
      title: 'Save 10+ Hours Weekly',
      description:
        'Stop spending weekends reading filings. Get back your time for actual analysis.',
    },
  ],
} as const;

// ─── CTA Section ───────────────────────────────────────────────────────────

export const CTA_SECTION = {
  heading: 'Start tracking insiders in your portfolio.',
  body:
    "Get an analyst's read on every filing — and know the moment insiders buy.",
  buttonLabel: 'Get Started',
  trustPoints: [
    '7-day free trial',
    'Start with unlimited tickers',
    'Cancel anytime',
  ],
} as const;
