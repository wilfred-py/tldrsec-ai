/**
 * Weekly Digest Handler
 *
 * Generates and sends a weekly SEC filing digest email to each active user.
 * For each user, fetches the past 7 days of summaries across all tracked tickers,
 * groups them by importance, synthesizes a narrative via Grok (OpenRouter),
 * and delivers the digest email via Resend.
 *
 * Rate-limits user processing sequentially with a small delay between users
 * to avoid overwhelming AI and email services.
 */

import { logger } from '../../logging';
import { getPrismaClient } from '../../db/prisma';
import { OpenRouterClient } from '../../ai/openrouter-client';
import { getDefaultModel } from '../../ai/config';
import { sendEmail } from '../../email/email-core';
import { resendConfig } from '../../email/config';
import { generateFeedbackToken } from '../../email/feedback-tokens';
import { escapeHtml } from '../../email/security-helpers';

const digestLogger = logger.child('weekly-digest-handler');

// Importance ordering for grouping (highest first)
const IMPORTANCE_ORDER = ['critical', 'high', 'medium', 'low', null] as const;

// Delay between processing each user (ms) to avoid rate limits
const USER_PROCESSING_DELAY_MS = 1500;

export interface WeeklyDigestResult {
  success: boolean;
  usersProcessed: number;
  usersSkipped: number;
  emailsSent: number;
  errors: string[];
  durationMs: number;
}

interface UserSummary {
  id: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  summaryText: string;
  importance: string | null;
  smartSubject: string | null;
  tickerSymbol: string;
  companyName: string;
}

/**
 * Main handler: iterate over active users, build digest, send email.
 */
