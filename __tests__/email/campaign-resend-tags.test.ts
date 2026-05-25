/**
 * Campaign Resend tag schema (AC6).
 *
 * Locks the tag contract emitted by `POST /api/admin/campaign/send` into
 * Resend's batch send. PostHog `email.opened` / `email.clicked` events
 * pivot on these tags, so any drift silently breaks campaign attribution.
 *
 * Required schema (per email-funnel-tracking design Review Notes 2A/3A/4A/6A
 * + the route at app/api/admin/campaign/send/route.ts):
 *
 *   tags: [
 *     { name: 'campaign',     value: `cohort${cohort}-email${emailNumber}` },  // legacy flat tag
 *     { name: 'campaignId',   value: 'launch-2026-05' },
 *     { name: 'cohortId',     value: 'c1' | 'c2' | 'c3' },
 *     { name: 'emailId',      value: 'e1' | 'e2' | 'e3' },
 *     { name: 'subscriberId', value: <UUID> },
 *     { name: 'variant',      value: 'A' | 'B' | 'none' },
 *   ]
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

// Supabase service client — returns subscribers for whichever cohort_id is queried.
// The route's chain is now: from().select().eq('cohort_id', X).is(..).is(..).is(..).order().
const C1_SUBSCRIBERS = Array.from({ length: 40 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(1_000_000 + i).padStart(12, '0')}`,
  email: `c1-subscriber${i + 1}@example.com`,
  subscribed_at: new Date(Date.now() - i * 86_400_000).toISOString(),
  cohort_id: 'c1',
}));
const C2_SUBSCRIBERS = Array.from({ length: 40 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(2_000_000 + i).padStart(12, '0')}`,
  email: `c2-subscriber${i + 1}@example.com`,
  subscribed_at: new Date(Date.now() - (40 + i) * 86_400_000).toISOString(),
  cohort_id: 'c2',
}));
const C3_SUBSCRIBERS = Array.from({ length: 44 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(3_000_000 + i).padStart(12, '0')}`,
  email: `c3-subscriber${i + 1}@example.com`,
  subscribed_at: new Date(Date.now() - (80 + i) * 86_400_000).toISOString(),
  cohort_id: 'c3',
}));

function buildCohortBuilder(cohortId: string) {
  // Match by cohort_id: which slice of mocks to return
  const subscribers =
    cohortId === 'c1' ? C1_SUBSCRIBERS :
    cohortId === 'c2' ? C2_SUBSCRIBERS :
    cohortId === 'c3' ? C3_SUBSCRIBERS : [];

  // The chain we need to support: .eq().is().is().is().order()
  const chain: any = {
    is: jest.fn().mockReturnValue(undefined),  // filled below
    order: jest.fn().mockResolvedValue({ data: subscribers, error: null }),
  };
  chain.is.mockImplementation(() => chain);
  return chain;
}

// Idempotency log mock — every INSERT into campaign_sends succeeds with a fresh
// row. Tests that need to assert on duplicate-blocking belong in
// __tests__/api/admin/campaign/cohort-stability.test.ts; here we just need
// the route to proceed past the idempotency gate so we can inspect the tags.
const campaignSendsInsertMock = jest.fn().mockImplementation(() => ({
  select: jest.fn().mockReturnValue({
    single: jest.fn().mockResolvedValue({
      data: { id: 'cs_test_1', status: 'pending', sent_count: 0, initiated_at: new Date().toISOString() },
      error: null,
    }),
  }),
}));
const campaignSendsUpdateMock = jest.fn().mockReturnValue({
  eq: jest.fn().mockResolvedValue({ data: null, error: null }),
});

jest.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServiceClient: jest.fn().mockResolvedValue({
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockImplementation((_col: string, value: string) => buildCohortBuilder(value)),
          }),
        };
      }
      if (table === 'campaign_sends') {
        return {
          insert: campaignSendsInsertMock,
          update: campaignSendsUpdateMock,
        };
      }
      throw new Error(`Unmocked table: ${table}`);
    }),
  }),
}));

// generateUnsubscribeUrl — pure function, but pin the output for stability.
jest.mock('@/lib/email/email-link-token', () => ({
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

type Tag = { name: string; value: string };

describe('Campaign Resend tag schema (AC6 + funnel-tracking Review Notes)', () => {
  it('emits the full 6-tag schema per email with correct cohort+email+subscriber values', async () => {
    const res = await POST(makePost({ cohort: 1, emailNumber: 1 }));
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(batchSendMock).toHaveBeenCalledTimes(1);

    const [batch] = batchSendMock.mock.calls[0];
    expect(Array.isArray(batch)).toBe(true);
    expect(batch.length).toBeGreaterThan(0);

    for (const message of batch as Array<{ tags: Tag[]; to: string }>) {
      const tagMap = Object.fromEntries(message.tags.map(t => [t.name, t.value]));
      expect(tagMap.campaign).toBe('cohort1-email1');
      expect(tagMap.campaignId).toBe('launch-2026-05');
      expect(tagMap.cohortId).toBe('c1');
      expect(tagMap.emailId).toBe('e1');
      expect(tagMap.variant).toBe('none');
      // subscriberId is per-recipient and must be a UUID
      expect(tagMap.subscriberId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      // Exactly the 6 tags we expect — no more, no less. Drift here breaks PostHog.
      expect(message.tags.length).toBe(6);
    }
  });

  it('subscriberId tag is unique per recipient', async () => {
    await POST(makePost({ cohort: 1, emailNumber: 1 }));
    const [batch] = batchSendMock.mock.calls[0];
    const subIds = (batch as Array<{ tags: Tag[] }>).map(m => m.tags.find(t => t.name === 'subscriberId')?.value);
    expect(new Set(subIds).size).toBe(subIds.length);  // all unique
  });

  it('variant=A propagates into tag value', async () => {
    await POST(makePost({ cohort: 1, emailNumber: 1, variant: 'A' }));
    const [batch] = batchSendMock.mock.calls[0];
    const variantTags = (batch as Array<{ tags: Tag[] }>).map(m =>
      m.tags.find(t => t.name === 'variant')?.value,
    );
    expect(new Set(variantTags)).toEqual(new Set(['A']));
  });

  it('variant=B propagates into tag value', async () => {
    await POST(makePost({ cohort: 1, emailNumber: 1, variant: 'B' }));
    const [batch] = batchSendMock.mock.calls[0];
    const variantTags = (batch as Array<{ tags: Tag[] }>).map(m =>
      m.tags.find(t => t.name === 'variant')?.value,
    );
    expect(new Set(variantTags)).toEqual(new Set(['B']));
  });

  it('cohort 2 + email 2 produces correct cohortId + emailId + legacy campaign tags', async () => {
    await POST(makePost({ cohort: 2, emailNumber: 2 }));
    const [batch] = batchSendMock.mock.calls[0];
    for (const message of batch as Array<{ tags: Tag[] }>) {
      const tagMap = Object.fromEntries(message.tags.map(t => [t.name, t.value]));
      expect(tagMap.campaign).toBe('cohort2-email2');
      expect(tagMap.cohortId).toBe('c2');
      expect(tagMap.emailId).toBe('e2');
    }
  });

  it('cohort 3 + email 3 produces correct cohortId + emailId (no filings fetched for static copy)', async () => {
    await POST(makePost({ cohort: 3, emailNumber: 3 }));
    const [batch] = batchSendMock.mock.calls[0];
    for (const message of batch as Array<{ tags: Tag[] }>) {
      const tagMap = Object.fromEntries(message.tags.map(t => [t.name, t.value]));
      expect(tagMap.campaign).toBe('cohort3-email3');
      expect(tagMap.cohortId).toBe('c3');
      expect(tagMap.emailId).toBe('e3');
    }
  });

  it('every batched message also carries the List-Unsubscribe one-click headers (CAN-SPAM)', async () => {
    await POST(makePost({ cohort: 1, emailNumber: 1 }));
    const [batch] = batchSendMock.mock.calls[0];
    for (const message of batch as Array<{ headers: Record<string, string> }>) {
      expect(message.headers['List-Unsubscribe']).toMatch(/^<https:\/\/tldrsec\.app\/unsubscribe\?token=/);
      expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    }
  });

  it('email body links carry ?sub=<UUID> for landing-page identification', async () => {
    await POST(makePost({ cohort: 1, emailNumber: 1 }));
    const [batch] = batchSendMock.mock.calls[0];
    for (const message of batch as Array<{ html: string; tags: Tag[] }>) {
      const subId = message.tags.find(t => t.name === 'subscriberId')?.value;
      expect(subId).toBeTruthy();
      expect(message.html).toContain(`sub=${subId}`);
      expect(message.html).toContain('utm_campaign=launch-2026-05');
      expect(message.html).toContain('utm_content=e1');
    }
  });
});
