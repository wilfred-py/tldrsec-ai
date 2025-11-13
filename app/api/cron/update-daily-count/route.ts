import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';
import { getPrismaClient } from '@/lib/db/prisma';

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

    // Get today's date (end of day calculation)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('[Daily Count Update API] Calculating final count for:', today.toISOString());

    // Check if we already have a cache entry for today
    const existingEntry = await prisma.dailyWaitlistCache.findUnique({
      where: { date: today }
    });

    if (existingEntry) {
      console.log('[Daily Count Update API] Cache entry already exists for today:', existingEntry.baseCount);
      return NextResponse.json({ 
        success: true, 
        message: 'Cache already exists for today',
        baseCount: existingEntry.baseCount,
        date: today.toISOString(),
        processingTime: Date.now() - startTime
      });
    }

    // Get current total subscriber count
    const { count: subscriberCount, error } = await supabase
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

    // Get yesterday's base count or use default 147
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const yesterdayEntry = await prisma.dailyWaitlistCache.findUnique({
      where: { date: yesterday }
    });

    const yesterdayBaseCount = yesterdayEntry?.baseCount || 147;
    
    // Calculate today's final count: yesterday's base + today's total subscribers
    const finalCount = yesterdayBaseCount + (subscriberCount || 0);

    console.log('[Daily Count Update API] Calculating final count:', {
      yesterdayBaseCount,
      subscriberCount,
      finalCount
    });

    // Store today's final count as tomorrow's base
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if tomorrow's cache already exists
    const tomorrowEntry = await prisma.dailyWaitlistCache.findUnique({
      where: { date: tomorrow }
    });

    if (!tomorrowEntry) {
      await prisma.dailyWaitlistCache.create({
        data: {
          date: tomorrow,
          baseCount: finalCount
        }
      });
    }

    console.log('[Daily Count Update API] Success:', {
      calculatedForDate: today.toISOString(),
      storedForDate: tomorrow.toISOString(),
      yesterdayBase: yesterdayBaseCount,
      todaySubscribers: subscriberCount,
      tomorrowBase: finalCount,
      processingTime: Date.now() - startTime
    });

    return NextResponse.json({
      success: true,
      message: 'Daily count updated successfully',
      calculatedForDate: today.toISOString(),
      storedForDate: tomorrow.toISOString(),
      yesterdayBase: yesterdayBaseCount,
      todaySubscribers: subscriberCount,
      tomorrowBase: finalCount,
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
    message: 'Daily count update endpoint. Use POST with proper authorization.' 
  });
}