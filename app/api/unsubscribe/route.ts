import { NextRequest, NextResponse } from 'next/server';
import { validateUnsubscribeToken } from '@/lib/email/email-link-tokens';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Shared headers for 410 responses: tell crawlers not to cache, and indicate HTML body.
const GONE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
} as const;

function goneResponse(message: string): NextResponse {
  const body = `<!doctype html><meta charset="utf-8"><title>Link expired</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#111}</style><h1>${message}</h1><p>This unsubscribe link is no longer valid. Visit <a href="https://tldrsec.app/">tldrsec.app</a> for the latest.</p>`;
  return new NextResponse(body, { status: 410, headers: GONE_HEADERS });
}

/**
 * GET /api/unsubscribe?token=...
 *
 * Validates an HMAC-signed unsubscribe token from an email link,
 * sets the unsubscribed flag in Supabase, and redirects to
 * a confirmation page. CAN-SPAM/GDPR compliant one-click unsubscribe.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');
  const baseUrl = request.nextUrl.origin;

  if (!token) {
    // 410 Gone (not 302 to a noindex page) so Google drops stale bot hits
    // from the index immediately instead of seeing a redirect-to-noindex chain.
    return goneResponse('Invalid unsubscribe link.');
  }

  // Validate and decode the HMAC token
  const payload = validateUnsubscribeToken(token);
  if (!payload) {
    return goneResponse('Unsubscribe link expired.');
  }

  const { email } = payload;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
    );

    // Set unsubscribed flag (idempotent: already unsubscribed = no-op success)
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed: true })
      .eq('email', email.toLowerCase().trim());

    if (error) {
      console.error('Failed to update unsubscribe status in Supabase:', error);
      return new NextResponse('Unable to process unsubscribe. Please try again later.', {
        status: 500,
      });
    }

    return NextResponse.redirect(
      new URL('/unsubscribe/confirmed?status=success', baseUrl)
    );
  } catch (error) {
    console.error('Unsubscribe endpoint error:', error);
    return new NextResponse('Unable to process unsubscribe. Please try again later.', {
      status: 500,
    });
  }
}
