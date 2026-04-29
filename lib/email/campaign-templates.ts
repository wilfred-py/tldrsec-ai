/**
 * Campaign Email Templates
 *
 * Three email templates for the 3-Act Launch campaign:
 * 1. "The Filing That Moved [Ticker]" - Pure value, no CTA (best single filing)
 * 2. "What You Missed This Week" - Multiple summaries, soft CTA (top 3 filings)
 * 3. "Your Trial Is Ready" - Conversion email with FAQ
 *
 * Emails 1 and 2 use dynamic filing data from the database when available,
 * ranked by materiality, size, and rarity. Falls back to hardcoded samples
 * if no summaries exist.
 *
 * All emails use self-contained inline HTML for Gmail/Outlook compatibility.
 * baseTemplate() is NOT used here because it relies on CSS classes that
 * Gmail strips from <style> blocks.
 */

import * as React from 'react';
import { renderAsync } from '@react-email/render';
import { getPrismaClient } from '../db/prisma';
import { logger } from '../logging';
import { escapeHtml } from './security-helpers';
import {
  capHeadline,
  EmailColors,
  SignalColors,
  importanceToSignalLevel,
  type SignalLevel,
} from '@/components/ui/email/design-system';
import { EmailHeader } from '@/components/ui/email/templates/sections/EmailHeader';
import {
  CAMPAIGN_FALLBACK_HERO,
  CAMPAIGN_FALLBACK_DIGEST,
} from './__fixtures__/campaign-fallback-filings';

const campaignLogger = logger.child('campaign-templates');

/**
 * Strip CR/LF from RFC 5322 header values (e.g. email subject) to prevent
 * header injection. Subjects are not HTML, so escapeHtml is not appropriate.
 */
