/**
 * Behavioural guard for /api/unsubscribe (GET + POST).
 *
 * GET — browser entry from the email body. Returns:
 *   - 410 Gone on missing/invalid tokens
 *   - 500 on transient DB failures
 *   - 307 redirect to /unsubscribe/confirmed on success
 *
 * POST — RFC 8058 one-click. Mail clients (Gmail, Yahoo) POST here when the
 * recipient taps the native unsubscribe button. Returns:
 *   - 410 Gone on missing/invalid tokens
 *   - 500 on transient DB failures
 *   - 200 with no body on success (spec: do NOT redirect, mail client won't follow)
 *
 * Both verbs MUST write `unsubscribed_at` (timestamptz), not `unsubscribed`
 * (which is not a real column on `newsletter_subscribers` and was the cause of
 * a silent zero-unsubs bug pre-fix).
 */

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
import { GET, POST } from '@/app/api/unsubscribe/route';
import { generateUnsubscribeToken } from '@/lib/email/email-link-tokens';

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
  process.env.CRON_SECRET = 'a'.repeat(80);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  eqMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateMock });
});

function makeRequest(url: string): NextRequest {
  const u = new URL(url);
  return { nextUrl: u, url } as unknown as NextRequest;
}

describe('GET /api/unsubscribe', () => {
  it('returns 410 Gone when token is missing', async () => {
    const res = await GET(makeRequest('https://tldrsec.app/api/unsubscribe'));
    expect(res.status).toBe(410);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 410 Gone when token is invalid', async () => {
    const res = await GET(
      makeRequest('https://tldrsec.app/api/unsubscribe?token=not-a-real-token'),
    );
    expect(res.status).toBe(410);
  });

  it('returns 307 to confirmation page on success', async () => {
    const token = generateUnsubscribeToken('user@example.com');
    const res = await GET(
      makeRequest(`https://tldrsec.app/api/unsubscribe?token=${token}`),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/unsubscribe/confirmed?status=success');
  });

  it('returns 500 when the DB update errors', async () => {
    eqMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    const token = generateUnsubscribeToken('user@example.com');
    const res = await GET(
      makeRequest(`https://tldrsec.app/api/unsubscribe?token=${token}`),
    );
    expect(res.status).toBe(500);
  });

  it('writes unsubscribed_at (timestamp), not a non-existent `unsubscribed` boolean', async () => {
    const token = generateUnsubscribeToken('user@example.com');
    await GET(makeRequest(`https://tldrsec.app/api/unsubscribe?token=${token}`));

    expect(updateMock).toHaveBeenCalledTimes(1);
    const update = updateMock.mock.calls[0][0];
    expect(update).toHaveProperty('unsubscribed_at');
    expect(typeof update.unsubscribed_at).toBe('string');
    // ISO timestamp shape — should parse cleanly.
    expect(Number.isNaN(Date.parse(update.unsubscribed_at))).toBe(false);
    expect(update).not.toHaveProperty('unsubscribed');
  });

  it('lowercases + trims the decoded email before lookup', async () => {
    const token = generateUnsubscribeToken('  User@Example.COM  ');
    await GET(makeRequest(`https://tldrsec.app/api/unsubscribe?token=${token}`));

    expect(eqMock).toHaveBeenCalledWith('email', 'user@example.com');
  });
});

describe('POST /api/unsubscribe (RFC 8058 one-click)', () => {
  it('returns 410 Gone when token is missing', async () => {
    const res = await POST(makeRequest('https://tldrsec.app/api/unsubscribe'));
    expect(res.status).toBe(410);
  });

  it('returns 410 Gone when token is invalid', async () => {
    const res = await POST(
      makeRequest('https://tldrsec.app/api/unsubscribe?token=not-a-real-token'),
    );
    expect(res.status).toBe(410);
  });

  it('returns 200 and does not redirect (spec: mail client will not follow)', async () => {
    const token = generateUnsubscribeToken('user@example.com');
    const res = await POST(
      makeRequest(`https://tldrsec.app/api/unsubscribe?token=${token}`),
    );
    expect(res.status).toBe(200);
    // No location header — the route returns directly, not via NextResponse.redirect.
    expect(res.headers.get('location')).toBeNull();
  });

  it('returns 500 when the DB update errors', async () => {
    eqMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    const token = generateUnsubscribeToken('user@example.com');
    const res = await POST(
      makeRequest(`https://tldrsec.app/api/unsubscribe?token=${token}`),
    );
    expect(res.status).toBe(500);
  });

  it('writes unsubscribed_at exactly like GET does', async () => {
    const token = generateUnsubscribeToken('user@example.com');
    await POST(makeRequest(`https://tldrsec.app/api/unsubscribe?token=${token}`));

    expect(updateMock).toHaveBeenCalledTimes(1);
    const update = updateMock.mock.calls[0][0];
    expect(update).toHaveProperty('unsubscribed_at');
    expect(update).not.toHaveProperty('unsubscribed');
  });
});
