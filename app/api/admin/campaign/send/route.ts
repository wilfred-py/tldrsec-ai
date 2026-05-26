/**
 * Campaign Email Send API
 *
 * POST /api/admin/campaign/send
 *
 * Sends campaign emails to waitlist cohorts. Admin-only.
 * Emails are queued via Resend (not sent synchronously) to avoid
 * Vercel function timeout on batch sends.
 *
 * Params: { cohort: 1|2|3, emailNumber: 1|2|3, variant?: 'A'|'B', dryRun?: boolean }
 *
 * Cohort assignment is pinned per subscriber via newsletter_subscribers.cohort_id
 * (backfilled by scripts/backfill-newsletter-cohorts.ts). Index-based cohort
 * slicing was retired — see email-funnel-tracking design doc Review Notes 2A.
 */

import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { Resend } from 'resend';
import { generateUnsubscribeUrl } from '@/lib/email/email-link-tokens';
import { fetchCampaignFilings } from '@/lib/email/campaign-templates';
import { classifyRegion, regionCohortSlot, type Region } from '@/lib/email/region-classifier';
import { FOUNDER_REPLY_TO } from '@/lib/email/config';
import { logger } from '@/lib/logging';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

const campaignLogger = logger.child('campaign-send');

/** Campaign id used in Resend tags + UTM params for the 2026-05 newsletter broadcast. */
const CAMPAIGN_ID = 'launch-2026-05';

type CohortNumber = 1 | 2 | 3;
type EmailNumber = 1 | 2 | 3;
type CohortTag = 'c1' | 'c2' | 'c3';
type EmailTag = 'e1' | 'e2' | 'e3';

const COHORT_TAG: Record<CohortNumber, CohortTag> = { 1: 'c1', 2: 'c2', 3: 'c3' };
const EMAIL_TAG: Record<EmailNumber, EmailTag> = { 1: 'e1', 2: 'e2', 3: 'e3' };

async function getSupabaseClient() {
  const { createSupabaseServiceClient } = await import('@/lib/supabase/server-client');
  return createSupabaseServiceClient();
}

function isAdmin(userId: string): boolean {
  const adminUsers = process.env.ADMIN_USERS?.split(',') || [];
  return adminUsers.some(id => id.trim() === userId);
}

/**
 * Two auth paths into the send route:
 *   - Clerk admin (interactive, no arm-flag gate): manual sends from the admin UI
 *   - Bearer token (cron-fired): the /schedule entries that auto-fire the
 *     2026-05 Wednesday launch. Token compared in constant-ish time to
 *     LAUNCH_CRON_TOKEN env var. These sends are gated by LAUNCH_ARMED below.
 */
type AuthResult =
  | { ok: false; status: number; error: string }
  | { ok: true; via: 'admin' | 'cron'; initiatedBy: string };

