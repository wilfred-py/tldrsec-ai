'use server';

import { getPrismaClient } from '@/lib/db/prisma';
import { getEmailTemplate } from './templates';
import { EmailType, EmailMessage } from './types';
import { sendEmail } from './index';
import { FOUNDER_REPLY_TO } from './config';
import { logger } from '../logging';
import { SecureEmailLogger } from './security-helpers';

const secureLogger = new SecureEmailLogger(logger.child('welcome-service'));

/**
 * Queue a welcome email to be sent asynchronously (fire-and-forget).
 * Takes pre-fetched user data so callers avoid redundant auth/DB calls.
 *
 * @param userId - Database user ID (not Clerk ID)
 * @param email - User's email address
 * @param name - User's display name
 * @returns Promise that resolves when email is queued (not sent)
 */
export async function queueWelcomeEmail(
  userId: string,
  email: string,
  name: string
): Promise<void> {
  // Run email sending in background - don't block the caller
  setImmediate(async () => {
    try {
      // Get user's tracked tickers from DB
      const dbUser = await getPrismaClient().user.findUnique({
        where: { id: userId },
        include: { tickers: true }
      });

      if (!dbUser) {
        secureLogger.error('User not found for welcome email', { userId });
        return;
      }

      const selectedTickers = dbUser.tickers.map(ticker => ticker.symbol);

      // Generate welcome email content
      const { html, text } = await getEmailTemplate(EmailType.WELCOME, {
        recipientName: name || 'there',
        recipientEmail: email,
        selectedTickers,
        unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app'}/dashboard/settings`,
        preferencesUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings`
      });

      // Prepare email message. Explicit replyTo (not just the config default) so
      // replies route to the founder inbox even if EMAIL_DEFAULT_REPLY_TO is unset
      // or accidentally rolled back. Belt-and-braces against silent regression.
      const message: EmailMessage = {
        to: email,
        subject: 'Welcome to tldrSEC!',
        replyTo: FOUNDER_REPLY_TO,
        html,
        text,
        tags: ['type:welcome', 'onboarding:complete'],
        metadata: {
          userId,
          type: 'welcome',
          tickerCount: selectedTickers.length,
          summaryCount: 0
        }
      };

      // Send email
      const result = await sendEmail(message);

      if (!result.success) {
        secureLogger.warn('Welcome email failed to send', {
          userId,
          error: result.error?.message
        });
      } else {
        secureLogger.info('Welcome email sent successfully', {
          userId,
          emailId: result.id
        });
      }
    } catch (error) {
      secureLogger.error('Exception in queueWelcomeEmail', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
