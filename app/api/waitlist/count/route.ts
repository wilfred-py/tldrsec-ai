import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';
import { getPrismaClient } from '@/lib/db/prisma';

// Initial seed value - the starting point for the counter
const INITIAL_SEED = 147;

export async function GET() {
  const startTime = Date.now();
  console.log('[Waitlist Count API] Starting request at:', new Date().toISOString());

  try {
    const prisma = getPrismaClient();

    // Get today's date normalized to midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log('[Waitlist Count API] Checking for cached daily count for:', today.toISOString());

    // Try to get today's cache entry
    let cachedEntry = await prisma.dailyWaitlistCache.findUnique({
      where: { date: today }
    });

    // If no cache for today, try yesterday
    if (!cachedEntry) {
      console.log('[Waitlist Count API] No cache for today, checking yesterday...');
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      cachedEntry = await prisma.dailyWaitlistCache.findUnique({
        where: { date: yesterday }
      });

      if (cachedEntry) {
        console.log('[Waitlist Count API] Using yesterday\'s cache');
      }
    }

    // Get current total subscriber count from Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('[Waitlist Count API] Missing Supabase environment variables');
      // Return cached baseCount or fallback
      const fallbackCount = cachedEntry?.baseCount || INITIAL_SEED;
      return NextResponse.json({
        count: fallbackCount,
        error: 'Missing configuration',
        debug: {
          baseCount: fallbackCount,
          hasSupabaseUrl: !!supabaseUrl,
          hasServiceKey: !!serviceKey,
          processingTime: Date.now() - startTime
        }
      });
    }

    console.log('[Waitlist Count API] Creating Supabase client...');
    const supabase = createSupabaseServiceClient();

    const { count: currentSubscriberCount, error } = await supabase
      .from('newsletter_subscribers')
      .select('*', { count: 'exact', head: true });

    console.log('[Waitlist Count API] Subscriber query result:', {
      currentSubscriberCount,
      error,
      processingTime: Date.now() - startTime
    });

    if (error) {
      console.error('[Waitlist Count API] Supabase error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });

      // Return cached baseCount or fallback on error
      const fallbackCount = cachedEntry?.baseCount || INITIAL_SEED;
      return NextResponse.json({
        count: fallbackCount,
        error: 'Database query failed',
        debug: {
          baseCount: fallbackCount,
          errorMessage: error.message,
          errorCode: error.code,
          processingTime: Date.now() - startTime
        }
      });
    }

    const subscriberCount = currentSubscriberCount || 0;

    // Calculate display count using the correct formula:
    // If we have a cache entry: baseCount + (currentSubscribers - subscriberCountAtEOD)
    // This shows yesterday's total + today's new signups
    //
    // If no cache: INITIAL_SEED + currentSubscribers
    // This is the correct total from scratch

    let displayCount: number;
    let baseCount: number;
    let newSubscribersToday: number;

    if (cachedEntry) {
      baseCount = cachedEntry.baseCount;
      const subscriberCountAtEOD = cachedEntry.subscriberCountAtEOD || 0;
      newSubscribersToday = subscriberCount - subscriberCountAtEOD;

      // baseCount already includes INITIAL_SEED + subscribers up to EOD
      // So we just add the new subscribers since EOD
      displayCount = baseCount + newSubscribersToday;

      console.log('[Waitlist Count API] Using cache formula:', {
        baseCount,
        subscriberCountAtEOD,
        currentSubscribers: subscriberCount,
        newSubscribersToday,
        displayCount
      });
    } else {
      // No cache - calculate from scratch
      baseCount = INITIAL_SEED;
      newSubscribersToday = subscriberCount;
      displayCount = INITIAL_SEED + subscriberCount;

      console.log('[Waitlist Count API] No cache, using fallback formula:', {
        initialSeed: INITIAL_SEED,
        subscriberCount,
        displayCount
      });
    }

    console.log('[Waitlist Count API] Success:', {
      displayCount,
      baseCount,
      newSubscribersToday,
      processingTime: Date.now() - startTime
    });

    return NextResponse.json({
      count: displayCount,
      debug: {
        baseCount,
        currentSubscribers: subscriberCount,
        subscriberCountAtEOD: cachedEntry?.subscriberCountAtEOD || 0,
        newSubscribersToday,
        displayCount,
        hasCacheEntry: !!cachedEntry,
        processingTime: Date.now() - startTime
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('[Waitlist Count API] Critical error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      processingTime
    });

    // Return fallback count with error details
    return NextResponse.json({
      count: INITIAL_SEED,
      error: 'Critical error',
      debug: {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }
    });
  }
}
