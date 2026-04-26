/**
 * Behavioural guard for GET /api/unsubscribe.
 *
 * The SEO fix depends on this endpoint returning:
 *   - 410 Gone on missing/invalid tokens (no redirect chain Google can flag)
 *   - 500 on transient DB failures (so Google retries instead of de-indexing)
 *   - 302 redirect to the confirmation page only on success
 *
 * These tests lock that contract. Prefer hitting the real HMAC helper so we
 * exercise the full token decode path rather than mocking the validator.
 */

// next/server's NextResponse isn't constructible in jsdom test env.
// Lightweight polyfill that preserves the shape the route handler uses.
jest.mock('next/server', () => {
  class NextResponse extends Response {
    static redirect(url: URL | string, status: number = 307) {
      return new NextResponse(null, {
        status,
        headers: { location: url.toString() },
      });
    }
  }
  return { NextResponse, NextRequest: class {} };
});

import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/unsubscribe/route';
import { generateUnsubscribeToken } from '@/lib/email/feedback-tokens';

// Supabase client is the only external dependency. We mock just enough to drive
// the success / DB-error branches.
const updateMock = jest.fn();
const eqMock = jest.fn();
const fromMock = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: fromMock,
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // CRON_SECRET is required by the token helper.
  process.env.CRON_SECRET = 'a'.repeat(80);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  // Default chain: from().update().eq() returns success.
  eqMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateMock });
});

function makeRequest(url: string): NextRequest {
  // The route only reads request.nextUrl.searchParams and request.nextUrl.origin.
  // A URL object exposes both, so this cast is safe for this handler.
  const u = new URL(url);
  return { nextUrl: u, url: url } as unknown as NextRequest;
}

describe('GET /api/unsubscribe', () => {
  it('returns 410 Gone when token is missing', async () => {
    const res = await GET(makeRequest('https://tldrsec.app/api/unsubscribe'));
    expect(res.status).toBe(410);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 410 Gone when token is invalid', async () => {
    const res = await GET(makeRequest('https://tldrsec.app/api/unsubscribe?token=not-a-real-token'));
    expect(res.status).toBe(410);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 302 to confirmation page on success', async () => {
    const token = generateUnsubscribeToken('user@example.com');
    const res = await GET(makeRequest(`https://tldrsec.app/api/unsubscribe?token=${token}`));
    expect(res.status).toBe(307); // NextResponse.redirect defaults to 307
    const location = res.headers.get('location');
    expect(location).toContain('/unsubscribe/confirmed?status=success');
  });

  it('returns 500 when the DB update errors', async () => {
    eqMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    const token = generateUnsubscribeToken('user@example.com');
    const res = await GET(makeRequest(`https://tldrsec.app/api/unsubscribe?token=${token}`));
    expect(res.status).toBe(500);
  });
});
