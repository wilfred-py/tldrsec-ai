import { NextRequest, NextResponse } from 'next/server';
import { LockService } from '@/lib/job-queue/lock-service';
import { DistributedLockManager } from '@/lib/db/distributed-lock';

// Simple in-memory rate limiting (resets on cold start)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // max 10 calls per hour
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const key = 'force-cleanup';
  const stored = rateLimitStore.get(key);

  if (!stored || now > stored.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetTime: now + RATE_LIMIT_WINDOW };
  }

  if (stored.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetTime: stored.resetTime };
  }

  stored.count++;
  return { allowed: true, remaining: RATE_LIMIT - stored.count, resetTime: stored.resetTime };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Authentication
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.ADMIN_API_SECRET;

  if (!authHeader || !expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providedSecret = authHeader.replace('Bearer ', '');
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limiting
  const rateLimit = checkRateLimit();
  const rateLimitHeaders = {
    'X-RateLimit-Limit': RATE_LIMIT.toString(),
    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
    'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
  };

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetTime: rateLimit.resetTime },
      { status: 429, headers: rateLimitHeaders }
    );
  }

  try {
    // Parse query params - use URL constructor for better compatibility with tests
    const url = new URL(request.url);
    const includeAdvisory = url.searchParams.get('includeAdvisory') === 'true';
    const source = url.searchParams.get('source') || 'manual';

    // Execute force cleanup
    const locksCleared = await LockService.forceCleanupAllLocks();

    // Optionally release advisory locks
    let advisoryLocksReleased = false;
    if (includeAdvisory) {
      await DistributedLockManager.emergencyReleaseAllAdvisoryLocks();
      advisoryLocksReleased = true;
    }

    // Get current health metrics
    const healthMetrics = await LockService.getLockHealthMetrics();

    const duration = Date.now() - startTime;

    // Log cleanup action (no Slack - avoid spam)
    if (locksCleared > 0 || advisoryLocksReleased) {
      console.log('[ForceCleanup] Executed:', {
        source,
        locksCleared,
        advisoryLocksReleased,
        duration,
        remainingStale: healthMetrics.staleLocksCount || 0,
      });
    }

    return NextResponse.json(
      {
        success: true,
        locksCleared,
        advisoryLocksReleased,
        healthMetrics,
        duration,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Force cleanup failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers: rateLimitHeaders }
    );
  }
}
