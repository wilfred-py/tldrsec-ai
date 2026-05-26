/**
 * Region-mode send tests for /api/admin/campaign/send.
 *
 * The 2026-05 waitlist launch uses POST { region: 'us' | 'eu', ... } instead
 * of the legacy POST { cohort: 1|2|3, ... }. The route filters subscribers
 * in-memory via lib/email/region-classifier.ts and slots the campaign_sends
 * row under cohort_id='region-us' / 'region-eu' so the existing
 * UNIQUE (campaign_id, cohort_id, email_id, variant) idempotency constraint
 * still applies.
 *
 * Tests cover:
 *   - request shape validation (must specify exactly one of cohort | region)
 *   - region filter actually segregates the subscriber list
 *   - tags include `region:us|eu` for analytics
 *   - re-POSTing the same region returns 409 (idempotency holds)
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
  initiated_at: string;
}> = [];

// In region mode the route's chain is:
//   from(...).select(...).is(...).is(...).is(...).order(...)
// In cohort mode it's:
//   from(...).select(...).eq('cohort_id', X).is(...).is(...).is(...).order(...)
// This factory builds a chain root that supports BOTH shapes by returning a
// proxy with .is and .eq methods that resolve to the eventual subscriber list.
function makeSubscribersChain(filter?: { col: 'cohort_id'; value: string }) {
  const data = filter
    ? subscribersTable.filter(s => s.cohort_id === filter.value)
    : subscribersTable.slice();
  const orderResolver = jest.fn().mockResolvedValue({ data, error: null });
  const isLevel3: any = { order: orderResolver };
  const isLevel2: any = { is: jest.fn().mockReturnValue(isLevel3) };
  const isLevel1: any = { is: jest.fn().mockReturnValue(isLevel2) };
  return { is: jest.fn().mockReturnValue(isLevel1) };
}

function makeCampaignSendsInsert(input: any) {
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
        single: jest.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } }),
      }),
    };
  }
  const inserted = {
    id: `cs_${campaignSendsTable.length + 1}`,
    initiated_at: new Date().toISOString(),
    ...input,
  };
  campaignSendsTable.push(inserted);
  return {
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: { id: inserted.id, status: inserted.status, sent_count: 0, initiated_at: inserted.initiated_at },
        error: null,
      }),
    }),
  };
}

function makeCampaignSendsLookup() {
  const maybeSingle = jest.fn().mockResolvedValue({
    data: campaignSendsTable[campaignSendsTable.length - 1] ?? null,
    error: null,
  });
  const level4: any = { maybeSingle, is: jest.fn().mockReturnValue({ maybeSingle }), eq: jest.fn().mockReturnValue({ maybeSingle }) };
  const level3: any = { eq: jest.fn().mockReturnValue(level4), is: jest.fn().mockReturnValue(level4) };
  const level2: any = { eq: jest.fn().mockReturnValue(level3) };
  const level1: any = { eq: jest.fn().mockReturnValue(level2) };
  return { eq: jest.fn().mockReturnValue(level1) };
}

jest.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServiceClient: jest.fn().mockResolvedValue({
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'newsletter_subscribers') {
        return {
          select: jest.fn().mockReturnValue({
            // region mode hits this chain directly (.is after .select)
            ...makeSubscribersChain(),
            // cohort mode goes through .eq first
            eq: jest.fn().mockImplementation((col: string, value: string) =>
              makeSubscribersChain({ col: col as 'cohort_id', value }),
            ),
          }),
        };
      }
      if (table === 'campaign_sends') {
        return {
          insert: jest.fn().mockImplementation(makeCampaignSendsInsert),
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) }),
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

function seedMixedRegions() {
  // 4 EU subs + 6 US subs (ratios similar to the real launch list)
  const subs = [
    { id: 'eu-1', email: 'investor@firm.co.uk' },
    { id: 'eu-2', email: 'reader@btinternet.com' },
    { id: 'eu-3', email: 'user@web.de' },
    { id: 'eu-4', email: 'user@example.fr' },
    { id: 'us-1', email: 'wilf@gmail.com' },
    { id: 'us-2', email: 'user@yahoo.com' },
    { id: 'us-3', email: 'user@aol.com' },
    { id: 'us-4', email: 'user@sbcglobal.net' },
    { id: 'us-5', email: 'user@bestformulations.com' },
    { id: 'us-6', email: 'user@bergerchevy.com' },
  ];
  subs.forEach((s, i) => {
    subscribersTable.push({
      id: s.id,
      email: s.email,
      subscribed_at: new Date(Date.now() - i * 86_400_000).toISOString(),
      cohort_id: i % 3 === 0 ? 'c1' : i % 3 === 1 ? 'c2' : 'c3',
    });
  });
}

describe('region-mode send', () => {
  it('rejects requests with both cohort and region', async () => {
    const res = await POST(makePost({ cohort: 1, region: 'us', emailNumber: 1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exactly one/i);
  });

  it('rejects requests with neither cohort nor region', async () => {
    const res = await POST(makePost({ emailNumber: 1 }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown region values', async () => {
    const res = await POST(makePost({ region: 'apac', emailNumber: 1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/region must be/i);
  });

  it('region=eu sends only to EU-classified subscribers', async () => {
    seedMixedRegions();
    const res = await POST(makePost({ region: 'eu', emailNumber: 1 }));
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const batch = batchSendMock.mock.calls[0][0] as Array<{ to: string }>;
    const recipientEmails = batch.map(b => b.to).sort();
    expect(recipientEmails).toEqual([
      'investor@firm.co.uk',
      'reader@btinternet.com',
      'user@example.fr',
      'user@web.de',
    ]);
  });

  it('region=us sends to everyone else', async () => {
    seedMixedRegions();
    const res = await POST(makePost({ region: 'us', emailNumber: 1 }));
    expect(res.status).toBeLessThan(300);
    const batch = batchSendMock.mock.calls[0][0] as Array<{ to: string }>;
    expect(batch.length).toBe(6);
    expect(batch.every(b => !b.to.endsWith('.co.uk'))).toBe(true);
    expect(batch.every(b => !b.to.endsWith('.fr'))).toBe(true);
  });

  it('emits region tag on every Resend message', async () => {
    seedMixedRegions();
    await POST(makePost({ region: 'eu', emailNumber: 1 }));
    const batch = batchSendMock.mock.calls[0][0] as Array<{
      tags: Array<{ name: string; value: string }>;
    }>;
    for (const msg of batch) {
      const tagMap = Object.fromEntries(msg.tags.map(t => [t.name, t.value]));
      expect(tagMap.region).toBe('eu');
      expect(tagMap.cohortId).toBe('region-eu');
      expect(tagMap.campaignId).toBe('launch-2026-05');
      expect(tagMap.emailId).toBe('e1');
      expect(tagMap.campaign).toBe('regioneu-email1');
    }
  });

  it('second POST for same (region, email) returns 409', async () => {
    seedMixedRegions();
    const first = await POST(makePost({ region: 'us', emailNumber: 1 }));
    expect(first.status).toBeLessThan(300);
    const second = await POST(makePost({ region: 'us', emailNumber: 1 }));
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toMatch(/already initiated/i);
  });

  it('dryRun region=eu returns mode + region in response', async () => {
    seedMixedRegions();
    const res = await POST(makePost({ region: 'eu', emailNumber: 1, dryRun: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.mode).toBe('region');
    expect(body.region).toBe('eu');
    expect(body.cohort).toBeNull();
    expect(body.cohortSlot).toBe('region-eu');
    expect(body.targetSize).toBe(4);
  });
});

// ─── Cron auth + LAUNCH_ARMED gate ──────────────────────────────────────

function makeCronPost(body: unknown, bearerToken: string | undefined): NextRequest {
  const headers: Record<string, string> = {};
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  return new NextRequest('http://localhost/api/admin/campaign/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('cron-fired send + LAUNCH_ARMED gate', () => {
  const ORIGINAL_CRON_TOKEN = process.env.LAUNCH_CRON_TOKEN;
  const ORIGINAL_ARMED = process.env.LAUNCH_ARMED;

  beforeEach(() => {
    delete process.env.LAUNCH_ARMED;
    process.env.LAUNCH_CRON_TOKEN = 'test-cron-token-12345';
  });

  afterAll(() => {
    if (ORIGINAL_CRON_TOKEN === undefined) delete process.env.LAUNCH_CRON_TOKEN;
    else process.env.LAUNCH_CRON_TOKEN = ORIGINAL_CRON_TOKEN;
    if (ORIGINAL_ARMED === undefined) delete process.env.LAUNCH_ARMED;
    else process.env.LAUNCH_ARMED = ORIGINAL_ARMED;
  });

  it('Bearer token matching LAUNCH_CRON_TOKEN authorizes a region send', async () => {
    seedMixedRegions();
    process.env.LAUNCH_ARMED = 'true';
    const res = await POST(makeCronPost({ region: 'eu', emailNumber: 1 }, 'test-cron-token-12345'));
    expect(res.status).toBeLessThan(300);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('Bearer token with wrong value falls through to Clerk and is 401 if not admin', async () => {
    seedMixedRegions();
    process.env.LAUNCH_ARMED = 'true';
    const res = await POST(makeCronPost({ region: 'eu', emailNumber: 1 }, 'wrong-token'));
    // Clerk mock returns user_admin_test as admin, so this should still 200
    expect(res.status).toBeLessThan(300);
  });

  it('cron send is skipped (200 with skipped:true) when LAUNCH_ARMED is unset', async () => {
    seedMixedRegions();
    delete process.env.LAUNCH_ARMED;
    const res = await POST(makeCronPost({ region: 'eu', emailNumber: 1 }, 'test-cron-token-12345'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toMatch(/LAUNCH_ARMED/);
    // batch.send must NOT have been called
    expect(batchSendMock).not.toHaveBeenCalled();
  });

  it('cron send is skipped when LAUNCH_ARMED is "false" (not the string "true")', async () => {
    seedMixedRegions();
    process.env.LAUNCH_ARMED = 'false';
    const res = await POST(makeCronPost({ region: 'eu', emailNumber: 1 }, 'test-cron-token-12345'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
  });

  it('cron dryRun is NOT gated by LAUNCH_ARMED', async () => {
    seedMixedRegions();
    delete process.env.LAUNCH_ARMED;
    const res = await POST(makeCronPost({ region: 'eu', emailNumber: 1, dryRun: true }, 'test-cron-token-12345'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.skipped).toBeUndefined();
  });

  it('admin (Clerk) send is NOT gated by LAUNCH_ARMED even when unset', async () => {
    seedMixedRegions();
    delete process.env.LAUNCH_ARMED;
    // No bearer token = falls through to Clerk admin
    const res = await POST(makePost({ region: 'us', emailNumber: 1 }));
    expect(res.status).toBeLessThan(300);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.skipped).toBeUndefined();
  });
});
