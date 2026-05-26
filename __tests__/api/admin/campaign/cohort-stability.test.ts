/**
 * Cohort stability + idempotency tests for /api/admin/campaign/send.
 *
 * Two regression hooks per the email-funnel-tracking design:
 *
 *   Review Notes 11A — Cohort stability: a subscriber assigned to cohort 1
 *   at E1 send-time MUST stay in cohort 1 at E2 and E3 send-time, regardless
 *   of new signups arriving between sends. The prior bug was index-based
 *   slicing in the route — subscribers shifted as the list grew. This test
 *   asserts: insert N subscribers → run E1 → record E1 tags; "insert" M new
 *   subscribers (in this test, simulated by changing the mock dataset);
 *   run E2 → assert original N have stable cohort_id in E2 tags.
 *
 *   Review Notes 9A — Idempotency: POSTing the same (cohort, email, variant)
 *   twice must return 409 with the prior send's status, not double-broadcast.
 *   The campaign_sends table's UNIQUE constraint enforces this; the route
 *   surfaces a 409 instead of a 500.
 */

const batchSendMock = jest.fn().mockResolvedValue({ data: { ids: ['e_1'] }, error: null });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    batch: { send: batchSendMock },
  })),
}));

jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table>HEADER_STUB</table>'),
}));

jest.mock('@/lib/email/campaign-templates', () => {
  const actual = jest.requireActual('@/lib/email/campaign-templates');
  return {
    ...actual,
    fetchCampaignFilings: jest.fn().mockResolvedValue([]),
  };
});

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn().mockResolvedValue({ id: 'user_admin_test' }),
}));

jest.mock('@/lib/email/email-link-token', () => ({
  generateUnsubscribeUrl: (email: string) => `https://tldrsec.app/unsubscribe?token=stub-${email}`,
}));

// ─── Supabase mock that supports the route's full query chain ──────────
//
// Two query shapes we need to handle:
//   - SELECT subscribers: from('newsletter_subscribers').select(...).eq('cohort_id', X).is(...).is(...).is(...).order(...)
//   - INSERT campaign_sends + UPDATE campaign_sends + SELECT campaign_sends (for prior-send lookup on 409)

interface MockSubscriber {
  id: string;
  email: string;
  subscribed_at: string;
  cohort_id: string;
}

const subscribersTable: MockSubscriber[] = [];
const campaignSendsTable: Array<{
  id: string;
  campaign_id: string;
  cohort_id: string;
  email_id: string;
  variant: string | null;
  status: string;
  sent_count: number;
  failed_count: number;
  initiated_at: string;
  completed_at: string | null;
  initiated_by: string;
}> = [];

function makeNewsletterSubscribersChain(cohortIdFilter: string) {
  // After .eq('cohort_id', X), the route chains .is(...).is(...).is(...).order(...).
  // The .is() calls are all for filtering nulls (unsubscribed_at, bounced_at, complained_at);
  // our mock doesn't actually evaluate them — every row in subscribersTable is "sendable".
  const data = subscribersTable.filter(s => s.cohort_id === cohortIdFilter);
  const orderResolver = jest.fn().mockResolvedValue({ data, error: null });
  const isLevel3: any = { order: orderResolver };
  const isLevel2: any = { is: jest.fn().mockReturnValue(isLevel3) };
  const isLevel1: any = { is: jest.fn().mockReturnValue(isLevel2) };
  return { is: jest.fn().mockReturnValue(isLevel1) };
}

function makeCampaignSendsInsert(input: any) {
  // Simulate UNIQUE constraint
  const existing = campaignSendsTable.find(
    r =>
      r.campaign_id === input.campaign_id &&
      r.cohort_id === input.cohort_id &&
      r.email_id === input.email_id &&
      r.variant === input.variant,
  );
  if (existing) {
    return {
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } }),
      }),
    };
  }
  const inserted = {
    id: `cs_${campaignSendsTable.length + 1}`,
    sent_count: 0,
    failed_count: 0,
    completed_at: null,
    initiated_at: new Date().toISOString(),
    ...input,
  };
  campaignSendsTable.push(inserted);
  return {
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: { id: inserted.id, status: inserted.status, sent_count: 0, initiated_at: inserted.initiated_at }, error: null }),
    }),
  };
}

function makeCampaignSendsLookup() {
  // Fluent chain after the route's prior-send lookup, which terminates in
  // either .is('variant', null).maybeSingle() OR .eq('variant', X).maybeSingle()
  // depending on whether variant was null. The chain returns the most-recent
  // row; the test only cares that maybeSingle() resolves with prior row data.
  const maybeSingle = jest.fn().mockResolvedValue({
    data: campaignSendsTable[campaignSendsTable.length - 1] ?? null,
    error: null,
  });
  // Level 4 — terminal: .is(...) OR .eq(...) → resolves to maybeSingle
  const level4: any = {
    maybeSingle,
    is: jest.fn().mockReturnValue({ maybeSingle }),
    eq: jest.fn().mockReturnValue({ maybeSingle }),
  };
  // Levels 1-3 — chained .eq() calls each return the next chain link
  const level3: any = { eq: jest.fn().mockReturnValue(level4), is: jest.fn().mockReturnValue(level4) };
  const level2: any = { eq: jest.fn().mockReturnValue(level3) };
  const level1: any = { eq: jest.fn().mockReturnValue(level2) };
  return { eq: jest.fn().mockReturnValue(level1) };
}

