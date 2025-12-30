/**
 * Ticker Confirmation API
 *
 * POST /api/user/tickers/confirm
 *
 * Confirms the user's current portfolio and triggers quarterly earnings emails.
 * Implements a 1-minute grace period to prevent duplicate emails when users
 * are making rapid changes to their portfolio.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';
import { sendQuarterlyEarningsEmail } from '@/lib/email/quarterly-earnings-service';
import { logger } from '@/lib/logging';

// Grace period in milliseconds (1 minute)
const GRACE_PERIOD_MS = 60 * 1000;

export async function POST() {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user with their tickers
    const user = await prisma.user.findFirst({
      where: { authProviderId: clerkUserId },
      include: {
        tickers: {
          select: { symbol: true, companyName: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentTickers = user.tickers.map((t) => t.symbol);
    const previousTickers = user.tickersAtLastConfirmation || [];
    const now = new Date();

    // Check if within grace period
    const lastConfirmation = user.tickersConfirmedAt;
    const isWithinGracePeriod =
      lastConfirmation && now.getTime() - lastConfirmation.getTime() < GRACE_PERIOD_MS;

    let emailSent = false;
    let newTickersEmailed: string[] = [];
    let reason = '';
    let emailError: string | undefined;

    if (currentTickers.length === 0) {
      // No tickers to confirm
      reason = 'no_tickers';
    } else if (isWithinGracePeriod) {
      // Find newly added tickers since last confirmation
      const newTickers = currentTickers.filter((t) => !previousTickers.includes(t));

      if (newTickers.length === 0) {
        // No new tickers, skip email
        reason = 'within_grace_period';
      } else {
        // Only email for new tickers
        const emailResult = await sendQuarterlyEarningsEmail({
          userId: user.id,
          tickerSymbols: newTickers,
          email: user.email,
          recipientName: user.name || undefined,
        });

        if (emailResult.success) {
          emailSent = true;
          newTickersEmailed = newTickers;
        } else {
          emailError = emailResult.error;
        }
      }
    } else {
      // Full email for all tickers (first confirmation or after grace period)
      const emailResult = await sendQuarterlyEarningsEmail({
        userId: user.id,
        tickerSymbols: currentTickers,
        email: user.email,
        recipientName: user.name || undefined,
      });

      if (emailResult.success) {
        emailSent = true;
        newTickersEmailed = currentTickers;
      } else {
        emailError = emailResult.error;
      }
    }

    // Update confirmation tracking
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tickersConfirmedAt: now,
        lastConfirmationEmailSentAt: emailSent ? now : user.lastConfirmationEmailSentAt,
        tickersAtLastConfirmation: currentTickers,
      },
    });

    logger.info('Ticker confirmation processed', {
      userId: user.id,
      tickerCount: currentTickers.length,
      emailSent,
      newTickersEmailed: newTickersEmailed.length,
      reason: reason || undefined,
    });

    return NextResponse.json({
      tickersConfirmed: true,
      tickerCount: currentTickers.length,
      emailSent,
      newTickersEmailed,
      reason: reason || undefined,
      emailError,
    });
  } catch (error) {
    logger.error('Error confirming tickers', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Failed to confirm tickers' },
      { status: 500 }
    );
  }
}
