import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
import { slackWebhookService } from '@/lib/slack/webhook-service';
import crypto from 'crypto';

const deploymentLogger = logger.child('vercel-deployment-webhook');

/**
 * Vercel Deployment Webhook Handler
 *
 * Receives deployment events from Vercel and posts notifications to Slack.
 * This helps correlate deployments with any pipeline issues.
 *
 * To configure:
 * 1. Go to Vercel Dashboard > Settings > Webhooks
 * 2. Add a new webhook pointing to: https://tldrsec.app/api/webhooks/vercel-deployment
 * 3. Select events: deployment.created, deployment.succeeded, deployment.failed
 * 4. Set a secret and add it as VERCEL_WEBHOOK_SECRET env var
 */

interface VercelDeploymentPayload {
  id: string;
  type: 'deployment.created' | 'deployment.succeeded' | 'deployment.failed' | 'deployment.ready' | 'deployment.error';
  createdAt: number;
  payload: {
    deployment: {
      id: string;
      name: string;
      url: string;
      meta?: {
        githubCommitSha?: string;
        githubCommitMessage?: string;
        githubCommitAuthorName?: string;
        githubRepo?: string;
        githubCommitRef?: string;
      };
    };
    project: {
      id: string;
      name: string;
    };
    target?: 'production' | 'preview';
  };
}

/**
 * Verify Vercel webhook signature
 */
function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac('sha1', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.text();
    const signature = request.headers.get('x-vercel-signature');
    const secret = process.env.VERCEL_WEBHOOK_SECRET;

    // Skip signature verification if secret not configured (development)
    if (secret) {
      if (!verifySignature(body, signature, secret)) {
        deploymentLogger.warn('Invalid Vercel webhook signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    } else {
      deploymentLogger.warn('VERCEL_WEBHOOK_SECRET not configured - skipping signature verification');
    }

    const event: VercelDeploymentPayload = JSON.parse(body);

    deploymentLogger.info('Received Vercel deployment event', {
      type: event.type,
      deploymentId: event.payload.deployment.id,
      project: event.payload.project.name,
      target: event.payload.target
    });

    // Only notify for production deployments
    if (event.payload.target !== 'production') {
      deploymentLogger.debug('Skipping notification for non-production deployment', {
        target: event.payload.target
      });
      return NextResponse.json({ ok: true, skipped: 'non-production' });
    }

    // Format and send Slack notification
    const deployment = event.payload.deployment;
    const meta = deployment.meta || {};

    let emoji = ':package:';
    let statusText = 'started';

    switch (event.type) {
      case 'deployment.created':
        emoji = ':hourglass_flowing_sand:';
        statusText = 'started';
        break;
      case 'deployment.succeeded':
      case 'deployment.ready':
        emoji = ':white_check_mark:';
        statusText = 'completed successfully';
        break;
      case 'deployment.failed':
      case 'deployment.error':
        emoji = ':x:';
        statusText = 'failed';
        break;
    }

    const commitInfo = meta.githubCommitMessage
      ? `\n> _${meta.githubCommitMessage.split('\n')[0]}_` // First line only
      : '';

    const branchInfo = meta.githubCommitRef || 'unknown branch';
    const authorInfo = meta.githubCommitAuthorName || 'unknown';

    const slackPayload = {
      text: `Deployment ${statusText}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Vercel Deployment ${statusText}*\n\`${event.payload.project.name}\` on \`${branchInfo}\`${commitInfo}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `By ${authorInfo} | <https://${deployment.url}|View Deployment> | ${new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit' })} AEST`
            }
          ]
        }
      ]
    };

    // Post to Slack
    const slackResponse = await slackWebhookService.postRaw(slackPayload);

    if (slackResponse.ok) {
      deploymentLogger.info('Posted deployment notification to Slack', {
        type: event.type,
        deploymentId: deployment.id,
        responseTime: Date.now() - startTime
      });
    } else {
      deploymentLogger.warn('Failed to post deployment notification to Slack', {
        error: slackResponse.error
      });
    }

    return NextResponse.json({
      ok: true,
      notified: slackResponse.ok,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    deploymentLogger.error('Error processing Vercel deployment webhook', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Health check for the webhook endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'vercel-deployment-webhook',
    configured: {
      webhookSecret: !!process.env.VERCEL_WEBHOOK_SECRET,
      slackWebhook: !!process.env.SLACK_WEBHOOK_URL
    }
  });
}
