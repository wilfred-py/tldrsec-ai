/**
 * Campaign Email Templates
 *
 * Three email templates for the 3-Act Launch campaign:
 * 1. "The Filing That Moved [Ticker]" - Pure value, no CTA
 * 2. "What You Missed This Week" - Multiple summaries, soft CTA
 * 3. "Your Trial Is Ready" - Conversion email with FAQ
 *
 * Self-contained table-based HTML for maximum email client compatibility.
 * Does NOT use baseTemplate() — campaign emails have their own minimal design.
 */

interface CampaignEmailOptions {
  unsubscribeUrl: string;
  variant?: 'A' | 'B';
}

interface CampaignEmailContent {
  subject: string;
  html: string;
}

const FONT_STACK = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

const FOUNDER_PS = `
<tr><td style="padding:16px 15px 0;">
  <div style="border-top:1px solid #e6e6e6;padding-top:16px;">
    <p style="font-size:13px;line-height:1.6;color:#6B7280;font-style:italic;margin:0;">
      <span style="font-weight:600;color:#374151;font-style:normal;">P.S.</span>
      I built tldrSEC because I got tired of reading SEC filings manually.
      A single 10-K runs 100-200 pages. 10-Qs are 50-80. Even Form 4s pile up fast
      when you're tracking multiple companies.
    </p>
    <p style="font-size:13px;line-height:1.6;color:#6B7280;font-style:italic;margin:12px 0 0 0;">
      This is what our AI does with all of them, minutes after they hit EDGAR.
    </p>
  </div>
</td></tr>`;

