'use client';

import { NewHeroSection } from './sections/hero-section';
import { FilingPreviewGrid } from './sections/filing-preview-card';
import { NewFeaturesSection } from './sections/features-section';
import { NewPricingSection } from './sections/pricing-section';
import { NewCTASection } from './sections/cta-section';
import { NewFooterSection } from './sections/footer-section';
import type { CuratedFiling } from '@/lib/data/curated-filings';

interface LandingPageProps {
  filingPreviews: CuratedFiling[];
}

/**
 * New Landing Page with Stripe Integration
 *
 * Features:
 * - Hero section with value proposition
 * - Curated filing previews with full summary dialogs
 * - Feature highlights
 * - Pricing section with monthly/annual toggle
 * - Final CTA
 * - Footer
 */
export function LandingPage({ filingPreviews }: LandingPageProps) {
  return (
    <main className="min-h-screen">
      <NewHeroSection />
      <FilingPreviewGrid filings={filingPreviews} />
      <NewFeaturesSection />
      <NewPricingSection />
      <NewCTASection />
      <NewFooterSection />
    </main>
  );
}
