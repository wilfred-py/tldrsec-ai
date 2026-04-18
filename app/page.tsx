import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LandingPageV2 } from '@/components/landing/landing-page-v2';

export const metadata: Metadata = {
  title: 'AI SEC Filing Summaries - 10-K, 10-Q, 8-K & Form 4',
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
    title: 'AI SEC Filing Summaries - 10-K, 10-Q, 8-K & Form 4',
    description: 'Get AI-powered summaries of SEC filings delivered to your inbox. Instant analysis for smarter investment decisions.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI SEC Filing Summaries - 10-K, 10-Q, 8-K & Form 4',
    description: 'Get AI-powered summaries of SEC filings delivered to your inbox. Instant analysis for smarter investment decisions.',
  },
  alternates: {
    canonical: 'https://tldrsec.app',
  },
};

function HeroSkeleton() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      {/* Headline skeleton */}
      <div className="w-full max-w-2xl mx-auto mb-6 space-y-3">
        <div className="h-12 bg-gray-100 rounded-lg animate-pulse mx-auto w-3/4" />
        <div className="h-12 bg-gray-100 rounded-lg animate-pulse mx-auto w-2/3" />
      </div>
      {/* Subhead skeleton */}
      <div className="h-6 bg-gray-100 rounded animate-pulse mx-auto w-2/3 max-w-xl mb-8" />
      {/* CTA skeleton */}
      <div className="flex gap-4 mb-8">
        <div className="h-12 w-48 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-12 w-36 bg-gray-100 rounded-lg animate-pulse" />
      </div>
      {/* Widget skeleton — matches Gmail chrome */}
      <div className="w-full max-w-[min(90vw,1200px)] mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          {/* Toolbar */}
          <div className="h-12 bg-gray-50 border-b border-gray-100 px-4 flex items-center gap-3">
            <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
            <div className="w-20 h-4 bg-gray-200 rounded animate-pulse" />
          </div>
          {/* Email rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[52px] flex items-center gap-3 px-4 border-b border-gray-100">
              <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
              <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
              <div className="w-12 h-4 rounded bg-gray-200 animate-pulse" />
              <div className="flex-1 h-4 rounded bg-gray-200 animate-pulse" style={{ width: `${60 + i * 5}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HeroSkeleton />}>
      <LandingPageV2 />
    </Suspense>
  );
}
