/**
 * Campaign Resend tag schema (AC6).
 *
 * Locks the tag contract emitted by `POST /api/admin/campaign/send` into
 * Resend's batch send. PostHog `email.opened` / `email.clicked` events
 * pivot on these tags, so any drift silently breaks campaign attribution.
 *
 * Required schema (per plan AC6 + the existing route at
 *   app/api/admin/campaign/send/route.ts:160):
 *
 *   tags: [
 *     { name: 'campaign', value: `cohort${cohort}-email${emailNumber}` },
 *     { name: 'variant',  value: variant || 'none' },
 *   ]
 *
 * Mirrors __tests__/email/resend-tag-schema.test.ts but for the campaign
 * route, which uses `new Resend(...).batch.send(...)` directly rather than
 * NotificationService.
 */

const batchSendMock = jest.fn().mockResolvedValue({ data: { ids: ['e_1'] }, error: null });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    batch: { send: batchSendMock },
  })),
}));

// EmailHeader rendering: bypass the @react-email/render dynamic import — the
// inline-template route only needs *some* HTML string for the header slot.
jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table><tbody><tr><td>HEADER_STUB</td></tr></tbody></table>'),
}));

// fetchCampaignFilings hits Prisma; stub it out so we don't need a database.
jest.mock('@/lib/email/campaign-templates', () => {
  const actual = jest.requireActual('@/lib/email/campaign-templates');
  return {
    ...actual,
    fetchCampaignFilings: jest.fn().mockResolvedValue([]),
  };
});

// Clerk currentUser — auth gate.
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn().mockResolvedValue({ id: 'user_admin_test' }),
}));

// Supabase service client — returns a static cohort of subscribers.
// Need ≥125 to populate cohort 3 (offsets 80–125 in the route's slicing).
const supabaseSubscribers = Array.from({ length: 130 }, (_, i) => ({
  email: `subscriber${i + 1}@example.com`,
  subscribed_at: new Date(Date.now() - i * 86_400_000).toISOString(),
}));
jest.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServiceClient: jest.fn().mockResolvedValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        is: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: supabaseSubscribers, error: null }),
        }),
      }),
    }),
  }),
}));

// generateUnsubscribeUrl — pure function, but pin the output for stability.
jest.mock('@/lib/email/unsubscribe-tokens', () => ({
  generateUnsubscribeUrl: (email: string) => `https://tldrsec.app/unsubscribe?token=stub-${email}`,
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/campaign/send/route';

beforeAll(() => {
  process.env.RESEND_API_KEY = 'test_key_resend';
  process.env.ADMIN_USERS = 'user_admin_test';
});

beforeEach(() => {
  batchSendMock.mockClear();
});

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/campaign/send', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('Campaign Resend tag schema (AC6)', () => {
  it('emits exactly two tags per email: { campaign, variant } with cohort+email values', async () => {
    const res = await POST(makePost({ cohort: 1, emailNumber: 1 }));
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(batchSendMock).toHaveBeenCalledTimes(1);

    const [batch] = batchSendMock.mock.calls[0];
    expect(Array.isArray(batch)).toBe(true);
    expect(batch.length).toBeGreaterThan(0);

    for (const message of batch) {
      expect(message.tags).toEqual([
        { name: 'campaign', value: 'cohort1-email1' },
        { name: 'variant', value: 'none' },
      ]);
    }
  });

  it('variant=A propagates into tag value', async () => {
    await POST(makePost({ cohort: 1, emailNumber: 1, variant: 'A' }));
    const [batch] = batchSendMock.mock.calls[0];
    const variantTags = batch.map((m: { tags: Array<{ name: string; value: string }> }) =>
      m.tags.find(t => t.name === 'variant')?.value,
    );
    expect(new Set(variantTags)).toEqual(new Set(['A']));
  });

  it('variant=B propagates into tag value', async () => {
    await POST(makePost({ cohort: 1, emailNumber: 1, variant: 'B' }));
    const [batch] = batchSendMock.mock.calls[0];
    const variantTags = batch.map((m: { tags: Array<{ name: string; value: string }> }) =>
      m.tags.find(t => t.name === 'variant')?.value,
    );
    expect(new Set(variantTags)).toEqual(new Set(['B']));
  });

  it('emailNumber 2 produces campaign=cohort{N}-email2', async () => {
    await POST(makePost({ cohort: 2, emailNumber: 2 }));
    const [batch] = batchSendMock.mock.calls[0];
    for (const message of batch) {
      const tag = message.tags.find((t: { name: string }) => t.name === 'campaign');
      expect(tag).toEqual({ name: 'campaign', value: 'cohort2-email2' });
    }
  });

  it('emailNumber 3 produces campaign=cohort{N}-email3 (no filings fetched for static copy)', async () => {
    await POST(makePost({ cohort: 3, emailNumber: 3 }));
    const [batch] = batchSendMock.mock.calls[0];
    for (const message of batch) {
      const tag = message.tags.find((t: { name: string }) => t.name === 'campaign');
      expect(tag).toEqual({ name: 'campaign', value: 'cohort3-email3' });
    }
  });

  it('every batched message also carries the List-Unsubscribe one-click headers (CAN-SPAM)', async () => {
    await POST(makePost({ cohort: 1, emailNumber: 1 }));
    const [batch] = batchSendMock.mock.calls[0];
    for (const message of batch) {
      expect(message.headers['List-Unsubscribe']).toMatch(/^<https:\/\/tldrsec\.app\/unsubscribe\?token=/);
      expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    }
  });
});
