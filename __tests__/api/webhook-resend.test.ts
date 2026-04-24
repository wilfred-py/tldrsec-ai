/**
 * Tests for the Resend webhook route (POST /api/webhook?provider=resend).
 *
 * Coverage:
 * - Missing Svix headers → 400
 * - Invalid signature → 400 (verified via mocked svix)
 * - Valid email.opened → captureServerEvent('email_opened', {...tags})
 * - Valid email.clicked → captureServerEvent('email_clicked', {...tags, link})
 * - Tag attribution: userId / template / formType / ticker / filingId are
 *   lifted from the tag payload onto PostHog event properties.
 * - Events without userId are acknowledged (200) but NOT forwarded to PostHog.
 */

import { EVENTS } from '@/lib/analytics/events';

// Mock svix so we don't have to generate real signatures in tests.
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation((secret: string) => ({
    verify: jest.fn((body: string, _headers: Record<string, string>) => {
      if (secret === '__invalid__') {
        throw new Error('signature verification failed');
      }
      return JSON.parse(body);
    }),
  })),
}));

// Mock PostHog capture so we can assert on what was sent.
const captureServerEventMock = jest.fn();
jest.mock('@/lib/analytics/posthog-server', () => ({
  captureServerEvent: (...args: unknown[]) => captureServerEventMock(...args),
  shutdownServerPostHog: jest.fn().mockResolvedValue(undefined),
}));

// @vercel/functions.waitUntil needs to be a no-op in tests.
jest.mock('@vercel/functions', () => ({
  waitUntil: jest.fn(),
}));

// Stub all prisma usage inside the webhook route.
jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: () => ({}),
}));

const ORIGINAL_ENV = { ...process.env };

async function loadRoute() {
  // Reset module registry so env var changes take effect.
  jest.resetModules();
  return await import('@/app/api/webhook/route');
}

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  const url = new URL('https://example.com/api/webhook?provider=resend');
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_test_1',
      'svix-timestamp': String(Date.now()),
      'svix-signature': 'v1,fake',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/webhook?provider=resend', () => {
  beforeEach(() => {
    captureServerEventMock.mockReset();
    process.env = { ...ORIGINAL_ENV, RESEND_WEBHOOK_SECRET: 'whsec_testing' };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns 500 when RESEND_WEBHOOK_SECRET is missing', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ type: 'email.opened', data: {} }) as never);
    expect(res.status).toBe(500);
  });

  it('returns 400 when Svix headers are missing', async () => {
    const { POST } = await loadRoute();
    const req = makeReq({ type: 'email.opened', data: {} }, {
      'svix-id': '',
      'svix-timestamp': '',
      'svix-signature': '',
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signature verification fails', async () => {
    process.env.RESEND_WEBHOOK_SECRET = '__invalid__';
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ type: 'email.opened', data: {} }) as never);
    expect(res.status).toBe(400);
  });

  it('routes email.opened → captureServerEvent(EMAIL_OPENED) with lifted tags', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeReq({
      type: 'email.opened',
      data: {
        email_id: 'em_abc123',
        tags: {
          userId: 'user_42',
          template: '8k_minimalist',
          formType: '8-K',
          ticker: 'AAPL',
          filingId: 'f_9001',
        },
      },
    }) as never);
    expect(res.status).toBe(200);
    expect(captureServerEventMock).toHaveBeenCalledTimes(1);
    expect(captureServerEventMock).toHaveBeenCalledWith(
      'user_42',
      EVENTS.EMAIL_OPENED,
      expect.objectContaining({
        email_id: 'em_abc123',
        template: '8k_minimalist',
        form_type: '8-K',
        ticker: 'AAPL',
        filing_id: 'f_9001',
      }),
    );
  });

  it('routes email.clicked → captureServerEvent(EMAIL_CLICKED) with link', async () => {
    const { POST } = await loadRoute();
    await POST(makeReq({
      type: 'email.clicked',
      data: {
        email_id: 'em_click1',
        tags: {
          userId: 'user_7',
          template: '10k_minimalist',
          formType: '10-K',
          ticker: 'MSFT',
          filingId: 'f_42',
        },
        click: { link: 'https://tldrsec.app/summary/abc' },
      },
    }) as never);
    expect(captureServerEventMock).toHaveBeenCalledWith(
      'user_7',
      EVENTS.EMAIL_CLICKED,
      expect.objectContaining({
        email_id: 'em_click1',
        template: '10k_minimalist',
        link: 'https://tldrsec.app/summary/abc',
      }),
    );
  });

  it('accepts tags in array {name,value} form', async () => {
    const { POST } = await loadRoute();
    await POST(makeReq({
      type: 'email.opened',
      data: {
        email_id: 'em_array',
        tags: [
          { name: 'userId', value: 'user_xyz' },
          { name: 'template', value: 'form4_minimalist' },
          { name: 'ticker', value: 'NVDA' },
        ],
      },
    }) as never);
    expect(captureServerEventMock).toHaveBeenCalledWith(
      'user_xyz',
      EVENTS.EMAIL_OPENED,
      expect.objectContaining({
        template: 'form4_minimalist',
        ticker: 'NVDA',
      }),
    );
  });

  it('acknowledges events without userId but does NOT forward to PostHog', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeReq({
      type: 'email.opened',
      data: { email_id: 'em_no_user', tags: { template: '8k_minimalist' } },
    }) as never);
    expect(res.status).toBe(200);
    expect(captureServerEventMock).not.toHaveBeenCalled();
  });

  it('acknowledges non-engagement events (email.sent / email.delivered) without forwarding', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeReq({
      type: 'email.delivered',
      data: { email_id: 'em_deliv', tags: { userId: 'u1' } },
    }) as never);
    expect(res.status).toBe(200);
    expect(captureServerEventMock).not.toHaveBeenCalled();
  });
});