async function authenticate(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronToken = process.env.LAUNCH_CRON_TOKEN;
  if (cronToken && authHeader.startsWith('Bearer ')) {
    const provided = authHeader.slice('Bearer '.length).trim();
    // Constant-time compare via Node's timingSafeEqual. Length must match first
    // (timingSafeEqual throws on length mismatch), so the length check itself
    // remains a non-secret-data branch that's safe to short-circuit.
    if (provided.length === cronToken.length) {
      const a = Buffer.from(provided);
      const b = Buffer.from(cronToken);
      if (timingSafeEqual(a, b)) {
        return { ok: true, via: 'cron', initiatedBy: 'cron' };
      }
    }
  }
  const user = await currentUser();
  if (user && isAdmin(user.id)) {
    return { ok: true, via: 'admin', initiatedBy: user.id };
  }
  return { ok: false, status: 401, error: 'Unauthorized' };
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { via: authVia, initiatedBy } = auth;

  // Two send modes coexist:
  //   - cohort mode (legacy): targets subscribers pinned to cohort_id ∈ {c1,c2,c3}
  //   - region mode (added for the 2026-05 launch): targets subscribers whose
  //     email domain classifies to a Region ('us' | 'eu'); cohort_id is ignored.
  //
  // The campaign_sends UNIQUE (campaign_id, cohort_id, email_id, variant)
  // constraint is preserved by slotting region-mode sends under synthetic
  // cohort_id values 'region-us' / 'region-eu' (see regionCohortSlot).
  let body: {
    cohort?: CohortNumber;
    region?: Region;
    emailNumber: EmailNumber;
    variant?: 'A' | 'B';
    dryRun?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { cohort, region, emailNumber, variant, dryRun = false } = body;

  // Validate params: exactly one of cohort | region must be set.
  if ((cohort != null) === (region != null)) {
    return NextResponse.json(
      { error: 'Specify exactly one of { cohort } or { region }, not both' },
      { status: 400 }
    );
  }
  if (cohort != null && ![1, 2, 3].includes(cohort)) {
    return NextResponse.json({ error: 'cohort must be 1-3' }, { status: 400 });
  }
  if (region != null && !['us', 'eu'].includes(region)) {
    return NextResponse.json({ error: "region must be 'us' or 'eu'" }, { status: 400 });
  }
  if (![1, 2, 3].includes(emailNumber)) {
    return NextResponse.json({ error: 'emailNumber must be 1-3' }, { status: 400 });
  }
  const sendMode: 'cohort' | 'region' = region != null ? 'region' : 'cohort';

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey && !dryRun) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  // LAUNCH_ARMED safety gate.
  // Cron-fired sends are gated by an explicit env flag the operator flips
  // ON after dry-run sign-off. This is the "hard deadline with kill switch"
  // pattern: the cron will keep trying to fire, but every attempt no-ops
  // until LAUNCH_ARMED=true is set. Admin-clicked sends (interactive Clerk
  // path) bypass this check — the click IS the arm.
  if (authVia === 'cron' && !dryRun) {
    const armed = process.env.LAUNCH_ARMED === 'true';
    if (!armed) {
      campaignLogger.info('Cron send skipped — LAUNCH_ARMED is not true', {
        sendMode,
        cohort: cohort ?? null,
        region: region ?? null,
        emailNumber,
        launchArmedEnv: process.env.LAUNCH_ARMED ?? null,
      });
      return NextResponse.json({
        skipped: true,
        reason: 'LAUNCH_ARMED is not "true"',
        launchArmed: process.env.LAUNCH_ARMED ?? null,
      }, { status: 200 });
    }
  }

  try {
    const supabase = await getSupabaseClient();

    // Fetch sendable subscribers. Per email-funnel-tracking design Review Notes
    // 2A + 5A + 13A:
    //   - cohort mode filters by stored cohort_id
    //   - region mode skips cohort_id and filters in-memory via classifyRegion
    //   - both modes exclude unsubscribed AND bounced AND complained addresses
    //   - SELECT id (the UUID) so we can include it in Resend tags + UTMs
    const cohortSlot: string = sendMode === 'cohort'
      ? COHORT_TAG[cohort as CohortNumber]
      : regionCohortSlot(region as Region);

    // Chain order preserves the pre-region cohort-mode chain
    // (.eq before .is.is.is.order) so the cohort-stability test mock keeps
    // matching. Region mode skips the .eq leg entirely.
    interface SubscriberRow {
      id: string;
      email: string;
      subscribed_at: string;
      cohort_id: string | null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let subscribersQuery: any = supabase
      .from('newsletter_subscribers')
      .select('id, email, subscribed_at, cohort_id');
    if (sendMode === 'cohort') {
      subscribersQuery = subscribersQuery.eq('cohort_id', cohortSlot);
    }
    subscribersQuery = subscribersQuery
      .is('unsubscribed_at', null)
      .is('bounced_at', null)
      .is('complained_at', null)
      .order('subscribed_at', { ascending: false });
    const { data: fetchedSubscribers, error } = (await subscribersQuery) as {
      data: SubscriberRow[] | null;
      error: { message: string } | null;
    };

    if (error) {
      campaignLogger.error('Failed to fetch subscribers', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
    }

    const cohortSubscribers: SubscriberRow[] = sendMode === 'region'
      ? (fetchedSubscribers ?? []).filter((s: SubscriberRow) => classifyRegion(s.email) === region)
      : (fetchedSubscribers ?? []);

    if (!cohortSubscribers || cohortSubscribers.length === 0) {
      const errMsg = sendMode === 'cohort'
        ? `Cohort ${cohort} (${cohortSlot}) has no sendable subscribers.`
        : `Region '${region}' has no sendable subscribers (${cohortSlot}).`;
      return NextResponse.json({ error: errMsg }, { status: 404 });
    }

    // For A/B testing on cohort 1, split in half. Not applied in region mode —
    // 124 subscribers split by region (8 EU / 116 US) is already below A/B
    // stat-sig, so we send all targets the same variant.
    let targetSubscribers = cohortSubscribers;
    if (sendMode === 'cohort' && variant && cohort === 1) {
      const half = Math.ceil(cohortSubscribers.length / 2);
      targetSubscribers = variant === 'A'
        ? cohortSubscribers.slice(0, half)
        : cohortSubscribers.slice(half);
    }

    // Import the campaign template
    const { getCampaignEmailContent } = await import('@/lib/email/campaign-templates');

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        mode: sendMode,
        campaignId: CAMPAIGN_ID,
        cohort: cohort ?? null,
        region: region ?? null,
        cohortSlot,
        emailNumber,
        emailTag: EMAIL_TAG[emailNumber as EmailNumber],
        variant: variant || null,
        cohortSize: cohortSubscribers.length,
        targetSize: targetSubscribers.length,
        sampleEmails: targetSubscribers.slice(0, 3).map(s => {
          const [local, domain] = s.email.split('@');
          return `${local.substring(0, 2)}***@${domain}`;
        }),
      });
    }

    // Fetch dynamic filing data for emails 1 and 2 (email 3 is static copy)
    const filings = (emailNumber === 1 || emailNumber === 2)
      ? await fetchCampaignFilings(emailNumber === 1 ? 1 : 3)
      : undefined;

    if (filings && filings.length > 0) {
      campaignLogger.info('Using dynamic filing data for campaign email', {
        emailNumber,
        filingCount: filings.length,
        tickers: filings.map(f => f.ticker),
      });
    }

    // Idempotency log (Review Notes 9A). Insert pending row before any
    // Resend call. UNIQUE constraint on (campaign_id, cohort_id, email_id, variant)
    // makes a duplicate send a 23505 → 409 with prior status. The pending→sent
    // state machine means a Resend failure leaves the row as 'failed', NOT
    // 'sent', so a retry can flip the same row back to pending and try again.
    const variantTagValue = variant ?? null;  // NULL is treated as a distinct value by ANSI SQL
    const { data: insertedSend, error: insertError } = await supabase
      .from('campaign_sends')
      .insert({
        campaign_id: CAMPAIGN_ID,
        cohort_id: cohortSlot,
        email_id: EMAIL_TAG[emailNumber as EmailNumber],
        variant: variantTagValue,
        status: 'pending',
        initiated_by: initiatedBy,
      })
      .select('id, status, sent_count, initiated_at')
      .single();

    if (insertError) {
      // 23505 = unique_violation. Prior send exists for this (campaign, cohort, email, variant).
      if (insertError.code === '23505') {
        // Look up the prior row to surface its status. Variant matching needs
        // a NULL-aware predicate (.is for null, .eq for non-null) — Postgres
        // treats NULL = NULL as false in equality.
        let priorQuery = supabase
          .from('campaign_sends')
          .select('id, status, sent_count, failed_count, initiated_at, completed_at')
          .eq('campaign_id', CAMPAIGN_ID)
          .eq('cohort_id', cohortSlot)
          .eq('email_id', EMAIL_TAG[emailNumber as EmailNumber]);
        priorQuery = variantTagValue === null
          ? priorQuery.is('variant', null)
          : priorQuery.eq('variant', variantTagValue);
        const { data: prior } = await priorQuery.maybeSingle();
        return NextResponse.json({
          error: 'Campaign send already initiated for this (cohort, email, variant). Refusing to duplicate.',
          prior: prior ?? null,
        }, { status: 409 });
      }
      campaignLogger.error('Failed to insert campaign_sends row', { error: insertError.message });
      return NextResponse.json({ error: 'Failed to record send attempt' }, { status: 500 });
    }

    const campaignSendId = insertedSend!.id;
    campaignLogger.info('campaign_sends row inserted (pending)', {
      campaignSendId,
      campaignId: CAMPAIGN_ID,
      cohortSlot,
      emailTag: EMAIL_TAG[emailNumber as EmailNumber],
    });

    // Queue emails via Resend batch (up to 100 per batch call).
    //
    // Tag schema (Review Notes 2A/3A/4A/6A): every email carries enough
    // identity for the Resend webhook to fire a fully-attributed PostHog
    // event. Both camelCase and snake_case forms are accepted on the inbound
    // side — see app/api/webhook/route.ts handler.
    //   - subscriberId: the Supabase UUID; used as PostHog distinct_id for
    //     subscriber-keyed events (email_opened, email_clicked).
    //   - campaignId / cohortId / emailId: dimension tags for funnel filters.
    //   - variant: A/B split label (also drives subject-line copy).
    //   - campaign: legacy flat tag preserved for any existing dashboards.
    const emailTag = EMAIL_TAG[emailNumber as EmailNumber];
    const resend = new Resend(resendApiKey);

    // 2026-05 launch path: region + E1 = curated VRT 10-Q hero with founder note.
    // Rendered via React Email's CampaignDemoTemplate (founderNoteVariant='letter')
    // because the inline-HTML getCampaignEmailContent path has no founder-note slot.
    const useLaunchHero = sendMode === 'region' && emailNumber === 1;
    let renderLaunchHero: typeof import('@/lib/email/launch-hero-renderer').renderLaunchHero | null = null;
    if (useLaunchHero) {
      ({ renderLaunchHero } = await import('@/lib/email/launch-hero-renderer'));
    }

    const emails = await Promise.all(targetSubscribers.map(async subscriber => {
      const unsubscribeUrl = generateUnsubscribeUrl(subscriber.email);
      const content = useLaunchHero && renderLaunchHero
        ? await renderLaunchHero({ subscriberId: subscriber.id, unsubscribeUrl })
        : await getCampaignEmailContent(emailNumber, {
            unsubscribeUrl,
            variant,
            filings: filings || undefined,
            subscriberId: subscriber.id,
            emailId: emailTag,
          });

      return {
        from: 'tldrSEC <notifications@tldrsec.app>',
        reply_to: FOUNDER_REPLY_TO,
        to: subscriber.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [
          {
            name: 'campaign',
            value: sendMode === 'cohort'
              ? `cohort${cohort}-email${emailNumber}`
              : `region${region}-email${emailNumber}`,
          },
          { name: 'campaignId', value: CAMPAIGN_ID },
          { name: 'cohortId', value: cohortSlot },
          { name: 'emailId', value: emailTag },
          { name: 'subscriberId', value: subscriber.id },
          { name: 'variant', value: variant || 'none' },
          // Region tag only emitted in region mode — keeps cohort-mode at the
          // locked 6-tag PostHog schema (see campaign-resend-tags.test.ts).
          ...(sendMode === 'region'
            ? [{ name: 'region', value: region as string }]
            : []),
        ],
      };
    }));

    // Resend batch API supports up to 100 emails per call
    const batchSize = 100;
    const results = [];
    let failedCount = 0;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const result = await resend.batch.send(batch);
      if (result.error) {
        failedCount += batch.length;
        campaignLogger.error('Batch send failed', {
          batchIndex: i / batchSize,
          error: result.error.message,
        });
      }
      results.push(result);
    }

    const sentCount = emails.length - failedCount;
    const finalStatus = failedCount === 0 ? 'sent' : 'failed';

    // Flip campaign_sends row to its terminal status. Best-effort —
    // log but don't fail the whole request if this UPDATE errors.
    const { error: updateError } = await supabase
      .from('campaign_sends')
      .update({
        status: finalStatus,
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaignSendId);
    if (updateError) {
      campaignLogger.error('Failed to flip campaign_sends row to terminal status', {
        campaignSendId,
        finalStatus,
        error: updateError.message,
      });
    }

    campaignLogger.info('Campaign emails sent', {
      campaignSendId,
      cohort,
      emailNumber,
      variant: variant || 'none',
      sent: sentCount,
      failed: failedCount,
      total: emails.length,
      initiatedBy,
      authVia,
    });

    return NextResponse.json({
      success: failedCount === 0,
      campaignSendId,
      cohort,
      emailNumber,
      variant: variant || null,
      sent: sentCount,
      failed: failedCount,
      total: emails.length,
      results,
    }, { status: failedCount === 0 ? 202 : 207 });

  } catch (error) {
    campaignLogger.error('Campaign send failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      cohort: cohort ?? null,
      region: region ?? null,
      emailNumber,
    });
    return NextResponse.json({ error: 'Campaign send failed' }, { status: 500 });
  }
}
