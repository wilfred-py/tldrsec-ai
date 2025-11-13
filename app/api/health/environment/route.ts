import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server-client';

/**
 * Health check endpoint to verify critical environment variables
 * and external service connectivity.
 *
 * Use this during deployment to catch configuration issues early.
 */
export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {} as Record<string, { status: 'ok' | 'error'; message?: string }>
  };

  // Check Supabase URL
  checks.checks.supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('build-placeholder')
    ? { status: 'error', message: 'Using placeholder Supabase URL' }
    : { status: 'ok' };

  // Check Supabase anon key
  checks.checks.supabase_anon_key =
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.includes('fake')
      ? { status: 'error', message: 'Missing or placeholder anon key' }
      : { status: 'ok' };

  // Check Supabase service role key
  checks.checks.supabase_service_key =
    !process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY.includes('fake')
      ? { status: 'error', message: 'Missing or placeholder service role key' }
      : { status: 'ok' };

  // Check Resend API key
  checks.checks.resend_api_key = !process.env.RESEND_API_KEY
    ? { status: 'error', message: 'Missing Resend API key' }
    : { status: 'ok' };

  // Test Supabase connectivity
  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from('newsletter_subscribers').select('id').limit(1);

    checks.checks.supabase_connectivity = error
      ? { status: 'error', message: `Supabase connection failed: ${error.message}` }
      : { status: 'ok' };
  } catch (error) {
    checks.checks.supabase_connectivity = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  // Determine overall health
  const hasErrors = Object.values(checks.checks).some(check => check.status === 'error');
  const status = hasErrors ? 503 : 200;

  return NextResponse.json(checks, { status });
}
