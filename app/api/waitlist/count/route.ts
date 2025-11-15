import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';
import { getPrismaClient } from '@/lib/db/prisma';

export async function GET() {
  const startTime = Date.now();
  console.log('[Waitlist Count API] Starting request at:', new Date().toISOString());

  try {
    const prisma = getPrismaClient();
    
    // Get today's cached base count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('[Waitlist Count API] Checking for cached daily count for:', today.toISOString());
    
    const cachedEntry = await prisma.dailyWaitlistCache.findUnique({
      where: { date: today }
    });
    
    // If no cache for today, get yesterday's count or use default 147
    let baseCount = 147;
    if (!cachedEntry) {
      console.log('[Waitlist Count API] No cache for today, checking yesterday...');
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const yesterdayEntry = await prisma.dailyWaitlistCache.findUnique({
        where: { date: yesterday }
      });
      
      if (yesterdayEntry) {
        baseCount = yesterdayEntry.baseCount;
        console.log('[Waitlist Count API] Using yesterday\'s base count:', baseCount);
      } else {
        console.log('[Waitlist Count API] No previous cache found, using default 147');
      }
    } else {
      baseCount = cachedEntry.baseCount;
      console.log('[Waitlist Count API] Using cached base count for today:', baseCount);
    }

    // Test environment variables for newsletter subscribers
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Support both SUPABASE_SERVICE_ROLE_KEY (standard) and SUPABASE_SECRET_KEY (legacy)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('[Waitlist Count API] Missing Supabase environment variables');
      return NextResponse.json({
        count: baseCount,
        error: 'Missing configuration',
        debug: {
          baseCount,
          hasSupabaseUrl: !!supabaseUrl,
          hasServiceKey: !!serviceKey,
          hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          hasSecretKey: !!process.env.SUPABASE_SECRET_KEY,
          processingTime: Date.now() - startTime
        }
      });
    }

    // Get current newsletter subscribers count
    console.log('[Waitlist Count API] Creating Supabase client...');
    const supabase = createSupabaseServiceClient();
    
    const { count: subscriberCount, error } = await supabase
      .from('newsletter_subscribers')
      .select('*', { count: 'exact', head: true });

    console.log('[Waitlist Count API] Subscriber query result:', { 
      subscriberCount, 
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
      
      return NextResponse.json({ 
        count: baseCount,
        error: 'Database query failed',
        debug: {
          baseCount,
          errorMessage: error.message,
          errorCode: error.code,
          processingTime: Date.now() - startTime
        }
      });
    }

    // Calculate final count: cached base + current new subscribers
    const totalCount = baseCount + (subscriberCount || 0);
    
    console.log('[Waitlist Count API] Success:', { 
      baseCount,
      subscriberCount, 
      totalCount, 
      processingTime: Date.now() - startTime 
    });
    
    return NextResponse.json({ 
      count: totalCount,
      debug: {
        baseCount,
        subscriberCount,
        totalCount,
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
      count: 147, // Fallback to original default
      error: 'Critical error',
      debug: {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }
    });
  }
}