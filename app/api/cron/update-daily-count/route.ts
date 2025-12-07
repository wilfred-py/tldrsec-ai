import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';
import { getPrismaClient } from '@/lib/db/prisma';

// Initial seed value - the starting point for the counter
const INITIAL_SEED = 147;

export async function POST(request: Request) {
  const startTime = Date.now();
  console.log('[Daily Count Update API] Starting cron job at:', new Date().toISOString());

  try {
    // Verify this is a legitimate cron request
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (!cronSecret) {
      console.error('[Daily Count Update API] CRON_SECRET not configured');
      return NextResponse.json({
        success: false,
        error: 'Cron secret not configured'
      }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Daily Count Update API] Unauthorized cron request');
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const prisma = getPrismaClient();
    const supabase = createSupabaseServiceClient();

    // Get tomorrow's date (we're creating the cache for tomorrow's display)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    console.log('[Daily Count Update API] Creating cache for:', tomorrow.toISOString());

    // Check if we already have a cache entry for tomorrow
    const existingEntry = await prisma.dailyWaitlistCache.findUnique({
      where: { date: tomorrow }
    });

    if (existingEntry) {
      console.log('[Daily Count Update API] Cache entry already exists for tomorrow:', existingEntry.baseCount);
      return NextResponse.json({
        success: true,
        message: 'Cache already exists for tomorrow',
        baseCount: existingEntry.baseCount,
        subscriberCountAtEOD: existingEntry.subscriberCountAtEOD,
        date: tomorrow.toISOString(),
        processingTime: Date.now() - startTime
      });
    }

    // Get current total subscriber count from Supabase
    const { count: currentSubscriberCount, error } = await supabase
      .from('newsletter_subscribers')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[Daily Count Update API] Supabase error:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch subscriber count',
        debug: {
          errorMessage: error.message,
          errorCode: error.code
        }
      }, { status: 500 });
    }

    const subscriberCount = currentSubscriberCount || 0;

    // Calculate tomorrow's base count: INITIAL_SEED + total subscribers at EOD
    // This is the starting display value for tomorrow
    const baseCount = INITIAL_SEED + subscriberCount;

    console.log('[Daily Count Update API] Calculating cache values:', {
      initialSeed: INITIAL_SEED,
      currentSubscriberCount: subscriberCount,
      baseCount
    });

    // Create tomorrow's cache entry
    await prisma.dailyWaitlistCache.create({
      data: {
        date: tomorrow,
        baseCount: baseCount,
        subscriberCountAtEOD: subscriberCount
      }
    });

    console.log('[Daily Count Update API] Success:', {
      storedForDate: tomorrow.toISOString(),
      baseCount,
      subscriberCountAtEOD: subscriberCount,
      processingTime: Date.now() - startTime
    });

    return NextResponse.json({
      success: true,
      message: 'Daily count cache created successfully',
      storedForDate: tomorrow.toISOString(),
      initialSeed: INITIAL_SEED,
      subscriberCountAtEOD: subscriberCount,
      baseCount,
      processingTime: Date.now() - startTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('[Daily Count Update API] Critical error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      processingTime
    });

    return NextResponse.json({
      success: false,
      error: 'Critical error during daily count update',
      debug: {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }
    }, { status: 500 });
  }
}

// Also support GET for testing
export async function GET() {
  return NextResponse.json({
    message: 'Daily count update endpoint. Use POST with proper authorization.',
    formula: 'baseCount = 147 + totalSubscribers, display = baseCount + (currentSubscribers - subscriberCountAtEOD)'
  });
}