function stripCrlf(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * A filing summary formatted for display in campaign emails.
 */
export interface CampaignFiling {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: Date;
  importance: 'critical' | 'high' | 'medium' | 'low';
  summary: string;
  title: string;
}

interface CampaignEmailOptions {
  unsubscribeUrl: string;
  variant?: 'A' | 'B';
  /** Dynamic filings from the database. If provided, replaces hardcoded samples. */
  filings?: CampaignFiling[];
}

interface CampaignEmailContent {
  subject: string;
  html: string;
  text: string;
}

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Wrap email body content in a Gmail/Outlook-safe inline-styled shell.
 * Uses table layout (Outlook), all inline styles (Gmail), MSO conditionals,
 * hidden preheader div, and role="presentation" for screen readers.
 *
 * `headerHtml` is an optional pre-rendered header (e.g. from the shared
 * `<EmailHeader>` section component). When omitted, falls back to the
 * legacy inline logo strip used by email2/email3 (no single-filing context).
 */
function campaignShell(content: string, options: { unsubscribeUrl: string; preheader?: string; headerHtml?: string }): string {
  const year = new Date().getFullYear();
  // Preheader padding prevents email clients from appending body text to the inbox preview
  const preheaderPad = '&zwnj;&nbsp;'.repeat(40);
  const preheaderHtml = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${options.preheader}${preheaderPad}</div>`
    : '';

  const headerCellHtml = options.headerHtml
    ? `<tr><td>${options.headerHtml}</td></tr>`
    : `<tr>
            <td style="padding:32px 28px 0;">
              <img src="https://tldrsec.app/images/logo-email.png" alt="tldrSEC" width="120" height="24" style="display:block;width:120px;height:24px;border:0;font-size:18px;font-weight:700;color:#1e293b;margin:0 0 24px;" />
            </td>
          </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <title>tldrSEC</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
  ${preheaderHtml}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;">
          ${headerCellHtml}
          <tr>
            <td style="padding:0 28px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;font-family:${FONT_STACK};">
                You received this email because you joined the tldrSEC waitlist.<br>
                <a href="https://tldrsec.app/dashboard/settings" style="color:#94a3b8;text-decoration:underline;">Manage preferences</a> &middot;
                <a href="${options.unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#cbd5e1;font-family:${FONT_STACK};">&copy; ${year} tldrSEC. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Importance ranking ---

const IMPORTANCE_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/** Filing types ranked by rarity (rarer = more interesting for campaign emails) */
const RARITY_BONUS: Record<string, number> = {
  'Form 4': 1,    // common
  '10-Q': 2,
  '8-K': 3,       // material events, always interesting
  '10-K': 3,      // annual, substantial
  'Form 144': 4,  // rare, very interesting
  'DEF 14A': 4,
  'S-1': 5,       // IPO, extremely rare
};

export function scoreFiling(f: { importance: string | null; filingType: string; tokensUsed?: number | null }): number {
  const importanceScore = IMPORTANCE_RANK[f.importance || 'low'] || 1;
  const rarityScore = RARITY_BONUS[f.filingType] || 2;
  const sizeScore = Math.min((f.tokensUsed || 0) / 5000, 3); // larger filings = more substance
  return importanceScore * 3 + rarityScore * 2 + sizeScore;
}

/**
 * Raw scored summary row — wider shape than CampaignFiling so other consumers
 * (e.g. landing-page fixture refresh script) can access summaryJSON, smartSubject,
 * tokensUsed, etc. without a second query.
 */
export interface ScoredSummaryRow {
  filingType: string;
  filingDate: Date;
  summaryText: string;
  summaryJSON: unknown;
  importance: string | null;
  smartSubject: string | null;
  tokensUsed: number | null;
  ticker: { symbol: string; companyName: string };
  score: number;
}

/**
 * Status values that indicate a definitively-failed summary. Modern pipeline
 * writes leave processingStatus null on success (the success gates are
 * non-empty summaryText + non-null importance), but a row with status
 * 'ERROR' / 'FAILED' should always be excluded.
 */
const SUMMARY_FAILED_STATUSES = ['ERROR', 'FAILED'];

/**
 * Query the database for usable summaries from the last 30 days, score them,
 * and return them sorted by composite score descending. No deduplication.
 *
 * Success is gated by non-empty summaryText + non-null importance — these
 * are populated by the success path only. processingStatus is filtered to
 * exclude ERROR/FAILED but allowed to be null (modern path doesn't set it).
 *
 * Returns at most `limit` rows. Caller is responsible for dedup + slicing.
 */
export async function fetchScoredSummariesLast30Days(limit: number = 50): Promise<ScoredSummaryRow[]> {
  try {
    const prisma = getPrismaClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const summaries = await prisma.summary.findMany({
      where: {
        filingDate: { gte: thirtyDaysAgo },
        summaryText: { not: '' },
        importance: { not: null },
        OR: [
          { processingStatus: null },
          { processingStatus: { notIn: SUMMARY_FAILED_STATUSES } },
        ],
      },
      select: {
        filingType: true,
        filingDate: true,
        summaryText: true,
        summaryJSON: true,
        importance: true,
        smartSubject: true,
        tokensUsed: true,
        ticker: {
          select: { symbol: true, companyName: true },
        },
      },
      orderBy: { filingDate: 'desc' },
      take: limit,
    });

    if (summaries.length === 0) return [];

    const scored: ScoredSummaryRow[] = summaries.map(s => ({
      ...s,
      score: scoreFiling({ importance: s.importance, filingType: s.filingType, tokensUsed: s.tokensUsed }),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored;
  } catch (err) {
    campaignLogger.error('Failed to fetch scored summaries', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return [];
  }
}

/**
 * Limit per-ticker frequency. Preserves input order, so when called on a
 * score-sorted list the highest-scoring filing per ticker survives first.
 */
export function dedupeByTicker<T extends { ticker: { symbol: string } }>(
  rows: T[],
  maxPerTicker: number = 1
): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.ticker.symbol;
    const seen = counts.get(key) ?? 0;
    if (seen >= maxPerTicker) continue;
    counts.set(key, seen + 1);
    out.push(row);
  }
  return out;
}

function toCampaignFiling(s: ScoredSummaryRow): CampaignFiling {
  const json = s.summaryJSON as Record<string, unknown> | null;
  let title = s.smartSubject || '';
  if (!title && json) {
    title = (json.eventType as string) || (json.transactionType as string) || '';
  }
  if (!title) title = s.filingType;

  const summaryText = capHeadline(s.summaryText, 200);

  return {
    ticker: s.ticker.symbol,
    companyName: s.ticker.companyName,
    filingType: s.filingType,
    filingDate: s.filingDate,
    importance: (s.importance as CampaignFiling['importance']) || 'medium',
    summary: summaryText,
    title,
  };
}

/**
 * Query the database for the best recent summaries to feature in campaign emails.
 * Ranked by: importance (critical > high > medium > low), rarity of filing type,
 * and filing size (larger = more substance). One filing per ticker.
 *
 * Returns up to `count` filings, or empty array if none are found.
 */
export async function fetchCampaignFilings(count: number = 3): Promise<CampaignFiling[]> {
  const scored = await fetchScoredSummariesLast30Days(50);
  if (scored.length === 0) return [];

  const deduped = dedupeByTicker(scored, 1).slice(0, count);
  const results = deduped.map(toCampaignFiling);

  campaignLogger.info(`Fetched ${results.length} campaign filings`, {
    total: scored.length,
    topScore: scored[0]?.score,
  });

  return results;
}

/**
 * Filing-type pill uses the same muted neutral across all types — the dry/Hybrid
 * voice (locked in `.claude/tasks/design-shotgun/email-1-hero-2026-04-29/`) drops
 * the type-specific vivid palettes (purple Form 4, green 8-K, etc.) in favor of
 * a single quiet token. Saves a switch and unifies with `EmailStyles.categoryBadge`.
 */
const FILING_BADGE_BG = '#F3F4F6'; // BadgeColors.neutral.bg / EmailStyles.categoryBadge bg
const FILING_BADGE_FG = EmailColors.text.meta; // #6B7280

/**
 * Email 1: "The Filing That Moved [Ticker]"
 *
 * Pure value email. No CTA. Shows a real AI-generated summary
 * to prove the product works. This is the most important email
 * in the sequence, it must be impressive.
 */
async function email1(options: CampaignEmailOptions): Promise<CampaignEmailContent> {
  // Use the top dynamic filing if available, otherwise fall back to hardcoded sample
  const filing = options.filings?.[0];

  const signalLevel: SignalLevel = importanceToSignalLevel(filing?.importance ?? CAMPAIGN_FALLBACK_HERO.importance);
  const signal = SignalColors[signalLevel];
  const badge = { bg: FILING_BADGE_BG, text: FILING_BADGE_FG };

  // Render the shared <EmailHeader> for this filing — gives the campaign hero
  // the same logo + category + ticker · company strip as production filing emails.
  const headerHtml = await renderAsync(
    React.createElement(EmailHeader, {
      ticker: filing?.ticker ?? CAMPAIGN_FALLBACK_HERO.ticker,
      companyName: filing?.companyName ?? CAMPAIGN_FALLBACK_HERO.companyName,
      filingType: filing?.filingType ?? CAMPAIGN_FALLBACK_HERO.filingType,
      filingDate: filing?.filingDate ?? CAMPAIGN_FALLBACK_HERO.filingDate,
    }),
  );

  // Raw values (used for plaintext body + subject; subject path uses stripCrlf).
  // Fallback copy lives in __fixtures__/campaign-fallback-filings.ts.
  const rawImpLabel = filing ? filing.importance.toUpperCase() : CAMPAIGN_FALLBACK_HERO.importanceLabel;
  const rawFilingType = filing?.filingType || CAMPAIGN_FALLBACK_HERO.filingType;
  const rawHeading = filing
    ? `${filing.companyName} (${filing.ticker}) - ${filing.title}`
    : CAMPAIGN_FALLBACK_HERO.heading;
  const rawSummaryBody = filing?.summary || CAMPAIGN_FALLBACK_HERO.summaryBody;
  const filedDate = filing
    ? filing.filingDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : CAMPAIGN_FALLBACK_HERO.filedDateLabel;

  // HTML-safe values (used inside template-literal HTML output)
  const impLabel = escapeHtml(rawImpLabel);
  const filingType = escapeHtml(rawFilingType);
  const heading = escapeHtml(rawHeading);
  const summaryBody = escapeHtml(rawSummaryBody);

  // Subject is an RFC 5322 header — strip CRLF (header injection), not HTML
  const subject = filing
    ? stripCrlf(`${filing.ticker}: ${filing.title}`).toLowerCase()
    : (options.variant === 'B' ? CAMPAIGN_FALLBACK_HERO.variantBSubject : CAMPAIGN_FALLBACK_HERO.variantASubject);

  // Preheader renders inside <div> in campaignShell — escape user content
  const preheader = filing
    ? escapeHtml(rawSummaryBody.substring(0, 100))
    : (options.variant === 'B'
      ? CAMPAIGN_FALLBACK_HERO.variantBPreheader
      : CAMPAIGN_FALLBACK_HERO.variantAPreheader);

  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">You signed up for tldrSEC a few weeks ago. Here's what our AI does with SEC filings.</p>

    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">Below is a real summary, generated automatically within minutes of the filing hitting EDGAR.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${signal.bgColor};border-left:4px solid ${signal.borderColor};border-radius:4px;margin:20px 0;">
      <tr>
        <td style="padding:20px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:8px;"><span style="background:${signal.borderColor};color:#ffffff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;text-transform:uppercase;display:inline-block;">${impLabel}</span></td>
              <td><span style="background:${badge.bg};color:${badge.text};font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;display:inline-block;">${filingType}</span></td>
            </tr>
          </table>
          <h3 style="margin:12px 0 8px;color:${EmailColors.text.headline};font-size:16px;font-weight:600;">${heading}</h3>
          <p style="margin:0 0 12px;color:${EmailColors.text.body};font-size:14px;line-height:1.6;">${summaryBody}</p>
          <p style="margin:0;color:${EmailColors.text.muted};font-size:12px;">
            Filed: ${filedDate} &middot; Source: SEC EDGAR
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;color:#64748b;font-size:14px;line-height:1.6;">
      On EDGAR, reading this ${filingType} takes 15-20 minutes. Our AI extracted the key details in under 10 minutes from the moment it was filed.
    </p>

    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">
      This is a sample of what tldrSEC delivers to your inbox within minutes of every SEC filing. More to come.
    </p>
  `;

  const text = `${subject}

You signed up for tldrSEC a few weeks ago. Here's what our AI does with SEC filings.

Below is a real summary, generated automatically within minutes of the filing hitting EDGAR.

---
${rawImpLabel} | ${rawFilingType}
${rawHeading}

${rawSummaryBody}

Filed: ${filedDate} | Source: SEC EDGAR
---

On EDGAR, reading this ${rawFilingType} takes 15-20 minutes. Our AI extracted the key details in under 10 minutes from the moment it was filed.

This is a sample of what tldrSEC delivers to your inbox within minutes of every SEC filing. More to come.

---
Unsubscribe: ${options.unsubscribeUrl}`;

  return {
    subject,
    html: campaignShell(content, { unsubscribeUrl: options.unsubscribeUrl, preheader, headerHtml }),
    text,
  };
}

/**
 * Email 2: "What You Missed This Week"
 *
 * Shows breadth: multiple filings, multiple types, importance-ranked.
 * Soft CTA to landing page.
 */
async function email2(options: CampaignEmailOptions): Promise<CampaignEmailContent> {
  // Use dynamic filings if available (top 3), otherwise hardcoded samples.
  // Raw values are stored here; HTML interpolation sites below escape per-field.
  // The plaintext text body uses these raw values directly.
  const dynamicFilings = options.filings?.slice(0, 3);
  const filings = dynamicFilings?.length
    ? dynamicFilings.map(f => {
        const signal = SignalColors[importanceToSignalLevel(f.importance)];
        return {
          importance: f.importance.toUpperCase(),
          signalBg: signal.bgColor,
          signalBorder: signal.borderColor,
          badge: f.filingType,
          badgeColor: FILING_BADGE_BG,
          badgeTextColor: FILING_BADGE_FG,
          company: `${f.companyName} (${f.ticker})`,
          title: f.title,
          summary: f.summary,
        };
      })
    : CAMPAIGN_FALLBACK_DIGEST.map(row => {
        const signal = SignalColors[importanceToSignalLevel(row.importanceColorKey)];
        return {
          importance: row.importance,
          signalBg: signal.bgColor,
          signalBorder: signal.borderColor,
          badge: row.badge,
          badgeColor: FILING_BADGE_BG,
          badgeTextColor: FILING_BADGE_FG,
          company: row.company,
          title: row.title,
          summary: row.summary,
        };
      });

  const subject = stripCrlf(`${filings.length} SEC filings you should know about`);

  let filingsHtml = '';
  let filingsText = '';
  for (const f of filings) {
    filingsHtml += `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${f.signalBg};border-left:4px solid ${f.signalBorder};border-radius:4px;margin:12px 0;">
        <tr>
          <td style="padding:16px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:8px;"><span style="background:${f.signalBorder};color:#ffffff;font-size:10px;font-weight:600;padding:2px 6px;border-radius:3px;text-transform:uppercase;display:inline-block;">${escapeHtml(f.importance)}</span></td>
                <td><span style="background:${f.badgeColor};color:${f.badgeTextColor};font-size:10px;font-weight:600;padding:2px 6px;border-radius:3px;display:inline-block;">${escapeHtml(f.badge)}</span></td>
              </tr>
            </table>
            <h4 style="margin:8px 0 6px;color:${EmailColors.text.headline};font-size:14px;font-weight:600;">${escapeHtml(f.company)} - ${escapeHtml(f.title)}</h4>
            <p style="margin:0;color:${EmailColors.text.body};font-size:13px;line-height:1.5;">${escapeHtml(f.summary)}</p>
          </td>
        </tr>
      </table>
    `;
    filingsText += `[${f.importance}] ${f.badge} | ${f.company} - ${f.title}\n${f.summary}\n\n`;
  }

  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">${filings.length} SEC filings from this week, ranked by importance:</p>

    ${filingsHtml}

    <p style="margin:16px 0 0;color:#64748b;font-size:14px;line-height:1.6;">
      On EDGAR, each of these would take 30-60 minutes to read and analyze. Our AI summarized all three within minutes of filing.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0;">
      <tr>
        <td align="center">
          <p style="margin:0 0 16px;color:#475569;font-size:14px;">
            Want these delivered automatically? We're opening early access to waitlist members.
          </p>
          <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://tldrsec.app" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="14%" fillcolor="#2563eb"><center style="color:#ffffff;font-family:${FONT_STACK};font-size:14px;font-weight:600;">See How It Works</center></v:roundrect><![endif]-->
          <!--[if !mso]><!-->
          <a href="https://tldrsec.app" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">
            See How It Works
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
  `;

  const text = `${subject}

${filings.length} SEC filings from this week, ranked by importance:

${filingsText}On EDGAR, each of these would take 30-60 minutes to read and analyze. Our AI summarized all three within minutes of filing.

Want these delivered automatically? We're opening early access to waitlist members.
Visit: https://tldrsec.app

---
Unsubscribe: ${options.unsubscribeUrl}`;

  return {
    subject,
    html: campaignShell(content, {
      unsubscribeUrl: options.unsubscribeUrl,
      preheader: escapeHtml(filings.map(f => `${f.company.split(' (')[0]}: ${f.title}`).join('. ') + '.'),
    }),
    text,
  };
}

/**
 * Email 3: "Your Trial Is Ready"
 *
 * Conversion email. CTA above the fold, FAQ handles objections.
 * Uses A/B variant testing for below-CTA copy.
 *
 * Structure (post-design-review):
 *   Pain-first intro (2 sentences) > CTA button > Sub-CTA reassurance >
 *   Value steps (reinforcement) > FAQ (objection handling)
 *
 * Hormozi Grand Slam Offer framework applied:
 *   - Dream Outcome: every filing, every company, in your inbox
 *   - Perceived Likelihood: "you've already seen it work" (emails 1-2)
 *   - Time Delay: first summary within 10 minutes
 *   - Effort & Sacrifice: CC acknowledged honestly with risk reversal
 */
async function email3(options: CampaignEmailOptions): Promise<CampaignEmailContent> {
  // Static subject — no user content, but use stripCrlf for symmetry with email1/2
  const subject = stripCrlf('your 7-day trial is ready');

  const subCtaCopy = options.variant === 'B'
    ? 'Full access for 7 days — every filing type, every company on EDGAR.<br>Your card won\'t be charged until the trial ends. Cancel in one click.'
    : 'Your card won\'t be charged for 7 days. Cancel anytime in one click.<br>First filing summary hits your inbox within 10 minutes of signing up.';

  const subCtaText = options.variant === 'B'
    ? 'Full access for 7 days — every filing type, every company on EDGAR. Your card won\'t be charged until the trial ends. Cancel in one click.'
    : 'Your card won\'t be charged for 7 days. Cancel anytime in one click. First filing summary hits your inbox within 10 minutes of signing up.';

  const content = `
    <p style="margin:0 0 8px;font-size:15px;color:#334155;line-height:1.6;">You've been reading 50-page filings manually. Or worse, missing them entirely.</p>
    <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">Pick your companies, and we'll handle the rest.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
      <tr>
        <td align="center">
          <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://tldrsec.app/sign-up?plan=pro&ref=campaign" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="12%" fillcolor="#2563eb"><center style="color:#ffffff;font-family:${FONT_STACK};font-size:16px;font-weight:600;">Start Your 7-Day Trial</center></v:roundrect><![endif]-->
          <!--[if !mso]><!-->
          <a href="https://tldrsec.app/sign-up?plan=pro&ref=campaign" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:600;padding:14px 36px;border-radius:6px;text-decoration:none;">
            Start Your 7-Day Trial
          </a>
          <!--<![endif]-->
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:10px;">
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">
            ${subCtaCopy}
          </p>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border-radius:8px;margin:28px 0;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 12px;font-size:14px;color:#334155;font-weight:600;">Here's what happens when you sign up:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding:0 0 10px;font-size:14px;color:#334155;line-height:1.5;vertical-align:top;" width="24">1.</td>
              <td style="padding:0 0 10px;font-size:14px;color:#334155;line-height:1.5;"><strong>Pick the companies you follow</strong> — any sector, any size. Every public company on EDGAR.</td>
            </tr>
            <tr>
              <td style="padding:0 0 10px;font-size:14px;color:#334155;line-height:1.5;vertical-align:top;" width="24">2.</td>
              <td style="padding:0 0 10px;font-size:14px;color:#334155;line-height:1.5;"><strong>Get AI summaries within minutes</strong> of every SEC filing: 10-K, 10-Q, 8-K, Form 4, Form 144.</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#334155;line-height:1.5;vertical-align:top;" width="24">3.</td>
              <td style="font-size:14px;color:#334155;line-height:1.5;"><strong>Never miss an insider trade or material event again.</strong> We check EDGAR every 10 minutes, 24/7.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e2e8f0;margin-top:4px;">
      <tr>
        <td style="padding:20px 0 0;">
          <p style="margin:0 0 16px;font-size:15px;color:#1e293b;font-weight:600;">Common Questions</p>

          <p style="margin:0 0 4px;font-size:14px;color:#1e293b;font-weight:600;">What if I don't like it?</p>
          <p style="margin:0 0 16px;font-size:13px;color:#64748b;line-height:1.5;">Cancel in one click during the trial. Your card won't be charged. No questions asked.</p>

          <p style="margin:0 0 4px;font-size:14px;color:#1e293b;font-weight:600;">What do I get during the trial?</p>
          <p style="margin:0 0 16px;font-size:13px;color:#64748b;line-height:1.5;">The full product. Every filing type — 10-K (annual), 10-Q (quarterly), 8-K (material events), Form 4 (insider trades), Form 144 (planned sales). Every company on EDGAR. AI summaries within 10 minutes. Same product our paying users get.</p>

          <p style="margin:0 0 4px;font-size:14px;color:#1e293b;font-weight:600;">How fast are the summaries?</p>
          <p style="margin:0 0 16px;font-size:13px;color:#64748b;line-height:1.5;">Within 10 minutes of the filing appearing on SEC EDGAR. We check every 10 minutes, 24/7.</p>

          <p style="margin:0 0 4px;font-size:14px;color:#1e293b;font-weight:600;">What does it cost after the trial?</p>
          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">Pro: $199/month (25 companies). Max: $349/month (unlimited). That's less than the cost of missing one insider trade.</p>
        </td>
      </tr>
    </table>
  `;

  const text = `your 7-day trial is ready

You've been reading 50-page filings manually. Or worse, missing them entirely.

Pick your companies, and we'll handle the rest.

>> Start Your 7-Day Trial: https://tldrsec.app/sign-up?plan=pro&ref=campaign

${subCtaText}

---

Here's what happens when you sign up:

1. Pick the companies you follow — any sector, any size. Every public company on EDGAR.
2. Get AI summaries within minutes of every SEC filing: 10-K, 10-Q, 8-K, Form 4, Form 144.
3. Never miss an insider trade or material event again. We check EDGAR every 10 minutes, 24/7.

---

Common Questions

Q: What if I don't like it?
A: Cancel in one click during the trial. Your card won't be charged. No questions asked.

Q: What do I get during the trial?
A: The full product. Every filing type — 10-K (annual), 10-Q (quarterly), 8-K (material events), Form 4 (insider trades), Form 144 (planned sales). Every company on EDGAR. AI summaries within 10 minutes. Same product our paying users get.

Q: How fast are the summaries?
A: Within 10 minutes of the filing appearing on SEC EDGAR. We check every 10 minutes, 24/7.

Q: What does it cost after the trial?
A: Pro: $199/month (25 companies). Max: $349/month (unlimited). That's less than the cost of missing one insider trade.

---
Unsubscribe: ${options.unsubscribeUrl}`;

  return {
    subject,
    html: campaignShell(content, { unsubscribeUrl: options.unsubscribeUrl, preheader: 'Full access, 7 days free. Every filing type, every company on EDGAR.' }),
    text,
  };
}

/**
 * Get campaign email content by email number.
 * Used by the campaign send API route.
 */
export async function getCampaignEmailContent(
  emailNumber: 1 | 2 | 3,
  options: CampaignEmailOptions
): Promise<CampaignEmailContent> {
  switch (emailNumber) {
    case 1: return email1(options);
    case 2: return email2(options);
    case 3: return email3(options);
  }
}
