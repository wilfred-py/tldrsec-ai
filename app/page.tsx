import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LandingPageV2 } from '@/components/landing/landing-page-v2';
import { PAGE_METADATA } from '@/lib/landing/copy';
import { resolveHeroVariant } from '@/lib/analytics/landing-flags';
import { fetchGlobalMinutesSaved } from '@/lib/db/landing-stats';

// Revalidate every 60s so the global counter's anchor value stays roughly
// fresh without hammering the DB on every visit. Client projects forward
// from the anchor via requestAnimationFrame.
export const revalidate = 60;

export const metadata: Metadata = {
  title: PAGE_METADATA.title,
  description: PAGE_METADATA.description,
  keywords: [...PAGE_METADATA.keywords],
  openGraph: {
    title: PAGE_METADATA.openGraph.title,
    description: PAGE_METADATA.openGraph.description,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_METADATA.twitter.title,
    description: PAGE_METADATA.twitter.description,
  },
  alternates: {
    canonical: PAGE_METADATA.canonical,
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

export default async function Home() {
  // Resolve hero copy experiment variant on the server so first paint matches
  // the hydrated value. Falls back to 'control' on any error path. See
  // lib/analytics/landing-flags.ts and .claude/tasks/landing-copy-rework.md (13A).
  const heroVariant = await resolveHeroVariant();

  // Server-side fetch: at most one DB hit per ISR window.
  // If this fails (DB unreachable, etc.) fall back to zeros so the page still ships.
  let globalStats = { totalMinutes: 0, ratePerSecond: 0 };
  try {
    globalStats = await fetchGlobalMinutesSaved();
  } catch (error) {
    console.error('[landing] Failed to fetch global minutes stats:', error);
  }

  return (
    <Suspense fallback={<HeroSkeleton />}>
      <LandingPageV2 heroVariant={heroVariant} globalStats={globalStats} />
    </Suspense>
  );
}