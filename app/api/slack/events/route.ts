/**
 * Slack Events API Handler
 *
 * Handles Slack event subscriptions including:
 * - URL verification challenge
 * - app_mention events for @mention queries
 *
 * Must respond within 3 seconds per Slack requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '../../../../lib/logging';
import type { SlackEventPayload, SlackEvent, SlackUrlVerification } from '../../../../lib/slack/types';
import { handleConversation } from '../../../../lib/slack/conversation-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const slackEventsLogger = logger.child('slack-events');

// =============================================================================
// Request Verification
// =============================================================================

/**
 * Verify that the request came from Slack
 * Uses the signing secret to validate the request signature
 */
async function verifySlackRequest(
  request: NextRequest,
  body: string
): Promise<boolean> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    slackEventsLogger.warn('SLACK_SIGNING_SECRET not configured');
    return false;
  }

  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');

  if (!timestamp || !signature) {
    slackEventsLogger.warn('Missing Slack signature headers');
    return false;
  }

  // Verify request is not too old (5 minutes)
  const requestTime = parseInt(timestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - requestTime) > 300) {
    slackEventsLogger.warn('Slack request timestamp too old', {
      requestTime,
      currentTime,
    });
    return false;
  }

  // Calculate expected signature
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(baseString);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  // Compare signatures using timing-safe comparison
  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle URL verification challenge from Slack
 */
function handleUrlVerification(payload: SlackUrlVerification): NextResponse {
  slackEventsLogger.info('Handling URL verification challenge');
  return NextResponse.json({ challenge: payload.challenge });
}

/**
 * Handle app_mention event
 * Processes @mention queries asynchronously to meet 3-second requirement
 */
async function handleAppMention(event: SlackEvent): Promise<void> {
  slackEventsLogger.info('Handling app_mention event', {
    user: event.user,
    channel: event.channel,
    text: event.text.substring(0, 100),
  });

  // Process asynchronously (don't await to respond quickly)
  handleConversation({
    text: event.text,
    userId: event.user,
    channelId: event.channel,
    threadTs: event.thread_ts,
    intent: 'unknown', // Will be determined by conversation handler
  }).catch(error => {
    slackEventsLogger.error('Error handling app_mention', {
      error: error instanceof Error ? error.message : 'Unknown error',
      user: event.user,
      channel: event.channel,
    });
  });
}

// =============================================================================
// Main Handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Clone request to read body twice (once for verification, once for parsing)
    const body = await request.text();

    // Verify request signature
    const isValid = await verifySlackRequest(request, body);
    if (!isValid) {
      slackEventsLogger.warn('Invalid Slack request signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse the event payload
    const payload: SlackEventPayload = JSON.parse(body);

    // Handle URL verification
    if (payload.type === 'url_verification') {
      return handleUrlVerification(payload as SlackUrlVerification);
    }

    // Handle event callbacks
    if (payload.type === 'event_callback' && payload.event) {
      const event = payload.event;

      // Respond immediately to acknowledge receipt (Slack 3-second requirement)
      // Process the event asynchronously
      if (event.type === 'app_mention') {
        // Fire-and-forget: start processing but don't wait
        handleAppMention(event);

        // Return acknowledgment immediately
        return NextResponse.json({ ok: true });
      }

      if (event.type === 'message') {
        // Could handle DM messages here if needed
        slackEventsLogger.debug('Received message event', {
          channel: event.channel,
          user: event.user,
        });
        return NextResponse.json({ ok: true });
      }

      slackEventsLogger.debug('Unhandled event type', { type: event.type });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    slackEventsLogger.error('Error processing Slack event', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Return 200 to prevent Slack from retrying
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 200 });
  }
}

// GET handler for testing endpoint availability
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Slack events endpoint is active',
    timestamp: new Date().toISOString(),
  });
}
