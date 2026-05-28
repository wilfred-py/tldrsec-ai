import { NextRequest, NextResponse } from 'next/server';
import { validateUnsubscribeToken } from '@/lib/email/email-link-tokens';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const GONE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
} as const;

function goneResponse(message: string): NextResponse {
  const body = `<!doctype html><meta charset="utf-8"><title>Link expired</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#111}</style><h1>${message}</h1><p>This unsubscribe link is no longer valid. Visit <a href="https://tldrsec.app/">tldrsec.app</a> for the latest.</p>`;
  return new NextResponse(body, { status: 410, headers: GONE_HEADERS });
}

type UnsubResult =
  | { kind: 'gone'; message: string }
  | { kind: 'error' }
  | { kind: 'ok' };

async function processUnsubscribe(token: string | null): Promise<UnsubResult> {
  if (!token) return { kind: 'gone', message: 'Invalid unsubscribe link.' };

  const payload = validateUnsubscribeToken(token);
  if (!payload) return { kind: 'gone', message: 'Unsubscribe link expired.' };

  const { email } = payload;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
    );

    // Idempotent: re-setting the timestamp on an already-unsubscribed row is a
    // no-op from the recipient's perspective. The column is `unsubscribed_at`
    // (timestamp), not a `unsubscribed` boolean — writing to a non-existent
    // column was the original silent-fail bug.
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('email', email.toLowerCase().trim());

    if (error) {
      console.error('Failed to update unsubscribe status in Supabase:', error);
      return { kind: 'error' };
    }

    return { kind: 'ok' };
  } catch (error) {
    console.error('Unsubscribe endpoint error:', error);
    return { kind: 'error' };
  }
}

/**
 * GET /api/unsubscribe?token=...
 *
 * Browser entry point — recipient clicked the unsubscribe link in the email
 * body. Validates the HMAC token, sets `unsubscribed_at`, redirects to the
 * confirmation page.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const result = await processUnsubscribe(token);
  const baseUrl = request.nextUrl.origin;

  switch (result.kind) {
    case 'gone':
      return goneResponse(result.message);
    case 'error':
      return new NextResponse('Unable to process unsubscribe. Please try again later.', {
        status: 500,
      });
    case 'ok':
      return NextResponse.redirect(
        new URL('/unsubscribe/confirmed?status=success', baseUrl)
      );
  }
}

/**
 * POST /api/unsubscribe?token=...
 *
 * RFC 8058 one-click handler. Mail clients (Gmail, Yahoo) POST here when the
 * recipient clicks the native unsubscribe button in the message header — the
 * one paired with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Spec
 * requires a 2xx response with no redirect: the mail client never renders a
 * page, it just shows a confirmation toast in the inbox UI.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const result = await processUnsubscribe(token);

  switch (result.kind) {
    case 'gone':
      // Same 410 the GET path returns — body is irrelevant to one-click clients
      // but kept for parity with direct curl/debug use.
      return goneResponse(result.message);
    case 'error':
      return new NextResponse('Unable to process unsubscribe. Please try again later.', {
        status: 500,
      });
    case 'ok':
      // 200 with no body. RFC 8058: do NOT redirect — the mail client won't follow.
      return new NextResponse(null, { status: 200 });
  }
}
