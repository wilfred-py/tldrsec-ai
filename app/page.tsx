import type { Metadata } from 'next';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';

// Initial seed value - must match the API endpoint
const INITIAL_SEED = 147;
// Synthetic gap for animation effect - always animate up by this amount
const ANIMATION_GAP = 20;

interface CounterData {
  baseCount: number;  // Starting point for animation (synthetic, 20 less than real)
  realCount: number;  // Current real count (target for animation)
}

// Fetch counter data for SSR - provides both starting point and target
async function getCounterData(): Promise<CounterData> {
  try {
    const supabase = createSupabaseServiceClient();

    // Get current subscriber count
    const { count: currentSubscriberCount } = await supabase
      .from('newsletter_subscribers')
      .select('*', { count: 'exact', head: true });

    const subscriberCount = currentSubscriberCount || 0;

    // Real count = seed + actual subscribers
    const realCount = INITIAL_SEED + subscriberCount;

    // Synthetic base count = real count - 20 (creates animation effect)
    // Minimum base is INITIAL_SEED to never show below seed value
    const baseCount = Math.max(INITIAL_SEED, realCount - ANIMATION_GAP);

    return {
      baseCount,
      realCount
    };

  } catch (error) {
    console.error('[Landing Page] Error fetching counter data:', error);
    return {
      baseCount: INITIAL_SEED,
      realCount: INITIAL_SEED
    };
  }
}

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
  const { baseCount, realCount } = await getCounterData();

  return <FocusedInvestorHero baseCount={baseCount} realCount={realCount} />;
}
