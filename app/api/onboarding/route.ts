/**
 * Unified Onboarding API
 *
 * POST /api/onboarding?action=deliver-summaries → deliver cached summaries to new user
 * POST /api/onboarding?action=welcome-email     → send welcome email
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { deliverCachedSummaries } from '@/lib/onboarding/cached-summary-delivery';
import { sendEmail } from '@/lib/email';
import { getEmailTemplate } from '@/lib/email/templates';
import { EmailType } from '@/lib/email/types';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  switch (action) {
    case 'deliver-summaries':
      return handleDeliverSummaries();
    case 'welcome-email':
      return handleWelcomeEmail(req);
    default:
      return NextResponse.json({ error: 'Unknown action. Use ?action=deliver-summaries or ?action=welcome-email' }, { status: 400 });
  }
}

async function handleDeliverSummaries() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    const primaryEmail = user.emailAddresses[0]?.emailAddress;
    if (!primaryEmail) {
      return NextResponse.json({ error: 'no_email' }, { status: 400 });
    }

    const prisma = getPrismaClient();
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { authProviderId: userId },
          { email: primaryEmail },
        ],
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'user_not_in_db' }, { status: 404 });
    }

    const userName = dbUser.name || user.firstName || 'there';
    const result = await deliverCachedSummaries(dbUser.id, primaryEmail, userName);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[deliver-summaries] Error:', error);
    return NextResponse.json({ delivered: 0, reason: 'internal_error' }, { status: 500 });
  }
}

async function handleWelcomeEmail(req: NextRequest) {
  try {
    const prisma = getPrismaClient();

    const authResult = await auth();
    if (!authResult || !authResult.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authResult.userId;

    const user = await prisma.user.findFirst({
      where: { authProviderId: userId }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    const { data: userData } = await req.json();
    const email = userData?.email;

    if (!email) {
      return NextResponse.json({ error: 'Email not provided' }, { status: 400 });
    }

    const { html, text } = getEmailTemplate(EmailType.WELCOME, {
      recipientName: user.name || 'there',
      recipientEmail: email,
      dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications`,
      preferencesUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings`
    });

    const result = await sendEmail({
      to: email,
      subject: 'Welcome to TLDR SEC',
      html,
      text,
      tags: ['type:welcome', 'content:onboarding'],
      metadata: { userId: user.id, type: 'welcome-email' }
    });

    if (!result.success) {
      logger.error('Failed to send welcome email', { userId: user.id, error: result.error });
      return NextResponse.json({ error: 'Failed to send welcome email' }, { status: 500 });
    }

    logger.info('Sent welcome email', { userId: user.id, emailId: result.id });
    return NextResponse.json({ success: true, message: 'Welcome email sent successfully' });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return NextResponse.json({ error: 'Failed to send welcome email' }, { status: 500 });
  }
}
