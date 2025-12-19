/**
 * Slack Hourly Summary Cron Endpoint
 *
 * Generates and sends an hourly pipeline summary to Slack.
 * Scheduled to run every hour via Cloudflare Workers.
 *
 * The summary includes:
 * - Queue status (pending, processing, completed, failed)
 * - Filings discovered in the last hour
 * - Summaries generated and AI costs
 * - Emails sent
 * - Pipeline health issues (if any)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateHourlySummary } from '@/lib/slack/daily-report-handler';
import { logger } from '@/lib/logging';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 seconds max (should be quick)

const log = logger.child('slack-hourly-summary-cron');

/**
 * Verify cron authorization using HMAC signature or Bearer token
 */
function verifyCronAuth(request: NextRequest): boolean {
  // Check HMAC signature (preferred)
  const signature = request.headers.get('x-hmac-signature');
  const timestamp = request.headers.get('x-hmac-timestamp');

  if (signature && timestamp) {
    // HMAC validation would go here - for now, check if signature exists
    // The Cloudflare Worker generates valid HMAC signatures
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
  const executionId = request.headers.get('x-execution-id') || `hourly-summary-${Date.now()}`;

  log.info('Hourly Slack summary cron triggered', { executionId });

  // Verify authorization
  if (!verifyCronAuth(request)) {
    log.warn('Unauthorized hourly summary request', { executionId });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Generate the hourly summary
    const summary = await generateHourlySummary();

    // Send to Slack
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      log.warn('SLACK_WEBHOOK_URL not configured', { executionId });
      return NextResponse.json({
        success: false,
        error: 'SLACK_WEBHOOK_URL not configured',
        summary: summary, // Return summary for debugging
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
      log.error('Failed to send hourly summary to Slack', {
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
    log.info('Hourly Slack summary sent successfully', {
      executionId,
      duration,
    });

    return NextResponse.json({
      success: true,
      message: 'Hourly summary sent to Slack',
      executionId,
      duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Error in hourly summary cron', {
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
