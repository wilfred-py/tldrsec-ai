import { getPrismaClient } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email';
import { getEmailTemplate } from '@/lib/email/templates';
import { EmailType } from '@/lib/email/types';

interface SendOnboardingFallbackNoticeArgs {
  userId: string;
  email: string;
  recipientName: string;
  trackedTickers: string[];
}

interface SendResult {
  delivered: boolean;
  reason?: 'already_sent' | 'send_failed' | 'internal_error';
  error?: string;
}

/**
 * Send the long-tail "we're watching your tickers" notice when no cached
 * cross-user summaries exist for any of the user's tracked tickers.
 *
 * Idempotent on `User.onboardingFirstEmailSentAt` — same guard as the
 * cached-summary path. Both paths write the same User column on success
 * so re-onboarding never double-sends.
 */
export async function sendOnboardingFallbackNotice(
  args: SendOnboardingFallbackNoticeArgs
): Promise<SendResult> {
  const prisma = getPrismaClient();

  // Idempotency guard — defense in depth (also checked by deliverFirstOnboardingEmail).
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { onboardingFirstEmailSentAt: true },
  });
  if (user?.onboardingFirstEmailSentAt) {
    return { delivered: false, reason: 'already_sent' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';
  const dashboardUrl = `${appUrl}/dashboard`;
  const unsubscribeUrl = `${appUrl}/dashboard/settings`;

  try {
    const { html, text } = await getEmailTemplate(
      EmailType.ONBOARDING_FALLBACK_NOTICE,
      {
        recipientName: args.recipientName,
        trackedTickers: args.trackedTickers,
        dashboardUrl,
        unsubscribeUrl,
      } as Record<string, unknown>
    );

    const subject =
      args.trackedTickers.length > 0
        ? `We're watching ${args.trackedTickers.slice(0, 3).join(', ')}${args.trackedTickers.length > 3 ? ` +${args.trackedTickers.length - 3}` : ''}`
        : "We're watching your tickers";

    const result = await sendEmail({
      to: args.email,
      subject,
      html,
      text,
      tags: ['type:onboarding-fallback-notice'],
    });

    if (!result.success) {
      return {
        delivered: false,
        reason: 'send_failed',
        error: result.error?.message,
      };
    }

    // Mark the onboarding-first-email column so this user never gets the
    // cached path or the fallback again. summaryId stays null (no summary
    // was sent).
    await prisma.user.update({
      where: { id: args.userId },
      data: { onboardingFirstEmailSentAt: new Date() },
    });

    return { delivered: true };
  } catch (err) {
    return {
      delivered: false,
      reason: 'internal_error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