function campaignShell(headerRight: string, body: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{margin:0;padding:20px;background:#f0f0f0;font-family:${FONT_STACK};}</style>
</head>
<body>
<table width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#ffffff;border:1px solid #e6e6e6;border-radius:8px;overflow:hidden;">
<tbody>
<!-- Header -->
<tr><td style="padding:20px 15px 16px;border-bottom:1px solid #e6e6e6;">
<table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>
<td><span style="font-size:18px;font-weight:700;color:#000;">tldrSEC</span></td>
<td style="text-align:right;"><span style="font-size:12px;color:#6B7280;">${headerRight}</span></td>
</tr></tbody></table>
</td></tr>

${body}

<!-- Footer -->
<tr><td style="padding:16px 15px;border-top:1px solid #e6e6e6;text-align:center;">
<p style="margin:0;font-size:11px;color:#9CA3AF;">tldrSEC | AI-Powered SEC Filing Summaries<br><a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe</a></p>
</td></tr>
</tbody>
</table>
</body>
</html>`;
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
    ? 'NVDA insider sold $17.1M last week'
    : 'the form 4 filing most investors missed';

  const body = `
<!-- Filing Header -->
<tr><td style="padding:20px 15px 16px;">
<div style="display:inline-block;padding:3px 8px;background:#F3F4F6;border-radius:4px;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">FORM 4 | INSIDER</div>
<h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#000;line-height:1.3;">NVDA: Jensen Huang<span style="font-weight:400;font-size:16px;color:#6B7280;">, CEO</span></h1>
<p style="margin:0;font-size:14px;color:#6B7280;">NVIDIA Corporation</p>
</td></tr>

<!-- Importance Badge -->
<tr><td style="padding:0 15px 12px;">
<span style="display:inline-block;padding:3px 10px;background:#FEE2E2;color:#991B1B;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:0.5px;">HIGH IMPORTANCE</span>
</td></tr>

<!-- Key Takeaway -->
<tr><td style="padding:0 15px 20px;">
<div style="border:1px solid #e6e6e6;border-radius:15px;padding:15px;">
<h2 style="margin:0 0 7px;font-size:16px;font-weight:600;color:#000;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">Key Takeaway</h2>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">Jensen Huang sold 120,000 shares at $142.50/share for a total of <strong style="color:#000;">$17.1M</strong>. This is part of a pre-announced 10b5-1 trading plan filed in Q3 2025. Huang still holds <strong style="color:#000;">89.4M shares</strong> (3.5% of outstanding), so this sale represents 0.13% of his total position. Not a bearish signal — routine planned diversification.</p>
</div>
</td></tr>

<!-- Transaction Table -->
<tr><td style="padding:0 15px 20px;">
<div style="border:1px solid #e6e6e6;border-radius:15px;overflow:hidden;">
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<thead><tr>
<th style="padding:10px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e6e6e6;color:#000;font-size:12px;text-transform:uppercase;background:#f8fafc;">Detail</th>
<th style="padding:10px 12px;text-align:right;font-weight:600;border-bottom:2px solid #e6e6e6;color:#000;font-size:12px;text-transform:uppercase;background:#f8fafc;">Value</th>
</tr></thead>
<tbody>
<tr><td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;">Transaction Type</td><td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;text-align:right;font-weight:600;">Open Market Sale</td></tr>
<tr style="background:#f8fafc;"><td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;">Shares</td><td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#EF4444;text-align:right;font-weight:600;font-family:Monaco,Consolas,monospace;">120,000 ↓</td></tr>
<tr><td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;">Price Per Share</td><td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;text-align:right;font-weight:600;font-family:Monaco,Consolas,monospace;">$142.50</td></tr>
<tr style="background:#f8fafc;"><td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;">Total Value</td><td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#000;text-align:right;font-weight:700;font-family:Monaco,Consolas,monospace;">$17.1M</td></tr>
<tr><td style="padding:10px 12px;font-size:14px;color:#374151;">Shares Remaining</td><td style="padding:10px 12px;font-size:14px;color:#374151;text-align:right;font-weight:600;font-family:Monaco,Consolas,monospace;">89.4M (3.5%)</td></tr>
</tbody>
</table>
</div>
</td></tr>

<!-- Sample note -->
<tr><td style="padding:0 15px 4px;text-align:center;">
<p style="margin:0;font-size:13px;color:#6B7280;line-height:1.5;">This is a sample of what <strong style="color:#374151;">tldrSEC</strong> delivers to your inbox within minutes of every SEC filing.</p>
</td></tr>

${FOUNDER_PS}`;

  return {
    subject,
    html: campaignShell('Mar 28, 2026', body, options.unsubscribeUrl),
  };
}

/**
 * Email 2: "What You Missed This Week"
 *
 * Shows breadth: multiple filings, multiple types, importance-ranked.
 * Soft CTA to landing page.
 */
function email2(options: CampaignEmailOptions): CampaignEmailContent {
  const subject = '3 SEC filings you should know about';

  const body = `
<!-- Headline -->
<tr><td style="padding:20px 15px 8px;">
<h1 style="margin:0;font-size:22px;font-weight:700;color:#000;line-height:1.3;">3 SEC Filings You Should Know About</h1>
<p style="margin:6px 0 0;font-size:14px;color:#6B7280;">Week of March 23–28, 2026</p>
</td></tr>

<!-- Filing 1: HIGH -->
<tr><td style="padding:12px 15px;">
<div style="border:1px solid #e6e6e6;border-radius:15px;padding:15px;">
<div style="margin-bottom:8px;">
<span style="display:inline-block;padding:2px 8px;background:#FEE2E2;color:#991B1B;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.3px;margin-right:6px;">HIGH</span>
<span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">FORM 4 | INSIDER</span>
</div>
<h3 style="margin:0 0 6px;font-size:16px;font-weight:600;color:#000;">TSLA: Board member sold $12.4M in shares</h3>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.5;">50,000 shares at $248.30. Scheduled sale under 10b5-1 plan filed in January. Director retains 420,000 shares.</p>
</div>
</td></tr>

<!-- Filing 2: CRITICAL -->
<tr><td style="padding:4px 15px 12px;">
<div style="border:1px solid #e6e6e6;border-radius:15px;padding:15px;">
<div style="margin-bottom:8px;">
<span style="display:inline-block;padding:2px 8px;background:#FEE2E2;color:#991B1B;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.3px;margin-right:6px;">CRITICAL</span>
<span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">8-K | MATERIAL EVENT</span>
</div>
<h3 style="margin:0 0 6px;font-size:16px;font-weight:600;color:#000;">AAPL: $5B revolving credit facility</h3>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.5;">Entered into a $5B revolving credit facility with a consortium of banks. Replaces existing $3B facility expiring Q2 2026. Signals preparation for potential large acquisition or capital deployment.</p>
</div>
</td></tr>

<!-- Filing 3: MEDIUM -->
<tr><td style="padding:4px 15px 16px;">
<div style="border:1px solid #e6e6e6;border-radius:15px;padding:15px;">
<div style="margin-bottom:8px;">
<span style="display:inline-block;padding:2px 8px;background:#FEF3C7;color:#92400E;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.3px;margin-right:6px;">MEDIUM</span>
<span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;">10-Q | QUARTERLY</span>
</div>
<h3 style="margin:0 0 6px;font-size:16px;font-weight:600;color:#000;">MSFT: Revenue $65.2B (+14% YoY)</h3>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.5;">Cloud segment grew 22%. Operating margin expanded 180bps to 44.2%. Raised full-year guidance by $2B on AI demand strength.</p>
</div>
</td></tr>

<!-- Soft CTA -->
<tr><td style="padding:8px 15px 20px;text-align:center;">
<p style="margin:0 0 12px;font-size:15px;color:#374151;">Want these delivered automatically?</p>
<a href="https://tldrsec.app" style="display:inline-block;padding:14px 28px;background:#7C3AED;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Get Early Access</a>
<p style="margin:10px 0 0;font-size:12px;color:#9CA3AF;">We're opening access to waitlist members first.</p>
</td></tr>

${FOUNDER_PS}`;

  return {
    subject,
    html: campaignShell('Weekly Intelligence', body, options.unsubscribeUrl),
  };
}

/**
 * Email 3: "Your Trial Is Ready"
 *
 * Conversion email. Single CTA. FAQ section handles objections.
 * This is the money email. No P.S. — keep focus on CTA.
 */
function email3(options: CampaignEmailOptions): CampaignEmailContent {
  const subject = 'your 7-day trial is ready';

  const body = `
<!-- Main content -->
<tr><td style="padding:24px 15px 8px;">
<h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#000;line-height:1.3;">Your trial is ready.</h1>
<p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">You've seen what our AI does with SEC filings. Now get it working for your portfolio.</p>
</td></tr>

<!-- What you get -->
<tr><td style="padding:16px 15px;">
<div style="border:1px solid #e6e6e6;border-radius:15px;padding:15px;">
<h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#000;">When you sign up:</h2>
<table width="100%" cellpadding="0" cellspacing="0">
<tbody>
<tr><td style="padding:8px 0;font-size:14px;color:#374151;vertical-align:top;" width="24"><strong style="color:#10B981;">1.</strong></td><td style="padding:8px 0 8px 8px;font-size:14px;color:#374151;line-height:1.5;">Pick the companies you track from 2,000+ SEC-listed equities</td></tr>
<tr><td style="padding:8px 0;font-size:14px;color:#374151;vertical-align:top;" width="24"><strong style="color:#10B981;">2.</strong></td><td style="padding:8px 0 8px 8px;font-size:14px;color:#374151;line-height:1.5;">Get an AI summary within minutes of every filing — 10-K, 10-Q, 8-K, Form 4, and more</td></tr>
<tr><td style="padding:8px 0;font-size:14px;color:#374151;vertical-align:top;" width="24"><strong style="color:#10B981;">3.</strong></td><td style="padding:8px 0 8px 8px;font-size:14px;color:#374151;line-height:1.5;">Never miss an insider trade, earnings report, or material event again</td></tr>
</tbody>
</table>
</div>
</td></tr>

<!-- CTA -->
<tr><td style="padding:12px 15px 24px;text-align:center;">
<a href="https://tldrsec.app/sign-up?plan=pro&ref=campaign" style="display:inline-block;padding:16px 40px;background:#7C3AED;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">Start Your 7-Day Free Trial</a>
<p style="margin:10px 0 0;font-size:13px;color:#6B7280;">Credit card required. Cancel anytime before day 7 — you're never charged.</p>
</td></tr>

<!-- FAQ -->
<tr><td style="padding:0 15px 20px;">
<div style="border:1px solid #e6e6e6;border-radius:15px;padding:15px;">
<h2 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#000;text-transform:uppercase;letter-spacing:0.5px;">FAQ</h2>

<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#000;">What filing types do you cover?</p>
<p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.5;">All of them. 10-K, 10-Q, 8-K, Form 4, Form 144, DEF 14A, S-1, S-3, Schedule 13D/G, and more. If it's filed with the SEC, we summarize it.</p>

<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#000;">How fast are the summaries?</p>
<p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.5;">Within minutes of the filing appearing on EDGAR. Most arrive in your inbox in under 10 minutes.</p>

<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#000;">What if I don't like it?</p>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.5;">Cancel before day 7 and you pay nothing. No questions asked. We think you'll stay — but we make leaving easy.</p>
</div>
</td></tr>`;

  return {
    subject,
    html: campaignShell('Early Access', body, options.unsubscribeUrl),
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
