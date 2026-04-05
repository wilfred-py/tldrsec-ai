import type { Metadata } from 'next';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';

// Force dynamic rendering — Supabase client requires runtime env vars
export const dynamic = 'force-dynamic';

// Initial seed value - must match the API endpoint
const INITIAL_SEED = 147;
// Synthetic gap for animation effect - always animate up by this amount
const ANIMATION_GAP = 20;

interface CounterData {
  baseCount: number; // Starting point for animation (synthetic, 20 less than real)
  realCount: number; // Current real count (target for animation)
}

// Fetch counter data for SSR - provides both starting point and target
async function getCounterData(): Promise<CounterData> {
  try {
    const { createSupabaseServiceClient } = await import('@/lib/supabase/server-client');
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
      realCount,
    };
  } catch (error) {
    console.error('[Waitlist Page] Error fetching counter data:', error);
    return {
      baseCount: INITIAL_SEED,
      realCount: INITIAL_SEED,
    };
  }
}

export const metadata: Metadata = {
  title: 'Join the Waitlist',
  description:
    'Join thousands of investors getting AI-powered SEC filing summaries. Save 10+ hours weekly on filing analysis.',
  keywords: [
    'SEC filing summaries',
    'investment waitlist',
    'portfolio analysis',
    'filing alerts',
    'investment decisions',
  ],
  openGraph: {
    title: 'Join the Waitlist',
    description:
      'Join thousands of investors getting AI-powered SEC filing summaries.',
    type: 'website',
  },
  alternates: {
    canonical: 'https://tldrsec.app/waitlist',
  },
};

export default async function WaitlistPage() {
  const { baseCount, realCount } = await getCounterData();

  return <FocusedInvestorHero baseCount={baseCount} realCount={realCount} />;
}