export async function handleWeeklyDigest(): Promise<WeeklyDigestResult> {
  const startTime = Date.now();
  const prisma = getPrismaClient();
  const result: WeeklyDigestResult = {
    success: true,
    usersProcessed: 0,
    usersSkipped: 0,
    emailsSent: 0,
    errors: [],
    durationMs: 0,
  };

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setUTCHours(23, 59, 59, 999);
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  weekStart.setUTCHours(0, 0, 0, 0);

  digestLogger.info('Starting weekly digest generation', {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  });

  try {
    // Query active users: not soft-deleted and not trial-expired
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          // Paid users (PRO/MAX)
          { subscriptionTier: { in: ['PRO', 'MAX'] } },
          // Active trial users (FREE tier with future expiry)
          {
            subscriptionTier: 'FREE',
            isTrialing: true,
            trialEndsAt: { gt: now },
          },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    digestLogger.info(`Found ${users.length} active users for weekly digest`);

    for (const user of users) {
      try {
        // Check if we already sent a digest for this week
        const existingDigest = await prisma.weeklyDigestLog.findUnique({
          where: {
            userId_weekStart: {
              userId: user.id,
              weekStart,
            },
          },
        });

        if (existingDigest) {
          digestLogger.debug(`Digest already sent for user ${user.id} this week, skipping`);
          result.usersSkipped++;
          continue;
        }

        // Fetch summaries from the past 7 days across all user tickers
        const summaries = await fetchUserWeeklySummaries(user.id, weekStart, weekEnd);

        // Build and send the email (even for 0 filings: "quiet week" message)
        const emailSent = await buildAndSendDigest(user, summaries, weekStart, weekEnd);

        if (emailSent) {
          // Log to WeeklyDigestLog
          await prisma.weeklyDigestLog.create({
            data: {
              userId: user.id,
              weekStart,
              weekEnd,
              filingsCount: summaries.length,
              sentAt: new Date(),
              metadata: {
                importanceBreakdown: getImportanceBreakdown(summaries),
              },
            },
          });
          result.emailsSent++;
        }

        result.usersProcessed++;

        // Rate-limit: sequential processing with delay
        await delay(USER_PROCESSING_DELAY_MS);
      } catch (userError) {
        const msg = `Error processing user ${user.id}: ${userError instanceof Error ? userError.message : String(userError)}`;
        digestLogger.error(msg);
        result.errors.push(msg);
        result.usersProcessed++;
      }
    }
  } catch (error) {
    const msg = `Weekly digest handler failed: ${error instanceof Error ? error.message : String(error)}`;
    digestLogger.error(msg);
    result.errors.push(msg);
    result.success = false;
  }

  result.durationMs = Date.now() - startTime;

  digestLogger.info('Weekly digest generation complete', {
    ...result,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Fetch all summaries for a user's tracked tickers in the given date range.
 */
async function fetchUserWeeklySummaries(
  userId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<UserSummary[]> {
  const prisma = getPrismaClient();

  const tickers = await prisma.ticker.findMany({
    where: { userId },
    select: { id: true, symbol: true, companyName: true },
  });

  if (tickers.length === 0) return [];

  const tickerIds = tickers.map((t) => t.id);
  const tickerMap = new Map(tickers.map((t) => [t.id, t]));

  const summaries = await prisma.summary.findMany({
    where: {
      tickerId: { in: tickerIds },
      filingDate: { gte: weekStart, lte: weekEnd },
    },
    orderBy: { filingDate: 'desc' },
    select: {
      id: true,
      tickerId: true,
      filingType: true,
      filingDate: true,
      filingUrl: true,
      summaryText: true,
      importance: true,
      smartSubject: true,
    },
  });

  return summaries.map((s) => {
    const ticker = tickerMap.get(s.tickerId);
    return {
      id: s.id,
      filingType: s.filingType,
      filingDate: s.filingDate,
      filingUrl: s.filingUrl,
      summaryText: s.summaryText,
      importance: s.importance,
      smartSubject: s.smartSubject,
      tickerSymbol: ticker?.symbol || 'UNKNOWN',
      companyName: ticker?.companyName || 'Unknown Company',
    };
  });
}

/**
 * Build the digest email content and send it.
 * If there are summaries, calls Grok to synthesize a narrative highlight.
 * If zero summaries, sends a short "quiet week" email.
 */
async function buildAndSendDigest(
  user: { id: string; email: string; name: string | null },
  summaries: UserSummary[],
  weekStart: Date,
  weekEnd: Date
): Promise<boolean> {
  const dateRange = formatDateRange(weekStart, weekEnd);
  const subject = `Your Weekly SEC Filing Digest \u2014 ${dateRange}`;

  let htmlBody: string;

  if (summaries.length === 0) {
    htmlBody = buildQuietWeekHtml(user, dateRange);
  } else {
    // Group by importance
    const grouped = groupByImportance(summaries);
    const topFiling = findTopFiling(summaries);

    // Synthesize a narrative highlight via Grok
    let narrative = '';
    try {
      narrative = await synthesizeNarrative(summaries);
    } catch (aiError) {
      digestLogger.warn('AI narrative synthesis failed, using fallback', {
        userId: user.id,
        error: aiError instanceof Error ? aiError.message : String(aiError),
      });
      narrative = buildFallbackNarrative(topFiling);
    }

    // Extract cross-filing intelligence
    const signals = extractPortfolioSignals(summaries);

    htmlBody = buildDigestHtml(user, dateRange, narrative, topFiling, grouped, summaries.length, signals);
  }

  try {
    const emailResult = await sendEmail({
      from: resendConfig.defaultFrom,
      to: user.email,
      subject,
      html: htmlBody,
    });

    if (!emailResult.success) {
      digestLogger.error('Failed to send weekly digest email', {
        userId: user.id,
        error: 'error' in emailResult ? emailResult.error : 'unknown',
      });
      return false;
    }

    digestLogger.info('Weekly digest email sent', { userId: user.id, filings: summaries.length });
    return true;
  } catch (emailError) {
    digestLogger.error('Email send threw an exception', {
      userId: user.id,
      error: emailError instanceof Error ? emailError.message : String(emailError),
    });
    return false;
  }
}

/**
 * Call Grok via OpenRouter to synthesize a short narrative highlight from the week's filings.
 */
async function synthesizeNarrative(summaries: UserSummary[]): Promise<string> {
  const client = new OpenRouterClient();
  const model = getDefaultModel();

  // Build a compact prompt with filing data
  const filingLines = summaries.slice(0, 20).map((s) => {
    const imp = s.importance ? `[${s.importance.toUpperCase()}]` : '';
    return `- ${s.tickerSymbol} ${s.filingType} (${s.filingDate.toISOString().slice(0, 10)}) ${imp}: ${truncate(s.summaryText, 200)}`;
  });

  const systemPrompt = `You are a concise financial analyst writing a weekly digest highlight for an SEC filing monitoring service called tldrSEC. Write 2-3 sentences highlighting the most important developments from this week's filings. Be specific about company names and filing types. Do not use markdown formatting. Write in plain text.`;

  const userPrompt = `Here are the SEC filings from this week:\n\n${filingLines.join('\n')}\n\nWrite a brief highlight summary (2-3 sentences) of the most notable developments.`;

  const response = await client.sendMessage(
    [{ role: 'user', content: userPrompt }],
    {
      model,
      system: systemPrompt,
      maxTokens: 300,
      temperature: 0.3,
      timeout: 30000,
    }
  );

  return response.content.trim();
}

// ---------------------------------------------------------------------------
// Cross-Filing Intelligence
// ---------------------------------------------------------------------------

interface PortfolioSignals {
  insiderTradingSummary: string | null;
  sectorTrends: string[];
}

function extractPortfolioSignals(summaries: UserSummary[]): PortfolioSignals {
  // Aggregate insider trading from Form 4 filings
  let totalBuyValue = 0;
  let totalSellValue = 0;
  let buyCount = 0;
  let sellCount = 0;
  const tradingTickers = new Set<string>();

  for (const s of summaries) {
    const formType = s.filingType.replace(/^Form\s*/i, '').replace(/\/A$/, '');
    if (formType !== '4') continue;

    // Try to extract transaction data from summaryText
    const sellMatch = s.summaryText.match(/\$[\d,.]+\s*(?:million|M)\s*(?:in|worth|of)\s*(?:shares|stock)/i)
      || s.summaryText.match(/sold\s*(?:.*?)\$[\d,.]+/i);
    const buyMatch = s.summaryText.match(/(?:acquired|bought|purchased)\s*(?:.*?)\$[\d,.]+/i);

    if (sellMatch) {
      sellCount++;
      tradingTickers.add(s.tickerSymbol);
      const valMatch = s.summaryText.match(/\$([\d,.]+)\s*(?:million|M)/i);
      if (valMatch) totalSellValue += parseFloat(valMatch[1].replace(/,/g, ''));
    }
    if (buyMatch) {
      buyCount++;
      tradingTickers.add(s.tickerSymbol);
      const valMatch = s.summaryText.match(/\$([\d,.]+)\s*(?:million|M)/i);
      if (valMatch) totalBuyValue += parseFloat(valMatch[1].replace(/,/g, ''));
    }
  }

  let insiderTradingSummary: string | null = null;
  if (buyCount > 0 || sellCount > 0) {
    const parts: string[] = [];
    if (sellCount > 0) parts.push(`$${totalSellValue.toFixed(1)}M selling (${sellCount} transactions)`);
    if (buyCount > 0) parts.push(`$${totalBuyValue.toFixed(1)}M buying (${buyCount} transactions)`);
    insiderTradingSummary = `Net insider trading across ${tradingTickers.size} holdings: ${parts.join(', ')}`;
  }

  // Detect filing type trends
  const sectorTrends: string[] = [];
  const typeCount: Record<string, { count: number; tickers: Set<string> }> = {};

  for (const s of summaries) {
    if (!typeCount[s.filingType]) typeCount[s.filingType] = { count: 0, tickers: new Set() };
    typeCount[s.filingType].count++;
    typeCount[s.filingType].tickers.add(s.tickerSymbol);
  }

  for (const [type, data] of Object.entries(typeCount)) {
    if (data.tickers.size >= 2) {
      sectorTrends.push(`${data.tickers.size} companies filed ${type} this week (${Array.from(data.tickers).join(', ')})`);
    }
  }

  return { insiderTradingSummary, sectorTrends };
}

// ---------------------------------------------------------------------------
// HTML Template Builders
// ---------------------------------------------------------------------------

const IMPORTANCE_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#FEE2E2', text: '#991B1B' },
  high: { bg: '#FEF3C7', text: '#92400E' },
  medium: { bg: '#DBEAFE', text: '#1E40AF' },
  low: { bg: '#F3F4F6', text: '#374151' },
};

function buildDigestHtml(
  user: { id: string; name: string | null },
  dateRange: string,
  narrative: string,
  topFiling: UserSummary | null,
  grouped: Map<string, UserSummary[]>,
  totalCount: number,
  signals?: PortfolioSignals
): string {
  const firstName = user.name?.split(' ')[0] || 'there';

  // Feedback buttons for the top filing (if available)
  let feedbackHtml = '';
  if (topFiling) {
    const token = generateFeedbackToken(user.id, topFiling.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';
    const upUrl = `${baseUrl}/api/feedback?token=${token}&vote=up`;
    const downUrl = `${baseUrl}/api/feedback?token=${token}&vote=down`;
    feedbackHtml = `
      <tr><td style="padding:16px 0 0 0;">
        <p style="margin:0 0 8px 0;font-size:13px;color:#6B7280;">Was this digest helpful?</p>
        <a href="${upUrl}" style="text-decoration:none;font-size:20px;margin-right:12px;" title="Helpful">&#128077;</a>
        <a href="${downUrl}" style="text-decoration:none;font-size:20px;" title="Not helpful">&#128078;</a>
      </td></tr>`;
  }

  // Top filing highlight
  let highlightHtml = '';
  if (topFiling) {
    const pill = importancePill(topFiling.importance);
    highlightHtml = `
      <tr><td style="padding:20px;background:#F0FDF4;border-radius:8px;border:1px solid #BBF7D0;">
        <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;text-transform:uppercase;color:#15803D;letter-spacing:0.05em;">This week's highlight</p>
        <p style="margin:0 0 6px 0;font-size:16px;font-weight:600;color:#111827;">${topFiling.tickerSymbol} &mdash; ${topFiling.filingType} ${pill}</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.5;">${narrative}</p>
      </td></tr>
      <tr><td style="padding:12px 0;"></td></tr>`;
  }

  // Build grouped filing list
  let filingsListHtml = '';
  for (const importance of IMPORTANCE_ORDER) {
    const key = importance ?? 'unrated';
    const items = grouped.get(key);
    if (!items || items.length === 0) continue;

    const label = importance ? importance.charAt(0).toUpperCase() + importance.slice(1) : 'Other';
    filingsListHtml += `
      <tr><td style="padding:8px 0 4px 0;">
        <p style="margin:0;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">${label}</p>
      </td></tr>`;

    for (const s of items) {
      const pill = importancePill(s.importance);
      const dateStr = s.filingDate.toISOString().slice(0, 10);
      const subjectLine = s.smartSubject || `${s.filingType} filed ${dateStr}`;
      filingsListHtml += `
      <tr><td style="padding:6px 0;border-bottom:1px solid #F3F4F6;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-size:14px;color:#111827;font-weight:500;">${s.tickerSymbol} ${pill}</td>
          <td style="font-size:13px;color:#6B7280;text-align:right;">${dateStr}</td>
        </tr></table>
        <p style="margin:4px 0 0 0;font-size:13px;color:#374151;">
          <a href="${s.filingUrl}" style="color:#2563EB;text-decoration:none;">${escapeHtml(subjectLine)}</a>
        </p>
      </td></tr>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F9FAFB;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E5E7EB;padding:32px;">
  <tr><td style="padding-bottom:16px;">
    <p style="margin:0;font-size:13px;font-weight:600;color:#2563EB;letter-spacing:0.05em;text-transform:uppercase;">tldrSEC Weekly Digest</p>
    <h1 style="margin:8px 0 0 0;font-size:22px;font-weight:700;color:#111827;">Week of ${dateRange}</h1>
  </td></tr>
  <tr><td style="padding-bottom:16px;">
    <p style="margin:0;font-size:15px;color:#374151;">Hi ${escapeHtml(firstName)}, here's your weekly roundup of <strong>${totalCount} SEC filing${totalCount === 1 ? '' : 's'}</strong> across your tracked companies.</p>
  </td></tr>
  ${highlightHtml}
  ${signals && (signals.insiderTradingSummary || signals.sectorTrends.length > 0) ? `
  <tr><td style="padding:16px 20px;background:#EFF6FF;border-radius:8px;border:1px solid #BFDBFE;margin-bottom:12px;">
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;text-transform:uppercase;color:#1D4ED8;letter-spacing:0.05em;">Portfolio Signals</p>
    ${signals.insiderTradingSummary ? `<p style="margin:0 0 4px 0;font-size:13px;color:#1E40AF;">${escapeHtml(signals.insiderTradingSummary)}</p>` : ''}
    ${signals.sectorTrends.map(t => `<p style="margin:0 0 4px 0;font-size:13px;color:#1E40AF;">${escapeHtml(t)}</p>`).join('')}
  </td></tr>
  <tr><td style="padding:8px 0;"></td></tr>` : ''}
  ${filingsListHtml}
  ${feedbackHtml}
  <tr><td style="padding:24px 0 0 0;border-top:1px solid #E5E7EB;margin-top:16px;">
    <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">
      <a href="https://tldrsec.app/dashboard" style="color:#6B7280;text-decoration:none;">Dashboard</a> &middot;
      <a href="https://tldrsec.app/dashboard/settings" style="color:#6B7280;text-decoration:none;">Unsubscribe</a>
    </p>
    <p style="margin:8px 0 0 0;font-size:11px;color:#D1D5DB;text-align:center;">tldrSEC &mdash; AI-powered SEC filing summaries</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildQuietWeekHtml(
  user: { id: string; name: string | null },
  dateRange: string
): string {
  const firstName = user.name?.split(' ')[0] || 'there';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F9FAFB;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E5E7EB;padding:32px;">
  <tr><td>
    <p style="margin:0;font-size:13px;font-weight:600;color:#2563EB;letter-spacing:0.05em;text-transform:uppercase;">tldrSEC Weekly Digest</p>
    <h1 style="margin:8px 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Week of ${dateRange}</h1>
    <p style="margin:0 0 12px 0;font-size:15px;color:#374151;">Hi ${escapeHtml(firstName)}, it was a quiet week for your tracked companies &mdash; no new SEC filings were published.</p>
    <p style="margin:0 0 24px 0;font-size:14px;color:#6B7280;">We'll keep monitoring and let you know as soon as something comes in. In the meantime, you can <a href="https://tldrsec.app/dashboard" style="color:#2563EB;text-decoration:none;">add more tickers</a> to broaden your coverage.</p>
  </td></tr>
  <tr><td style="padding:16px 0 0 0;border-top:1px solid #E5E7EB;">
    <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">
      <a href="https://tldrsec.app/dashboard" style="color:#6B7280;text-decoration:none;">Dashboard</a> &middot;
      <a href="https://tldrsec.app/dashboard/settings" style="color:#6B7280;text-decoration:none;">Unsubscribe</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function groupByImportance(summaries: UserSummary[]): Map<string, UserSummary[]> {
  const groups = new Map<string, UserSummary[]>();
  for (const s of summaries) {
    const key = s.importance ?? 'unrated';
    const arr = groups.get(key) || [];
    arr.push(s);
    groups.set(key, arr);
  }
  return groups;
}

function findTopFiling(summaries: UserSummary[]): UserSummary | null {
  if (summaries.length === 0) return null;

  // Pick the highest-importance filing; tie-break by most recent date
  const sorted = [...summaries].sort((a, b) => {
    const aIdx = IMPORTANCE_ORDER.indexOf(a.importance as typeof IMPORTANCE_ORDER[number]);
    const bIdx = IMPORTANCE_ORDER.indexOf(b.importance as typeof IMPORTANCE_ORDER[number]);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return b.filingDate.getTime() - a.filingDate.getTime();
  });

  return sorted[0];
}

function getImportanceBreakdown(summaries: UserSummary[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const s of summaries) {
    const key = s.importance ?? 'unrated';
    breakdown[key] = (breakdown[key] || 0) + 1;
  }
  return breakdown;
}

function buildFallbackNarrative(topFiling: UserSummary | null): string {
  if (!topFiling) return 'No notable developments this week.';
  return `The most notable filing this week was ${topFiling.tickerSymbol}'s ${topFiling.filingType}, filed on ${topFiling.filingDate.toISOString().slice(0, 10)}.`;
}

function importancePill(importance: string | null): string {
  if (!importance) return '';
  const colors = IMPORTANCE_COLORS[importance] || IMPORTANCE_COLORS.low;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${colors.bg};color:${colors.text};margin-left:6px;">${importance}</span>`;
}

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} \u2013 ${endStr}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}


function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
