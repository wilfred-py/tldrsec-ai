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
import { generateUnsubscribeUrl } from '@/lib/email/unsubscribe-tokens';
import { fetchCampaignFilings } from '@/lib/email/campaign-templates';
import { logger } from '@/lib/logging';

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

export async function POST(request: NextRequest) {
  // Auth check
  const user = await currentUser();
  if (!user || !isAdmin(user.id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { cohort: CohortNumber; emailNumber: EmailNumber; variant?: 'A' | 'B'; dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { cohort, emailNumber, variant, dryRun = false } = body;

  // Validate params
  if (![1, 2, 3].includes(cohort) || ![1, 2, 3].includes(emailNumber)) {
    return NextResponse.json({ error: 'cohort must be 1-3, emailNumber must be 1-3' }, { status: 400 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey && !dryRun) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  try {
    const supabase = await getSupabaseClient();

    // Fetch sendable subscribers in this cohort. Per email-funnel-tracking
    // design Review Notes 2A + 5A + 13A:
    //   - cohort_id is now pinned per subscriber (no more index slicing)
    //   - filter out unsubscribed AND bounced AND complained addresses
    //   - SELECT id (the UUID) so we can include it in Resend tags + UTMs
    const cohortTag = COHORT_TAG[cohort as CohortNumber];
    const { data: cohortSubscribers, error } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, subscribed_at, cohort_id')
      .eq('cohort_id', cohortTag)
      .is('unsubscribed_at', null)
      .is('bounced_at', null)
      .is('complained_at', null)
      .order('subscribed_at', { ascending: false });

    if (error) {
      campaignLogger.error('Failed to fetch subscribers', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
    }

    if (!cohortSubscribers || cohortSubscribers.length === 0) {
      return NextResponse.json({
        error: `Cohort ${cohort} (${cohortTag}) has no sendable subscribers.`,
      }, { status: 404 });
    }

    // For A/B testing on cohort 1, split in half
    let targetSubscribers = cohortSubscribers;
    if (variant && cohort === 1) {
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
        campaignId: CAMPAIGN_ID,
        cohort,
        cohortTag,
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
        cohort_id: cohortTag,
        email_id: EMAIL_TAG[emailNumber as EmailNumber],
        variant: variantTagValue,
        status: 'pending',
        initiated_by: user.id,
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
          .eq('cohort_id', cohortTag)
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
      cohortTag,
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
    const emails = await Promise.all(targetSubscribers.map(async subscriber => {
      const unsubscribeUrl = generateUnsubscribeUrl(subscriber.email);
      const content = await getCampaignEmailContent(emailNumber, {
        unsubscribeUrl,
        variant,
        filings: filings || undefined,
        subscriberId: subscriber.id,
        emailId: emailTag,
      });

      return {
        from: 'TLDRSec <notifications@tldrsec.app>',
        to: subscriber.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [
          { name: 'campaign', value: `cohort${cohort}-email${emailNumber}` },
          { name: 'campaignId', value: CAMPAIGN_ID },
          { name: 'cohortId', value: cohortTag },
          { name: 'emailId', value: emailTag },
          { name: 'subscriberId', value: subscriber.id },
          { name: 'variant', value: variant || 'none' },
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
      adminUser: user.id,
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
      cohort,
      emailNumber,
    });
    return NextResponse.json({ error: 'Campaign send failed' }, { status: 500 });
  }
}
