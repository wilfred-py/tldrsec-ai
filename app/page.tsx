import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LandingPageV2 } from '@/components/landing/landing-page-v2';

export const dynamic = 'force-dynamic';

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

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

export default async function Home() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LandingPageV2 />
    </Suspense>
  );
}
