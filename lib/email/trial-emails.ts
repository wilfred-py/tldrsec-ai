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
          Your 7-day trial has started. Here's what you get:
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
    text: `Welcome to tldrSEC${name ? `, ${name}` : ''}! Your 7-day trial has started. Track up to 3 companies with all SEC filing types. Your trial ends on ${trialEndsAt.toLocaleDateString()}. Visit ${APP_URL}/dashboard to get started.`,
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
          Your trial ends on <strong>${trialEndsAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>.
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
        <div style="margin-bottom: 24px;">
          <img src="https://tldrsec.app/images/logo-email.png" alt="tldrSEC" width="120" height="24" style="display:block;width:120px;height:24px;border:0;">
        </div>
        <h1 style="color: #1a1a2e; font-size: 24px;">Your trial has ended</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Your 7-day trial ended on ${trialExpiredAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
        </p>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          You can still access the dashboard and view your existing summaries, but you won't receive new filing notifications until you upgrade.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/dashboard/billing" style="background-color: #0079F2; background: linear-gradient(135deg, #0079F2 0%, #8B5CF6 100%); color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 14px 0 rgba(0, 121, 242, 0.39);">
            Upgrade to Continue
          </a>
        </div>
      </div>
    `,
    text: `Your tldrSEC trial has ended. Your 7-day trial ended on ${trialExpiredAt.toLocaleDateString()}. Upgrade at ${APP_URL}/dashboard/billing to continue receiving SEC filing summaries.`,
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

// --- Trial Nurture: Day 3 "What You'd Miss" ---

interface TrialDay3Params extends TrialEmailParams {
  summaryCount: number;
}

/**
 * Day 3: Show what they'd miss without tldrSEC.
 * Reinforce the status quo pain of reading filings manually.
 */
export async function sendTrialDay3Email(
  params: TrialDay3Params
): Promise<void> {
  const { email, userId, summaryCount } = params;

  const summaryLine = summaryCount > 0
    ? `In the last 3 days, we've delivered <strong>${summaryCount} filing ${summaryCount === 1 ? 'summary' : 'summaries'}</strong> to your inbox.`
    : `We're watching your tickers around the clock. As soon as new filings hit EDGAR, you'll get a summary.`;

  const message: EmailMessage = {
    to: email,
    subject: 'what you would have missed this week',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">What you'd miss without tldrSEC</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          ${summaryLine}
        </p>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Without tldrSEC, each of those filings would mean opening EDGAR, finding the document, reading 20-100 pages, and figuring out what actually matters. That's hours of work per filing.
        </p>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          With tldrSEC, you get the key takeaways in your inbox within 10 minutes. No EDGAR, no PDFs, no guesswork.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/dashboard" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            View Your Dashboard
          </a>
        </div>
      </div>
    `,
    text: `What you'd miss without tldrSEC. ${summaryCount > 0 ? `We've delivered ${summaryCount} summaries in 3 days.` : "We're watching your tickers."} Without tldrSEC, each filing means hours on EDGAR. With us, key takeaways in 10 minutes. Visit ${APP_URL}/dashboard.`,
    tags: ['type:trial-nurture-day3'],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send trial day 3 email', { userId, error: result.error?.message });
    throw new Error(result.error?.message || 'Failed to send trial day 3 email');
  }
  trialEmailLogger.info('Trial day 3 email sent', { userId, summaryCount });
}

// --- Trial Nurture: Day 4 "Trial Ending Soon" ---

interface TrialDay4Params extends TrialEmailParams {
  summaryCount: number;
  trialEndsAt: Date;
}

/**
 * Day 4: Trial ending soon. Show hours saved + filing count.
 * Create urgency with concrete value delivered.
 */
export async function sendTrialDay4Email(
  params: TrialDay4Params
): Promise<void> {
  const { email, userId, summaryCount, trialEndsAt } = params;
  const hoursSaved = Math.round(summaryCount * 1.5 * 10) / 10; // 1.5 hrs avg per filing

  const message: EmailMessage = {
    to: email,
    subject: `your trial ends ${trialEndsAt.toLocaleDateString('en-US', { weekday: 'long' })}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">Your trial ends in 3 days</h1>

        <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="color: #16a34a; font-size: 28px; font-weight: 700; margin: 0;">${summaryCount} filings</p>
          <p style="color: #4a4a5a; font-size: 14px; margin: 4px 0 0;">summarized &middot; ~${hoursSaved} hours saved</p>
        </div>

        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          That's what tldrSEC has done for you since you signed up. After ${trialEndsAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, you'll stop receiving filing summaries unless you upgrade.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/subscribe" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Keep My Summaries
          </a>
        </div>
        <p style="color: #9a9aaa; font-size: 14px;">
          Plans start at $199/month. Cancel anytime.
        </p>
      </div>
    `,
    text: `Your trial ends in 3 days. So far: ${summaryCount} filings summarized, ~${hoursSaved} hours saved. After ${trialEndsAt.toLocaleDateString()}, you'll stop receiving summaries. Upgrade at ${APP_URL}/subscribe. Plans start at $199/month.`,
    tags: ['type:trial-nurture-day4'],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send trial day 4 email', { userId, error: result.error?.message });
    throw new Error(result.error?.message || 'Failed to send trial day 4 email');
  }
  trialEmailLogger.info('Trial day 4 email sent', { userId, summaryCount, hoursSaved });
}

// --- Trial Nurture: Day 6 "Last Day" ---

/**
 * Day 6: Last day. Short, direct, no fluff.
 * "Tomorrow you go back to reading filings manually."
 */
export async function sendTrialDay6Email(
  params: TrialEmailParams
): Promise<void> {
  const { email, userId } = params;

  const message: EmailMessage = {
    to: email,
    subject: 'last day of your tldrSEC trial',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">Tomorrow you go back to reading filings manually.</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Your trial ends tomorrow. After that, no more AI summaries, no more instant alerts, no more skipping the 50-page 10-Ks.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/subscribe" style="background-color: #dc2626; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Upgrade Now
          </a>
        </div>
        <p style="color: #9a9aaa; font-size: 14px; text-align: center;">
          $199/month &middot; Cancel anytime &middot; All filing types included
        </p>
      </div>
    `,
    text: `Tomorrow you go back to reading filings manually. Your trial ends tomorrow. No more AI summaries, no more instant alerts. Upgrade at ${APP_URL}/subscribe. $199/month, cancel anytime.`,
    tags: ['type:trial-nurture-day6'],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send trial day 6 email', { userId, error: result.error?.message });
    throw new Error(result.error?.message || 'Failed to send trial day 6 email');
  }
  trialEmailLogger.info('Trial day 6 email sent', { userId });
}

// --- Trial Nurture: Day 10 Win-Back ---

interface TrialDay10WinBackParams extends TrialEmailParams {
  summaryCount: number;
  hoursSaved: number;
}

/**
 * Day 10: Win-back email for expired trial users.
 * Show what they missed since expiration.
 */
export async function sendTrialDay10WinBackEmail(
  params: TrialDay10WinBackParams
): Promise<void> {
  const { email, userId, summaryCount, hoursSaved } = params;

  const message: EmailMessage = {
    to: email,
    subject: `${summaryCount} filings since your trial ended`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">We've been watching your tickers.</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Since your trial ended, there have been <strong>${summaryCount} new filings</strong> for the companies you were tracking. That's roughly <strong>${hoursSaved} hours</strong> of reading you'd need to do manually.
        </p>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          Your tickers are still saved. Upgrade and we'll start delivering summaries again immediately.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/subscribe" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Resume My Summaries
          </a>
        </div>
        <p style="color: #9a9aaa; font-size: 14px;">
          $199/month &middot; Cancel anytime &middot; All filing types included
        </p>
      </div>
    `,
    text: `We've been watching your tickers. Since your trial ended, there have been ${summaryCount} new filings (~${hoursSaved} hours of reading). Your tickers are still saved. Upgrade at ${APP_URL}/subscribe to resume summaries. $199/month, cancel anytime.`,
    tags: ['type:trial-nurture-day10'],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send trial day 10 win-back email', { userId, error: result.error?.message });
    throw new Error(result.error?.message || 'Failed to send trial day 10 win-back email');
  }
  trialEmailLogger.info('Trial day 10 win-back email sent', { userId, summaryCount });
}

// --- Trial Nurture: Day 14 Final Win-Back ---

/**
 * Day 14: Final win-back attempt. Short, direct.
 * "We'll stop emailing after this."
 */
export async function sendTrialDay14FinalWinBackEmail(
  params: TrialEmailParams
): Promise<void> {
  const { email, userId } = params;

  const message: EmailMessage = {
    to: email,
    subject: 'last email from tldrSEC',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">This is our last email.</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          We won't email you again after this. If you ever want AI-powered SEC filing summaries back, your account and saved tickers will be waiting.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/subscribe" style="background-color: #4b5563; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Reactivate Anytime
          </a>
        </div>
      </div>
    `,
    text: `This is our last email. We won't email you again after this. If you ever want AI-powered SEC filing summaries back, your account and saved tickers will be waiting. Reactivate anytime at ${APP_URL}/subscribe.`,
    tags: ['type:trial-nurture-day14'],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send trial day 14 final email', { userId, error: result.error?.message });
    throw new Error(result.error?.message || 'Failed to send trial day 14 final email');
  }
  trialEmailLogger.info('Trial day 14 final email sent', { userId });
}

// --- Trial Setup Nudge ---

/**
 * Setup nudge for trial users who haven't added any tickers.
 * "Add your first ticker and we'll start delivering summaries."
 */
export async function sendTrialSetupNudgeEmail(
  params: TrialEmailParams
): Promise<void> {
  const { email, userId } = params;

  const message: EmailMessage = {
    to: email,
    subject: 'you haven\'t added any tickers yet',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">Your trial is running, but we can't help yet.</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          You signed up for tldrSEC but haven't told us which companies to watch. Add your first ticker and we'll start delivering AI-powered filing summaries to your inbox.
        </p>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          It takes 30 seconds. Just search for a company and click "Track."
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/dashboard" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Add Your First Ticker
          </a>
        </div>
      </div>
    `,
    text: `Your trial is running, but we can't help yet. You signed up but haven't added any tickers. Add your first ticker at ${APP_URL}/dashboard and we'll start delivering AI-powered filing summaries. It takes 30 seconds.`,
    tags: ['type:trial-setup-nudge'],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send trial setup nudge email', { userId, error: result.error?.message });
    throw new Error(result.error?.message || 'Failed to send trial setup nudge email');
  }
  trialEmailLogger.info('Trial setup nudge email sent', { userId });
}

// --- Checkout Reminder (Q3) ---

interface CheckoutReminderParams {
  email: string;
  sessionId: string;
  planType: string;
}

/**
 * Send reminder email to users who paid via direct checkout but haven't
 * completed onboarding yet (no DB user record exists for their email).
 * Called from the Stripe webhook when handleCheckoutCompleted finds no
 * matching user in the database.
 */
export async function sendCheckoutReminderEmail(
  params: CheckoutReminderParams
): Promise<void> {
  const { email, sessionId, planType } = params;

  const message: EmailMessage = {
    to: email,
    subject: 'Complete your tldrSEC setup',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e; font-size: 24px;">You're almost there!</h1>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          We received your ${planType} subscription payment — thank you! To start receiving
          AI-powered SEC filing summaries, you just need to complete your account setup.
        </p>
        <p style="color: #4a4a5a; font-size: 16px; line-height: 1.6;">
          This takes less than a minute: pick the companies you want to track and set your
          notification preferences.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${APP_URL}/sign-up" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Complete Setup
          </a>
        </div>
        <p style="color: #9a9aaa; font-size: 14px;">
          Your subscription is active and will be automatically linked to your account once
          you complete setup. If you need help, reply to this email.
        </p>
      </div>
    `,
    text: `You're almost there! We received your ${planType} subscription payment. To start receiving AI-powered SEC filing summaries, complete your account setup at ${APP_URL}/sign-up. Your subscription will be automatically linked once you finish.`,
    tags: ['type:checkout-reminder', `plan:${planType.toLowerCase()}`],
  };

  const result = await sendEmail(message);
  if (!result.success) {
    trialEmailLogger.error('Failed to send checkout reminder email', {
      email,
      sessionId,
      error: result.error?.message,
    });
    throw new Error(result.error?.message || 'Failed to send checkout reminder email');
  }

  trialEmailLogger.info('Checkout reminder email sent', { email, sessionId, planType });
}
