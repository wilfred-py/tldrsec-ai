/**
 * Behavioural guard for GET /api/feedback.
 *
 * Mirrors __tests__/api/unsubscribe.test.ts. Protects the 410/302/500 contract
 * that the SEO fix for Google's "Redirect error" category relies on.
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
import { GET } from '@/app/api/feedback/route';
import { generateFeedbackToken } from '@/lib/email/email-link-token';

// The token validator enforces UUIDs for userId and summaryId.
const USER_UUID = '11111111-1111-4111-8111-111111111111';
const SUMMARY_UUID = '22222222-2222-4222-8222-222222222222';

const upsertMock = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    emailFeedback: {
      upsert: upsertMock,
    },
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = 'a'.repeat(80);
  upsertMock.mockResolvedValue({ id: 'feedback-id' });
});

function makeRequest(url: string): NextRequest {
  // The route only reads request.nextUrl.searchParams and request.nextUrl.origin.
  // A URL object exposes both, so this cast is safe for this handler.
  const u = new URL(url);
  return { nextUrl: u, url: url } as unknown as NextRequest;
}

describe('GET /api/feedback', () => {
  it('returns 410 Gone when token is missing', async () => {
    const res = await GET(makeRequest('https://tldrsec.app/api/feedback?vote=up'));
    expect(res.status).toBe(410);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 410 Gone when vote is missing', async () => {
    const res = await GET(makeRequest('https://tldrsec.app/api/feedback?token=abc'));
    expect(res.status).toBe(410);
  });

  it('returns 410 Gone when vote value is invalid', async () => {
    const token = generateFeedbackToken(USER_UUID, SUMMARY_UUID);
    const res = await GET(makeRequest(`https://tldrsec.app/api/feedback?token=${token}&vote=sideways`));
    expect(res.status).toBe(410);
  });

  it('returns 410 Gone when token HMAC is invalid', async () => {
    const res = await GET(makeRequest('https://tldrsec.app/api/feedback?token=bogus&vote=up'));
    expect(res.status).toBe(410);
  });

  it('returns 302 to thanks page on success', async () => {
    const token = generateFeedbackToken(USER_UUID, SUMMARY_UUID);
    const res = await GET(makeRequest(`https://tldrsec.app/api/feedback?token=${token}&vote=up`));
    expect(res.status).toBe(307); // NextResponse.redirect defaults to 307
    const location = res.headers.get('location');
    expect(location).toContain('/feedback/thanks?vote=up');
  });

  it('returns 500 when the DB upsert throws', async () => {
    upsertMock.mockRejectedValueOnce(new Error('boom'));
    const token = generateFeedbackToken(USER_UUID, SUMMARY_UUID);
    const res = await GET(makeRequest(`https://tldrsec.app/api/feedback?token=${token}&vote=up`));
    expect(res.status).toBe(500);
  });
});