function makeCampaignSendsUpdate(_input: any) {
  return {
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
}

jest.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServiceClient: jest.fn().mockResolvedValue({
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockImplementation((_col: string, value: string) =>
              makeNewsletterSubscribersChain(value),
            ),
          }),
        };
      }
      if (table === 'campaign_sends') {
        return {
          insert: jest.fn().mockImplementation(makeCampaignSendsInsert),
          update: jest.fn().mockImplementation(makeCampaignSendsUpdate),
          select: jest.fn().mockReturnValue(makeCampaignSendsLookup()),
        };
      }
      throw new Error(`Unmocked table: ${table}`);
    }),
  }),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/campaign/send/route';

beforeAll(() => {
  process.env.RESEND_API_KEY = 'test_key_resend';
  process.env.ADMIN_USERS = 'user_admin_test';
});

beforeEach(() => {
  batchSendMock.mockClear();
  subscribersTable.length = 0;
  campaignSendsTable.length = 0;
});

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/campaign/send', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function seedSubscribers(rows: Array<{ cohort: 'c1' | 'c2' | 'c3'; n: number; idPrefix: string }>) {
  let idx = 0;
  for (const { cohort, n, idPrefix } of rows) {
    for (let i = 0; i < n; i++) {
      subscribersTable.push({
        id: `${idPrefix}-${i}`,
        email: `${idPrefix}-${i}@example.com`,
        subscribed_at: new Date(Date.now() - idx * 86_400_000).toISOString(),
        cohort_id: cohort,
      });
      idx++;
    }
  }
}

type TagBag = Record<string, string>;

function tagsByEmail(call: any[]): Record<string, TagBag> {
  const [batch] = call;
  const result: Record<string, TagBag> = {};
  for (const message of batch as Array<{ to: string; tags: Array<{ name: string; value: string }> }>) {
    result[message.to] = Object.fromEntries(message.tags.map(t => [t.name, t.value]));
  }
  return result;
}

// ─── 11A: cohort stability across sends ────────────────────────────────

describe('cohort stability (Review Notes 11A)', () => {
  it('subscribers retain their cohort_id across E1 → E2 sends even when new subscribers join in between', async () => {
    // Phase 1: seed 3 in c1 + 3 in c2
    seedSubscribers([
      { cohort: 'c1', n: 3, idPrefix: 'orig-c1' },
      { cohort: 'c2', n: 3, idPrefix: 'orig-c2' },
    ]);

    // Send E1 to cohort 1
    const e1Res = await POST(makePost({ cohort: 1, emailNumber: 1 }));
    expect(e1Res.status).toBeGreaterThanOrEqual(200);
    expect(e1Res.status).toBeLessThan(300);
    const e1TagsByEmail = tagsByEmail(batchSendMock.mock.calls[0]);

    // Capture cohort_id assignments per original c1 subscriber
    const e1CohortByEmail: Record<string, string> = {};
    for (const [email, tags] of Object.entries(e1TagsByEmail)) {
      e1CohortByEmail[email] = tags.cohortId;
    }
    expect(Object.keys(e1CohortByEmail).length).toBe(3);
    expect(Object.values(e1CohortByEmail).every(c => c === 'c1')).toBe(true);

    // Phase 2: simulate 5 new signups arriving (these are c1 too — most recent)
    seedSubscribers([{ cohort: 'c1', n: 5, idPrefix: 'new-c1' }]);

    // Send E2 to cohort 1 — original 3 must still be tagged c1
    batchSendMock.mockClear();
    const e2Res = await POST(makePost({ cohort: 1, emailNumber: 2 }));
    expect(e2Res.status).toBeGreaterThanOrEqual(200);
    expect(e2Res.status).toBeLessThan(300);
    const e2TagsByEmail = tagsByEmail(batchSendMock.mock.calls[0]);

    // Original 3 subscribers must appear in E2 with same cohort_id as E1
    for (const email of Object.keys(e1CohortByEmail)) {
      expect(e2TagsByEmail[email]).toBeDefined();
      expect(e2TagsByEmail[email].cohortId).toBe(e1CohortByEmail[email]);
    }
    // E2 should also include the 5 new c1 subscribers
    const e2Recipients = Object.keys(e2TagsByEmail);
    expect(e2Recipients.length).toBe(8);  // 3 original + 5 new
  });
});

// ─── 9A: idempotency on duplicate send ─────────────────────────────────

describe('campaign send idempotency (Review Notes 9A)', () => {
  it('second POST with same (cohort, email, variant) returns 409 with prior send info', async () => {
    seedSubscribers([{ cohort: 'c1', n: 2, idPrefix: 'sub-c1' }]);

    const first = await POST(makePost({ cohort: 1, emailNumber: 1 }));
    expect(first.status).toBeGreaterThanOrEqual(200);
    expect(first.status).toBeLessThan(300);

    // Same params again
    const second = await POST(makePost({ cohort: 1, emailNumber: 1 }));
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toMatch(/already initiated/i);
    expect(body.prior).toBeDefined();
  });

  it('different variant on same (cohort, email) is allowed', async () => {
    seedSubscribers([{ cohort: 'c1', n: 4, idPrefix: 'sub-c1' }]);

    const a = await POST(makePost({ cohort: 1, emailNumber: 1, variant: 'A' }));
    const b = await POST(makePost({ cohort: 1, emailNumber: 1, variant: 'B' }));

    expect(a.status).toBeLessThan(300);
    expect(b.status).toBeLessThan(300);
  });
});
