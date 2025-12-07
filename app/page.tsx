import type { Metadata } from 'next';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';
import { getPrismaClient } from '@/lib/db/prisma';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';

// Initial seed value - must match the API endpoint
const INITIAL_SEED = 147;

// Fetch the initial count for SSR
async function getInitialCount(): Promise<number> {
  try {
    const prisma = getPrismaClient();

    // Get today's date normalized to midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Try to get today's cache entry
    let cachedEntry = await prisma.dailyWaitlistCache.findUnique({
      where: { date: today }
    });

    // If no cache for today, try yesterday
    if (!cachedEntry) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      cachedEntry = await prisma.dailyWaitlistCache.findUnique({
        where: { date: yesterday }
      });
    }

    // Get current subscriber count
    const supabase = createSupabaseServiceClient();
    const { count: currentSubscriberCount } = await supabase
      .from('newsletter_subscribers')
      .select('*', { count: 'exact', head: true });

    const subscriberCount = currentSubscriberCount || 0;

    if (cachedEntry) {
      const subscriberCountAtEOD = cachedEntry.subscriberCountAtEOD || 0;
      const newSubscribersToday = subscriberCount - subscriberCountAtEOD;
      return cachedEntry.baseCount + newSubscribersToday;
    }

    // No cache - calculate from scratch
    return INITIAL_SEED + subscriberCount;

  } catch (error) {
    console.error('[Landing Page] Error fetching initial count:', error);
    return INITIAL_SEED;
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
  const initialCount = await getInitialCount();

  return <FocusedInvestorHero initialCount={initialCount} />;
}
