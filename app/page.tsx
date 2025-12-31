import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LandingPage } from '@/components/landing/new-landing-page';
import { LandingPageV2 } from '@/components/landing/landing-page-v2';
import { getCuratedFilings } from '@/lib/data/curated-filings';

/**
 * Landing Page with Feature Flags
 *
 * Feature flags control which landing page version is displayed:
 * - NEXT_PUBLIC_LANDING_PAGE_ENABLED: When 'false', redirects to /waitlist
 * - NEXT_PUBLIC_LANDING_V2_ENABLED: When 'true', shows V2 (light theme) design
 *
 * This allows gradual rollout and A/B testing of the new design.
 */

// Feature flag checks
const isLandingPageEnabled = process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED === 'true';
const isLandingV2Enabled = process.env.NEXT_PUBLIC_LANDING_V2_ENABLED === 'true';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Save 10+ Hours Weekly on SEC Filing Analysis',
    description: 'Stop spending weekends reading SEC filings. Get AI-powered summaries that help you make informed investment decisions on your portfolio companies.',
    keywords: [
      'SEC filing summaries',
      'investment time savings',
      'portfolio analysis',
      'Buffett-style investing',
      'filing alerts',
      'investment decisions'
    ],
    openGraph: {
      title: 'Save 10+ Hours Weekly on SEC Filing Analysis',
      description: 'Stop spending weekends reading SEC filings. Get AI summaries for informed investment decisions.',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Save 10+ Hours Weekly on SEC Filing Analysis',
      description: 'Stop spending weekends reading SEC filings. Get AI summaries for informed investment decisions.',
    },
    alternates: {
      canonical: 'https://tldrsec.app',
    },
  };
}

/**
 * Loading spinner for Suspense fallback
 */
function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

export default async function Home() {
  // Redirect to waitlist if landing page is not enabled
  if (!isLandingPageEnabled) {
    redirect('/waitlist');
  }

  // Use V2 if enabled (light theme, high-converting design)
  if (isLandingV2Enabled) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <LandingPageV2 />
      </Suspense>
    );
  }

  // V1 (existing) landing page with dark theme
  const curatedFilings = await getCuratedFilings();

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="animate-pulse text-slate-400">Loading...</div>
        </div>
      }
    >
      <LandingPage filingPreviews={curatedFilings} />
    </Suspense>
  );
}
