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
import { checkRateLimit, getRateLimitHeaders } from '../../../../lib/slack/rate-limiter';
import { validateSlackPayload, validatePayloadComplexity, detectSuspiciousPatterns } from '../../../../lib/slack/input-validation';

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
  // Clean up env var: trim whitespace AND remove literal \n that CLI tools add
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim().replace(/\\n$/, '');
  if (!signingSecret) {
    slackEventsLogger.warn('SLACK_SIGNING_SECRET not configured');
    return false;
  }

  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');

  if (!timestamp || !signature) {
    slackEventsLogger.warn('Missing Slack signature headers', {
      hasTimestamp: !!timestamp,
      hasSignature: !!signature,
    });
    return false;
  }

  // Verify request is not too old (5 minutes)
  const requestTime = parseInt(timestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - requestTime) > 300) {
    slackEventsLogger.warn('Slack request timestamp too old', {
      requestTime,
      currentTime,
      diff: Math.abs(currentTime - requestTime),
    });
    return false;
  }

  // Calculate expected signature
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(baseString);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  // Log signature details for debugging (without exposing secrets)
  const rawSecretLength = process.env.SLACK_SIGNING_SECRET?.length || 0;
  slackEventsLogger.info('Signature verification attempt', {
    timestamp,
    signaturePrefix: signature.substring(0, 10),
    expectedPrefix: expectedSignature.substring(0, 10),
    rawSecretLength,
    cleanedSecretLength: signingSecret.length,
    bodyLength: body.length,
  });

  // Compare signatures using timing-safe comparison
  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      slackEventsLogger.warn('Signature length mismatch', {
        receivedLength: signatureBuffer.length,
        expectedLength: expectedBuffer.length,
      });
      return false;
    }

    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    if (!isValid) {
      slackEventsLogger.warn('Signature mismatch - check SLACK_SIGNING_SECRET matches App Basic Info');
    }
    return isValid;
  } catch (err) {
    slackEventsLogger.error('Signature comparison error', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
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
  let clientIp = 'unknown';
  let requestBody = '';
  
  try {
    // Get client IP for rate limiting
    clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';

    // Apply rate limiting for webhook endpoint
    const webhookRateLimit = checkRateLimit('slack_webhook', clientIp);
    if (!webhookRateLimit.allowed) {
      slackEventsLogger.warn('Rate limit exceeded for Slack webhook', {
        clientIp,
        resetTime: new Date(webhookRateLimit.resetTime).toISOString(),
      });

      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { 
          status: 429,
          headers: getRateLimitHeaders('slack_webhook', clientIp),
        }
      );
    }

    // Clone request to read body twice (once for verification, once for parsing)
    requestBody = await request.text();

    // Validate request body size (prevent DoS)
    if (requestBody.length > 10 * 1024) { // 10KB limit
      slackEventsLogger.warn('Request body too large', {
        clientIp,
        bodySize: requestBody.length,
      });
      return NextResponse.json(
        { error: 'Request body too large' },
        { status: 413 }
      );
    }

    // Parse the event payload with error handling
    let payload: SlackEventPayload;
    try {
      payload = JSON.parse(requestBody);
    } catch (parseError) {
      slackEventsLogger.warn('Invalid JSON payload', {
        clientIp,
        error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
        bodyPreview: requestBody.substring(0, 100),
      });
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Validate payload complexity to prevent DoS
    const complexityValidation = validatePayloadComplexity(payload);
    if (!complexityValidation.valid) {
      slackEventsLogger.warn('Payload complexity validation failed', {
        clientIp,
        errors: complexityValidation.errors,
      });
      return NextResponse.json(
        { error: 'Payload too complex' },
        { status: 400 }
      );
    }

    // Comprehensive input validation and sanitization
    const payloadValidation = validateSlackPayload(payload);
    if (!payloadValidation.valid) {
      slackEventsLogger.warn('Payload validation failed', {
        clientIp,
        errors: payloadValidation.errors,
      });
      return NextResponse.json(
        { error: 'Invalid payload format' },
        { status: 400 }
      );
    }

    // Check for suspicious patterns in text content
    if (payload.type === 'event_callback' && payload.event?.text) {
      const suspiciousPatterns = detectSuspiciousPatterns(payload.event.text);
      if (suspiciousPatterns.length > 0) {
        slackEventsLogger.warn('Suspicious patterns detected in message text', {
          clientIp,
          patterns: suspiciousPatterns,
          textPreview: payload.event.text.substring(0, 100),
        });
        return NextResponse.json(
          { error: 'Message contains invalid content' },
          { status: 400 }
        );
      }
    }

    // Use sanitized payload for further processing
    payload = payloadValidation.sanitized || payload;

    // Handle URL verification challenge BEFORE signature verification
    // This is required for initial Slack app setup
    if (payload.type === 'url_verification') {
      slackEventsLogger.info('Received URL verification challenge', { clientIp });
      return handleUrlVerification(payload as SlackUrlVerification);
    }

    // Verify request signature for all other requests
    let isValid = false;
    try {
      isValid = await verifySlackRequest(request, requestBody);
    } catch (verifyError) {
      slackEventsLogger.error('Error during signature verification', {
        clientIp,
        error: verifyError instanceof Error ? verifyError.message : 'Unknown verification error',
      });
      return NextResponse.json(
        { error: 'Signature verification failed' },
        { status: 401 }
      );
    }

    if (!isValid) {
      slackEventsLogger.warn('Invalid Slack request signature', { clientIp });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Handle event callbacks with error boundaries
    if (payload.type === 'event_callback' && payload.event) {
      const event = payload.event;

      // Validate event structure
      if (!event.type) {
        slackEventsLogger.warn('Event missing type field', { clientIp, payload });
        return NextResponse.json({ ok: true }); // Acknowledge but ignore
      }

      // Respond immediately to acknowledge receipt (Slack 3-second requirement)
      // Process the event asynchronously with error handling
      if (event.type === 'app_mention') {
        // Validate required fields for app_mention
        if (!event.user || !event.channel || !event.text) {
          slackEventsLogger.warn('app_mention event missing required fields', {
            clientIp,
            hasUser: !!event.user,
            hasChannel: !!event.channel,
            hasText: !!event.text,
          });
          return NextResponse.json({ ok: true }); // Acknowledge but ignore
        }

        // Fire-and-forget: start processing but don't wait
        // Wrap in additional error boundary
        setImmediate(() => {
          handleAppMention(event).catch(mentionError => {
            slackEventsLogger.error('Critical error in app mention handler', {
              error: mentionError instanceof Error ? mentionError.message : 'Unknown mention error',
              stack: mentionError instanceof Error ? mentionError.stack : undefined,
              user: event.user,
              channel: event.channel,
              clientIp,
            });
          });
        });

        // Return acknowledgment immediately
        return NextResponse.json({ ok: true });
      }

      if (event.type === 'message') {
        // Could handle DM messages here if needed
        slackEventsLogger.debug('Received message event', {
          channel: event.channel,
          user: event.user,
          clientIp,
        });
        return NextResponse.json({ ok: true });
      }

      slackEventsLogger.debug('Unhandled event type', { type: event.type, clientIp });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    slackEventsLogger.error('Critical error processing Slack event', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      clientIp,
      bodyLength: requestBody.length,
      bodyPreview: requestBody.substring(0, 200),
    });

    // Return 200 to prevent Slack from retrying (prevents infinite retry loops)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 200 });
  }
}

// GET handler for testing endpoint availability
export async function GET() {
  const hasSigningSecret = !!process.env.SLACK_SIGNING_SECRET;
  const hasBotToken = !!process.env.SLACK_BOT_TOKEN;

  return NextResponse.json({
    status: 'ok',
    message: 'Slack events endpoint is active',
    timestamp: new Date().toISOString(),
    config: {
      signingSecretConfigured: hasSigningSecret,
      botTokenConfigured: hasBotToken,
    },
  });
}
