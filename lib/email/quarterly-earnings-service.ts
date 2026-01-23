'use server';

import { getPrismaClient } from '@/lib/db/prisma';
import { sendEmail } from './index';
import { getEmailTemplate } from './templates';
import { EmailType } from './types';
import { logger } from '../logging';

/**
 * Parameters for sending quarterly earnings email
 */
interface QuarterlyEarningsEmailParams {
  userId: string;
  tickerSymbols: string[];
  email: string;
  recipientName?: string;
}

/**
 * Result of sending quarterly earnings email
 */
interface QuarterlyEarningsEmailResult {
  success: boolean;
  summariesIncluded: number;
  message?: string;
  error?: string;
  emailId?: string;
}

/**
 * Send quarterly earnings email with latest 10-K and 10-Q summaries
 * for the user's confirmed tickers.
 *
 * This is triggered when:
 * 1. User confirms their portfolio for the first time
 * 2. User adds new tickers and re-confirms
 * 3. User explicitly requests portfolio summary
 */
export async function sendQuarterlyEarningsEmail(
  params: QuarterlyEarningsEmailParams
): Promise<QuarterlyEarningsEmailResult> {
  const { userId, tickerSymbols, email, recipientName } = params;

  // Handle empty ticker array
  if (tickerSymbols.length === 0) {
    return {
      success: true,
      summariesIncluded: 0,
      message: 'No tickers to send summaries for',
    };
  }

  try {
    const prisma = getPrismaClient();
    // Get latest quarterly summaries (10-K, 10-Q) for each ticker
    // Use distinct to get only one summary per ticker (the most recent)
    const summaries = await prisma.summary.findMany({
      where: {
        ticker: {
          symbol: { in: tickerSymbols },
        },
        filingType: { in: ['10-K', '10-Q'] },
      },
      include: {
        ticker: true,
      },
      orderBy: { filingDate: 'desc' },
      distinct: ['tickerId'], // One per company
    });

    // No summaries available for these tickers
    if (summaries.length === 0) {
      logger.info('No quarterly earnings summaries available', {
        userId,
        tickerSymbols,
      });
      return {
        success: true,
        summariesIncluded: 0,
        message:
          'No quarterly earnings summaries available for these tickers yet. We will email you when new filings are processed.',
      };
    }

    // Prepare summary data for email template
    const summaryData = summaries.map((s) => ({
      ticker: s.ticker.symbol,
      companyName: s.ticker.companyName,
      filingType: s.filingType,
      filingDate: s.filingDate,
      filingUrl: s.url || s.filingUrl,
      summaryText: s.summaryText || '',
      summaryJSON: s.summaryJSON,
    }));

    // Generate email content
    const { html, text } = getEmailTemplate(EmailType.QUARTERLY_EARNINGS, {
      recipientName: recipientName || 'Investor',
      recipientEmail: email,
      summaries: summaryData,
      tickerCount: summaryData.length,
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications`,
      preferencesUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
    });

    // Build subject line
    const tickerList =
      tickerSymbols.length <= 3
        ? tickerSymbols.join(', ')
        : `${tickerSymbols.slice(0, 3).join(', ')} +${tickerSymbols.length - 3} more`;

    const subject = `Your Portfolio Update: ${summaries.length} Quarterly Earnings ${summaries.length === 1 ? 'Summary' : 'Summaries'} (${tickerList})`;

    // Send email
    const result = await sendEmail({
      to: email,
      subject,
      html,
      text,
      tags: ['type:quarterly-earnings', 'trigger:confirmation'],
      metadata: {
        userId,
        type: 'quarterly-earnings',
        tickerCount: tickerSymbols.length,
        summaryCount: summaries.length,
      },
    });

    if (!result.success) {
      logger.error('Failed to send quarterly earnings email', {
        userId,
        error: result.error,
      });
      return {
        success: false,
        summariesIncluded: 0,
        error: result.error?.message || 'Failed to send email',
      };
    }

    logger.info('Sent quarterly earnings email', {
      userId,
      email,
      summaryCount: summaries.length,
      emailId: result.id,
    });

    return {
      success: true,
      summariesIncluded: summaries.length,
      message: `Sent ${summaries.length} quarterly earnings ${summaries.length === 1 ? 'summary' : 'summaries'}`,
      emailId: result.id,
    };
  } catch (error) {
    logger.error('Error sending quarterly earnings email', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      summariesIncluded: 0,
      error: error instanceof Error ? error.message : 'Failed to send quarterly earnings email',
    };
  }
}
