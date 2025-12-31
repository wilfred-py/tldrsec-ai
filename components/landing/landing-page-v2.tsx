import {
  GmailInboxHero,
  FeaturesSectionV2,
  PricingSectionV2,
  CTASectionV2,
  FooterSectionV2
} from './sections-v2';

/**
 * Landing Page V2 Component
 *
 * High-converting landing page with:
 * - Light theme throughout
 * - Stripe-inspired design patterns
 * - Gmail-style interactive inbox hero
 * - Real curated SEC filing summaries
 * - Click-to-preview email functionality
 * - Mobile-first responsive design
 *
 * The hero section now combines:
 * - Marketing messaging ("Summaries That Actually Matter")
 * - Interactive Gmail-style inbox UI
 * - 15 curated real summaries ranked by impact
 * - Click any email to see full AI analysis
 *
 * Controlled by NEXT_PUBLIC_LANDING_V2_ENABLED feature flag
 */
export function LandingPageV2() {
  return (
    <main className="min-h-screen">
      <GmailInboxHero />
      <FeaturesSectionV2 />
      <PricingSectionV2 />
      <CTASectionV2 />
      <FooterSectionV2 />
    </main>
  );
}
