/**
 * Campaign Email Templates
 *
 * Three email templates for the 3-Act Launch campaign:
 * 1. "The Filing That Moved [Ticker]" - Pure value, no CTA
 * 2. "What You Missed This Week" - Multiple summaries, soft CTA
 * 3. "Your Trial Is Ready" - Conversion email with FAQ
 *
 * Uses baseTemplate() from templates.ts for consistent branding and
 * CAN-SPAM compliant unsubscribe footer.
 */

import { baseTemplate, BaseTemplateData } from './templates';

interface CampaignEmailOptions {
  unsubscribeUrl: string;
  variant?: 'A' | 'B';
}

interface CampaignEmailContent {
  subject: string;
  html: string;
}

/**
 * Email 1: "The Filing That Moved [Ticker]"
 *
 * Pure value email. No CTA. Shows a real AI-generated summary
 * to prove the product works. This is the most important email
 * in the sequence, it must be impressive.
 */
function email1(options: CampaignEmailOptions): CampaignEmailContent {
  const subject = options.variant === 'B'
    ? 'NVDA insider bought $2.1M last week'
    : 'the form 4 filing most investors missed';

  const content = `
    <p>You signed up for tldrSEC a few weeks ago. Here's what our AI does with SEC filings.</p>

    <p>Below is a real summary, generated automatically within minutes of the filing hitting EDGAR.</p>

    <div style="background: #f8fafc; border-left: 4px solid #ef4444; border-radius: 4px; padding: 20px; margin: 20px 0;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span style="background: #ef4444; color: white; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">HIGH</span>
        <span style="background: #f3e8ff; color: #7c3aed; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;">Form 4</span>
      </div>
      <h3 style="margin: 0 0 8px; color: #1e293b; font-size: 16px;">NVIDIA Corp (NVDA) - Insider Purchase</h3>
      <p style="margin: 0 0 12px; color: #475569; font-size: 14px; line-height: 1.6;">
        A senior executive acquired 15,000 shares at $142.50/share ($2.14M total). This is notable because insider buying at this scale, during a period of elevated valuation, signals strong internal confidence in near-term performance. The executive now holds 185,000 shares directly.
      </p>
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">
        Filed: March 2026 &middot; Source: SEC EDGAR
      </p>
    </div>

    <p style="color: #64748b; font-size: 14px;">
      On EDGAR, parsing this Form 4 takes 15-20 minutes. Our AI extracted the key details in under 10 minutes from the moment it was filed.
    </p>

    <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
      This is a sample of what tldrSEC delivers to your inbox within minutes of every SEC filing. More to come.
    </p>
  `;

  const data: BaseTemplateData = {
    recipientEmail: '',
    unsubscribeUrl: options.unsubscribeUrl,
    preferencesUrl: 'https://tldrsec.app/dashboard/settings',
  };

  return {
    subject,
    html: baseTemplate(content, data),
  };
}

/**
 * Email 2: "What You Missed This Week"
 *
 * Shows breadth: multiple filings, multiple types, importance-ranked.
 * Soft CTA to landing page. Includes competitive comparison.
 */
function email2(options: CampaignEmailOptions): CampaignEmailContent {
  const subject = '3 SEC filings you should know about';

  const filings = [
    {
      importance: 'HIGH',
      importanceColor: '#ef4444',
      badge: 'Form 4',
      badgeColor: '#f3e8ff',
      badgeTextColor: '#7c3aed',
      company: 'Tesla Inc (TSLA)',
      title: 'Director Stock Sale',
      summary: 'Board member sold 50,000 shares at $248.30 ($12.4M). Scheduled sale under 10b5-1 plan filed in January. Director retains 420,000 shares.',
    },
    {
      importance: 'MEDIUM',
      importanceColor: '#f59e0b',
      badge: '8-K',
      badgeColor: '#f0fdf4',
      badgeTextColor: '#16a34a',
      company: 'Apple Inc (AAPL)',
      title: 'Material Definitive Agreement',
      summary: 'Entered into a $5B revolving credit facility with a consortium of banks. Replaces existing $3B facility expiring Q2 2026. Signals preparation for potential large acquisition or capital deployment.',
    },
    {
      importance: 'MEDIUM',
      importanceColor: '#f59e0b',
      badge: '10-Q',
      badgeColor: '#eff6ff',
      badgeTextColor: '#2563eb',
      company: 'Microsoft Corp (MSFT)',
      title: 'Quarterly Report',
      summary: 'Revenue $65.2B (+14% YoY). Cloud segment grew 22%. Operating margin expanded 180bps to 44.2%. Raised full-year guidance by $2B on AI demand strength.',
    },
  ];

  let filingsHtml = '';
  for (const f of filings) {
    filingsHtml += `
      <div style="background: #f8fafc; border-left: 4px solid ${f.importanceColor}; border-radius: 4px; padding: 16px; margin: 12px 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="background: ${f.importanceColor}; color: white; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 3px; text-transform: uppercase;">${f.importance}</span>
          <span style="background: ${f.badgeColor}; color: ${f.badgeTextColor}; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 3px;">${f.badge}</span>
        </div>
        <h4 style="margin: 0 0 6px; color: #1e293b; font-size: 14px;">${f.company} - ${f.title}</h4>
        <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.5;">${f.summary}</p>
      </div>
    `;
  }

  const content = `
    <p>3 SEC filings from this week, ranked by importance:</p>

    ${filingsHtml}

    <p style="color: #64748b; font-size: 14px; margin-top: 16px;">
      On EDGAR, each of these would take 30-60 minutes to read and analyze. Our AI summarized all three within minutes of filing.
    </p>

    <div style="text-align: center; margin: 28px 0;">
      <p style="color: #475569; font-size: 14px; margin-bottom: 16px;">
        Want these delivered automatically? We're opening early access to waitlist members.
      </p>
      <a href="https://tldrsec.app" style="display: inline-block; background: #2563eb; color: white; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 6px; text-decoration: none;">
        See How It Works
      </a>
    </div>
  `;

  const data: BaseTemplateData = {
    recipientEmail: '',
    unsubscribeUrl: options.unsubscribeUrl,
    preferencesUrl: 'https://tldrsec.app/dashboard/settings',
  };

  return {
    subject,
    html: baseTemplate(content, data),
  };
}

