import { sendEmail } from './email-core';
import { EmailMessage } from './types';
import { logger } from '../logging';

const trialEmailLogger = logger.child('trial-emails');

interface TrialEmailParams {
  email: string;
  userId: string;
}

interface TrialWelcomeParams extends TrialEmailParams {
  trialEndsAt: Date;
  name?: string;
}

interface TrialReminderParams extends TrialEmailParams {
  daysRemaining: number;
  trialEndsAt: Date;
}

interface TrialExpirationParams extends TrialEmailParams {
  trialExpiredAt: Date;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';

/**
 * Send welcome email when trial starts
 */
export async function sendTrialWelcomeEmail(
  params: TrialWelcomeParams
): Promise<void> {
  const { email, userId, trialEndsAt, name } = params;

  const message: EmailMessage = {
    to: email,
    subject: 'Welcome to your 7-day tldrSEC trial!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">Welcome to tldrSEC${name ? `, ${name}` : ''}!</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Your 7-day free trial has started. Here's what you get:
        </p>
        <ul style="color: #4a4a5a; font-size: 16px; line-height: 1.8;">
          <li>Track up to 3 companies</li>
          <li>All SEC filing types (10-K, 10-Q, 8-K, Form 4, and more)</li>
          <li>AI-powered summaries delivered to your inbox</li>
        </ul>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Your trial ends on <strong>${trialEndsAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/dashboard" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Go to Dashboard
          </a>
        </div>
        <p style="color: #9a9aaa; font-size: 14px;">
          Questions? Reply to this email and we'll help you out.
        </p>
      </div>
    `,
    text: `Welcome to tldrSEC${name ? `, ${name}` : ''}! Your 7-day free trial has started. Track up to 3 companies with all SEC filing types. Your trial ends on ${trialEndsAt.toLocaleDateString()}. Visit ${APP_URL}/dashboard to get started.`,
    tags: ['type:trial-welcome'],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send trial welcome email', {
      userId,
      error: result.error?.message,
    });
    throw new Error(result.error?.message || 'Failed to send trial welcome email');
  }

  trialEmailLogger.info('Trial welcome email sent', { userId });
}

/**
 * Send reminder email before trial expires
 */
export async function sendTrialReminderEmail(
  params: TrialReminderParams
): Promise<void> {
  const { email, userId, daysRemaining, trialEndsAt } = params;

  const urgency = daysRemaining <= 1 ? 'expires tomorrow' : `expires in ${daysRemaining} days`;

  const message: EmailMessage = {
    to: email,
    subject: `Your tldrSEC trial ${urgency}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">Your trial ${urgency}</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Your free trial ends on <strong>${trialEndsAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>.
          Upgrade now to keep receiving AI-powered SEC filing summaries.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/dashboard/billing" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Upgrade Now
          </a>
        </div>
        <p style="color: #9a9aaa; font-size: 14px;">
          After your trial ends, you'll still be able to access the dashboard and view existing summaries, but you won't receive new email notifications.
        </p>
      </div>
    `,
    text: `Your tldrSEC trial ${urgency}. Your trial ends on ${trialEndsAt.toLocaleDateString()}. Upgrade now at ${APP_URL}/dashboard/billing to keep receiving AI-powered SEC filing summaries.`,
    tags: ['type:trial-reminder', `days-remaining:${daysRemaining}`],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send trial reminder email', {
      userId,
      daysRemaining,
      error: result.error?.message,
    });
    throw new Error(result.error?.message || 'Failed to send trial reminder email');
  }

  trialEmailLogger.info('Trial reminder email sent', { userId, daysRemaining });
}

/**
 * Send notification when trial has expired
 */
export async function sendTrialExpirationEmail(
  params: TrialExpirationParams
): Promise<void> {
  const { email, userId, trialExpiredAt } = params;

  const message: EmailMessage = {
    to: email,
    subject: 'Your tldrSEC trial has ended',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">Your trial has ended</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Your 7-day free trial ended on ${trialExpiredAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
        </p>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          You can still access the dashboard and view your existing summaries, but you won't receive new filing notifications until you upgrade.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/dashboard/billing" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Upgrade to Continue
          </a>
        </div>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Plans start at <strong>$199/month</strong> with support for up to 25 tickers and all filing types.
        </p>
      </div>
    `,
    text: `Your tldrSEC trial has ended. Your 7-day trial ended on ${trialExpiredAt.toLocaleDateString()}. Upgrade at ${APP_URL}/dashboard/billing to continue receiving SEC filing summaries. Plans start at $199/month.`,
    tags: ['type:trial-expiration'],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send trial expiration email', {
      userId,
      error: result.error?.message,
    });
    throw new Error(result.error?.message || 'Failed to send trial expiration email');
  }

  trialEmailLogger.info('Trial expiration email sent', { userId });
}
