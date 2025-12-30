import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LandingPage } from '@/components/landing/new-landing-page';
import { getCuratedFilings } from '@/lib/data/curated-filings';

/**
 * Landing Page with Feature Flag
 *
 * When NEXT_PUBLIC_LANDING_PAGE_ENABLED is not 'true', redirects to /waitlist
 * This allows gradual rollout of the new landing page with Stripe integration
 */

// Feature flag check - defaults to showing waitlist (old behavior)
const isLandingPageEnabled = process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED === 'true';

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

export default async function Home() {
  // Redirect to waitlist if new landing page is not enabled
  if (!isLandingPageEnabled) {
    redirect('/waitlist');
  }

  // Get curated filings for the landing page
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
