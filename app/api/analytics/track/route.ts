import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimiter } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logging';

export const dynamic = 'force-dynamic';

const apiLogger = logger.child('analytics-track');

async function getSupabase() {
  const { createSupabaseServiceClient } = await import('@/lib/supabase/server-client');
  return createSupabaseServiceClient();
}

const BodySchema = z.object({
  page_variant: z.string().min(1).max(64),
  visitor_id: z.string().min(1).max(64),
  action: z.string().min(1).max(64),
  utm_source: z.string().max(128).nullish(),
  utm_medium: z.string().max(128).nullish(),
  utm_campaign: z.string().max(128).nullish(),
  referrer: z.string().max(2048).nullish(),
});

function getClientIp(request: NextRequest): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return request.headers.get('x-real-ip');
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request) ?? 'unknown';

  const rl = await rateLimiter.checkLimit('analytics-track', ip, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const body = parsed.data;
  const userAgent = request.headers.get('user-agent')?.slice(0, 512) ?? null;

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('page_analytics').insert({
      page_variant: body.page_variant,
      visitor_id: body.visitor_id,
      action: body.action,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      user_agent: userAgent,
      referrer: body.referrer ?? null,
      ip_address: ip === 'unknown' ? null : ip,
    });

    if (error) {
      apiLogger.error('insert failed', { code: error.code, message: error.message });
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
    }
  } catch (error) {
    apiLogger.error('unhandled error', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