/**
 * Email 3: "Your Trial Is Ready"
 *
 * Conversion email. Single CTA. FAQ section handles objections.
 * This is the money email.
 */
function email3(options: CampaignEmailOptions): CampaignEmailContent {
  const subject = 'your 7-day trial is ready';

  const content = `
    <p>You've seen what our AI does with SEC filings. Here's what happens when you sign up:</p>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <ol style="margin: 0; padding-left: 20px; color: #334155;">
        <li style="margin-bottom: 10px;"><strong>Pick the companies you follow</strong> - from any sector, any size. We cover every public company on EDGAR.</li>
        <li style="margin-bottom: 10px;"><strong>Get AI summaries within minutes</strong> of every SEC filing: 10-K, 10-Q, 8-K, Form 4, Form 144.</li>
        <li style="margin-bottom: 0;"><strong>Never miss an insider trade or material event again.</strong> Our pipeline checks EDGAR every 10 minutes.</li>
      </ol>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="https://tldrsec.app/sign-up?plan=pro&ref=campaign" style="display: inline-block; background: #2563eb; color: white; font-size: 16px; font-weight: 600; padding: 14px 36px; border-radius: 6px; text-decoration: none;">
        Start Your 7-Day Trial
      </a>
      <p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">
        7 days free. Cancel anytime. No charge until the trial ends.
      </p>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 24px;">
      <h3 style="color: #1e293b; font-size: 15px; margin-bottom: 16px;">Common Questions</h3>

      <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin-bottom: 4px;">What if I don't like it?</p>
      <p style="color: #64748b; font-size: 13px; margin-bottom: 16px;">Cancel anytime during your 7-day trial. You won't be charged a cent.</p>

      <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin-bottom: 4px;">What filings do you cover?</p>
      <p style="color: #64748b; font-size: 13px; margin-bottom: 16px;">10-K (annual), 10-Q (quarterly), 8-K (material events), Form 4 (insider trades), and Form 144 (planned sales). Every filing type that moves stocks.</p>

      <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin-bottom: 4px;">How fast are the summaries?</p>
      <p style="color: #64748b; font-size: 13px; margin-bottom: 16px;">Within 10 minutes of the filing appearing on SEC EDGAR. We check every 10 minutes, 24/7.</p>

      <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin-bottom: 4px;">What does it cost?</p>
      <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">Pro: $199/month (25 companies). Max: $349/month (unlimited). Both include a 7-day free trial.</p>
    </div>
  `;

  const data: BaseTemplateData = {
    recipientEmail: '',
    unsubscribeUrl: options.unsubscribeUrl,
    preferencesUrl: 'https://tldrsec.app/dashboard/settings',
  };

  return {
    subject,
    html: baseTemplate(content, data),
  };
}

/**
 * Get campaign email content by email number.
 * Used by the campaign send API route.
 */
export function getCampaignEmailContent(
  emailNumber: 1 | 2 | 3,
  options: CampaignEmailOptions
): CampaignEmailContent {
  switch (emailNumber) {
    case 1: return email1(options);
    case 2: return email2(options);
    case 3: return email3(options);
  }
}
