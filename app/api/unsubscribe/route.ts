import { NextRequest, NextResponse } from 'next/server';
import { validateUnsubscribeToken } from '@/lib/email/feedback-tokens';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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
    return NextResponse.redirect(
      new URL('/unsubscribe/confirmed?status=error&reason=invalid', baseUrl)
    );
  }

  // Validate and decode the HMAC token
  const payload = validateUnsubscribeToken(token);
  if (!payload) {
    return NextResponse.redirect(
      new URL('/unsubscribe/confirmed?status=error&reason=expired', baseUrl)
    );
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
      return NextResponse.redirect(
        new URL('/unsubscribe/confirmed?status=error&reason=error', baseUrl)
      );
    }

    return NextResponse.redirect(
      new URL('/unsubscribe/confirmed?status=success', baseUrl)
    );
  } catch (error) {
    console.error('Unsubscribe endpoint error:', error);
    return NextResponse.redirect(
      new URL('/unsubscribe/confirmed?status=error&reason=error', baseUrl)
    );
  }
}
