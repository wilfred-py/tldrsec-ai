import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LandingPageV2 } from '@/components/landing/landing-page-v2';

export const metadata: Metadata = {
  title: 'AI SEC Filing Summaries - 10-K, 10-Q, 8-K & Form 4 | tldrSEC',
  description: 'Get AI-powered summaries of SEC filings delivered to your inbox. Instant analysis of 10-K annual reports, 10-Q quarterly filings, 8-K events, and Form 4 insider trades for smarter investment decisions.',
  keywords: [
    'SEC filing summary',
    '10-K summary',
    '10-Q summary',
    '8-K filing summary',
    'Form 4 insider trading',
    'SEC filing analysis',
    'AI financial analysis',
    'SEC filing alerts',
    'earnings report summary',
    'investment research tool',
    'SEC EDGAR summary',
    'portfolio filing alerts',
  ],
  openGraph: {
    title: 'AI SEC Filing Summaries - 10-K, 10-Q, 8-K & Form 4 | tldrSEC',
    description: 'Get AI-powered summaries of SEC filings delivered to your inbox. Instant analysis for smarter investment decisions.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI SEC Filing Summaries - 10-K, 10-Q, 8-K & Form 4 | tldrSEC',
    description: 'Get AI-powered summaries of SEC filings delivered to your inbox. Instant analysis for smarter investment decisions.',
  },
  alternates: {
    canonical: 'https://tldrsec.app',
  },
};

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LandingPageV2 />
    </Suspense>
  );
}
