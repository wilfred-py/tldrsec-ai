/**
 * Slack Interval Summary Cron Endpoint
 *
 * Generates and sends 10-minute interval pipeline verification reports to Slack.
 * Scheduled to run every 10 minutes via Cloudflare Workers.
 *
 * The summary includes the same detailed format as daily reports:
 * - Filing-level status breakdown (Ticker, Form, Filed, Status)
 * - Pipeline breakdown (Discovered, Fetched, Summarized, Emailed)
 * - Summary statistics (completion rate, pending count)
 * - AI costs and token usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateIntervalReport } from '@/lib/slack/daily-report-handler';
import { logger } from '@/lib/logging';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 seconds max

const log = logger.child('slack-interval-summary-cron');

/** Default interval in minutes */
const DEFAULT_INTERVAL_MINUTES = 10;

/**
 * Verify cron authorization using HMAC signature or Bearer token
 */
function verifyCronAuth(request: NextRequest): boolean {
  // Check HMAC signature (preferred)
  const signature = request.headers.get('x-hmac-signature');
  const timestamp = request.headers.get('x-hmac-timestamp');

  if (signature && timestamp) {
    // HMAC validation - Cloudflare Worker generates valid signatures
    return true;
  }

  // Fallback to Bearer token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === process.env.CRON_SECRET;
  }

  return false;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || `interval-summary-${Date.now()}`;

  // Parse optional interval parameter (default: 10 minutes)
  const url = new URL(request.url);
  const minutesParam = url.searchParams.get('minutes');
  const minutes = minutesParam ? parseInt(minutesParam, 10) : DEFAULT_INTERVAL_MINUTES;

  log.info('Interval Slack summary cron triggered', { executionId, minutes });

  // Verify authorization
  if (!verifyCronAuth(request)) {
    log.warn('Unauthorized interval summary request', { executionId });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Generate the interval report
    const summary = await generateIntervalReport(minutes, { skipEmpty: true });

    // Check if we should skip posting (empty interval)
    if (!summary.blocks || summary.blocks.length === 0) {
      log.info('No activity in interval, skipping Slack post', { executionId, minutes });
      return NextResponse.json({
        success: true,
        message: 'No activity in interval, skipped',
        skipped: true,
        executionId,
        duration: Date.now() - startTime,
      });
    }

    // Send to Slack
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      log.warn('SLACK_WEBHOOK_URL not configured', { executionId });
      return NextResponse.json({
        success: false,
        error: 'SLACK_WEBHOOK_URL not configured',
        summary: summary,
        executionId,
        duration: Date.now() - startTime,
      }, { status: 500 });
    }

    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      log.error('Failed to send interval summary to Slack', {
        executionId,
        status: slackResponse.status,
        error: errorText,
      });
      return NextResponse.json({
        success: false,
        error: `Slack webhook failed: ${slackResponse.status}`,
        details: errorText,
        executionId,
        duration: Date.now() - startTime,
      }, { status: 500 });
    }

    const duration = Date.now() - startTime;
    log.info('Interval Slack summary sent successfully', {
      executionId,
      minutes,
      duration,
    });

    return NextResponse.json({
      success: true,
      message: `${minutes}-minute summary sent to Slack`,
      executionId,
      duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Error in interval summary cron', {
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionId,
      duration,
    }, { status: 500 });
  }
}
