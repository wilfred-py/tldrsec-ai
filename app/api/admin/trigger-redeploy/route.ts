import { NextRequest, NextResponse } from 'next/server';

// Rate limiting: 1-hour cooldown, max 3 per 24 hours
interface RedeployRecord {
  timestamp: number;
  reason: string;
  deploymentId: string;
}

let redeployHistory: RedeployRecord[] = [];
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// For testing only - reset rate limit state
export function _resetRateLimitForTesting(): void {
  redeployHistory = [];
}

function checkRedeployRateLimit(): {
  allowed: boolean;
  reason?: string;
  cooldownRemaining?: number;
  dailyRemaining: number;
} {
  const now = Date.now();

  // Clean up old history (older than 24 hours)
  while (redeployHistory.length > 0 && now - redeployHistory[0].timestamp > DAY_MS) {
    redeployHistory.shift();
  }

  // Check daily limit
  if (redeployHistory.length >= MAX_PER_DAY) {
    const oldestInWindow = redeployHistory[0];
    return {
      allowed: false,
      reason: `Daily limit reached (${MAX_PER_DAY} per 24 hours). Reset at ${new Date(oldestInWindow.timestamp + DAY_MS).toISOString()}`,
      dailyRemaining: 0,
    };
  }

  // Check cooldown
  const lastRedeploy = redeployHistory[redeployHistory.length - 1];
  if (lastRedeploy && now - lastRedeploy.timestamp < COOLDOWN_MS) {
    const cooldownRemaining = COOLDOWN_MS - (now - lastRedeploy.timestamp);
    return {
      allowed: false,
      reason: `Cooldown active. Next redeploy available in ${Math.ceil(cooldownRemaining / 60000)} minutes`,
      cooldownRemaining,
      dailyRemaining: MAX_PER_DAY - redeployHistory.length,
    };
  }

  return {
    allowed: true,
    dailyRemaining: MAX_PER_DAY - redeployHistory.length,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Authentication
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.ADMIN_API_SECRET;

  if (!authHeader || !expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providedSecret = authHeader.replace('Bearer ', '');
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check Deploy Hook configuration
  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!deployHookUrl) {
    return NextResponse.json(
      { error: 'Deploy Hook URL not configured. Set VERCEL_DEPLOY_HOOK_URL environment variable.' },
      { status: 500 }
    );
  }

  // Rate limiting
  const rateLimit = checkRedeployRateLimit();
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: rateLimit.reason,
        cooldownRemaining: rateLimit.cooldownRemaining,
        dailyRemaining: rateLimit.dailyRemaining,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': rateLimit.dailyRemaining.toString(),
          'Retry-After': rateLimit.cooldownRemaining
            ? Math.ceil(rateLimit.cooldownRemaining / 1000).toString()
            : '3600',
        },
      }
    );
  }

  try {
    // Parse request body
    let reason = 'Manual trigger';
    let source = 'api';
    try {
      const body = await request.json() as { reason?: string; source?: string };
      reason = body.reason || reason;
      source = body.source || source;
    } catch {
      // Body is optional
    }

    // Trigger Deploy Hook
    const response = await fetch(deployHookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error('Deploy Hook failed:', response.status, response.statusText);
      return NextResponse.json(
        { error: `Deploy Hook failed: ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }

    const deployResult = await response.json() as { job?: { id?: string; state?: string } };
    const deploymentId = deployResult.job?.id || 'unknown';

    // Record in history
    redeployHistory.push({
      timestamp: Date.now(),
      reason,
      deploymentId,
    });

    const duration = Date.now() - startTime;

    // Log redeploy action (no Slack - avoid spam)
    console.log('[TriggerRedeploy] Executed:', {
      reason,
      source,
      deploymentId,
      duration,
      dailyRemaining: rateLimit.dailyRemaining - 1,
    });

    return NextResponse.json({
      success: true,
      deploymentId,
      state: deployResult.job?.state || 'UNKNOWN',
      reason,
      duration,
      dailyRemaining: rateLimit.dailyRemaining - 1,
      nextAvailable: new Date(Date.now() + COOLDOWN_MS).toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Trigger redeploy failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
