import {
  HeroSectionV2,
  FeaturesSectionV2,
  SummariesShowcaseV2,
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
 * - Z-pattern layout directing eye to CTA
 * - Integrated filing preview in hero
 * - Email inbox animation for summaries showcase
 * - Mobile-first responsive design
 *
 * Controlled by NEXT_PUBLIC_LANDING_V2_ENABLED feature flag
 */
export function LandingPageV2() {
  return (
    <main className="min-h-screen">
      <HeroSectionV2 />
      <FeaturesSectionV2 />
      <SummariesShowcaseV2 />
      <PricingSectionV2 />
      <CTASectionV2 />
      <FooterSectionV2 />
    </main>
  );
}
