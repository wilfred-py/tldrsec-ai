'use client';

import { useRef } from 'react';
import {
  GmailInboxHero,
  FeaturesSectionV2,
  PricingSectionV2,
  FAQSectionV2,
  CTASectionV2,
  FooterSectionV2
} from './sections-v2';
import { LandingNavbar } from './landing-navbar';
import { AuthProvider } from '@/contexts/auth-context';
import { SubscriptionProvider } from '@/contexts/subscription-context';

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
 * - Scroll-aware sticky navbar (appears after scrolling past hero)
 * - Personalized experience for authenticated users
 *
 * The hero section now combines:
 * - Marketing messaging ("Summaries That Actually Matter")
 * - Interactive Gmail-style inbox UI
 * - 15 curated real summaries ranked by impact
 * - Click any email to see full AI analysis
 *
 */
export function LandingPageV2() {
  // Ref for hero section - used by navbar's Intersection Observer
  const heroRef = useRef<HTMLElement>(null);

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <main className="min-h-screen">
          {/* Scroll-aware navbar - appears when hero exits viewport */}
          <LandingNavbar heroRef={heroRef} />

          {/* Hero section with ref for navbar visibility tracking */}
          <GmailInboxHero heroRef={heroRef} />

          <FeaturesSectionV2 />
          <PricingSectionV2 />
          <FAQSectionV2 />
          <CTASectionV2 />
          <FooterSectionV2 />
        </main>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
