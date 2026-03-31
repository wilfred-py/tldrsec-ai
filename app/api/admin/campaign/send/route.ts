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
 */

import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { Resend } from 'resend';
import { generateUnsubscribeUrl } from '@/lib/email/unsubscribe-tokens';
import { logger } from '@/lib/logging';

export const dynamic = 'force-dynamic';

const campaignLogger = logger.child('campaign-send');

const COHORT_SIZE = {
  1: 40,  // Most recent signups
  2: 40,  // Middle
  3: 45,  // Oldest
} as const;

type CohortNumber = 1 | 2 | 3;
type EmailNumber = 1 | 2 | 3;

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

    // Fetch all active subscribers (not unsubscribed), ordered by signup date desc
    const { data: subscribers, error } = await supabase
      .from('newsletter_subscribers')
      .select('email, subscribed_at')
      .is('unsubscribed_at', null)
      .order('subscribed_at', { ascending: false });

    if (error) {
      campaignLogger.error('Failed to fetch subscribers', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
    }

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ error: 'No active subscribers found' }, { status: 404 });
    }

    // Split into cohorts (most recent first)
    const cohortStart = cohort === 1 ? 0 : cohort === 2 ? COHORT_SIZE[1] : COHORT_SIZE[1] + COHORT_SIZE[2];
    const cohortEnd = cohortStart + COHORT_SIZE[cohort as CohortNumber];
    const cohortSubscribers = subscribers.slice(cohortStart, cohortEnd);

    if (cohortSubscribers.length === 0) {
      return NextResponse.json({
        error: `Cohort ${cohort} is empty. Total subscribers: ${subscribers.length}`,
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
        cohort,
        emailNumber,
        variant: variant || null,
        totalSubscribers: subscribers.length,
        cohortSize: cohortSubscribers.length,
        targetSize: targetSubscribers.length,
        sampleEmails: targetSubscribers.slice(0, 3).map(s => {
          const [local, domain] = s.email.split('@');
          return `${local.substring(0, 2)}***@${domain}`;
        }),
      });
    }

    // Queue emails via Resend batch (up to 100 per batch call)
    const resend = new Resend(resendApiKey);
    const emails = targetSubscribers.map(subscriber => {
      const unsubscribeUrl = generateUnsubscribeUrl(subscriber.email);
      const content = getCampaignEmailContent(emailNumber, {
        unsubscribeUrl,
        variant,
      });

      return {
        from: 'TLDRSec <notifications@tldrsec.app>',
        to: subscriber.email,
        subject: content.subject,
        html: content.html,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [
          { name: 'campaign', value: `cohort${cohort}-email${emailNumber}` },
          { name: 'variant', value: variant || 'none' },
        ],
      };
    });

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

    campaignLogger.info('Campaign emails sent', {
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
