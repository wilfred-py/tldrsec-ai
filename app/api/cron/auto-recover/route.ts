import { NextRequest, NextResponse } from 'next/server';

// Track recovery state
interface RecoveryState {
  lastCleanupTime: number | null;
  lastRedeployTime: number | null;
  consecutiveCleanups: number;
  consecutiveRedeploys: number;
}

let recoveryState: RecoveryState = {
  lastCleanupTime: null,
  lastRedeployTime: null,
  consecutiveCleanups: 0,
  consecutiveRedeploys: 0,
};

// For testing only - reset recovery state
export function _resetRecoveryStateForTesting(): void {
  recoveryState = {
    lastCleanupTime: null,
    lastRedeployTime: null,
    consecutiveCleanups: 0,
    consecutiveRedeploys: 0,
  };
}

// Thresholds
const STALL_CRITICAL_MINUTES = 120;
const CLEANUP_TO_REDEPLOY_WAIT_MS = 10 * 60 * 1000; // 10 minutes
const REDEPLOY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

async function authenticateRequest(request: NextRequest): Promise<boolean> {
  // Check if middleware already validated the request (HMAC auth)
  const securityValidated = request.headers.get('x-security-validated');
  const authMethod = request.headers.get('x-auth-method');
  if (securityValidated === 'true' && authMethod === 'hmac') {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // Check header (legacy support for direct calls)
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  // Check query param (for Vercel cron) - use URL constructor for test compatibility
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret === cronSecret) return true;

  return false;
}

interface PipelineHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR';
  minutesSinceLastCompletion: number | null;
  jobs: {
    pending: number;
    processing: number;
    completedLast1h: number;
    completedLast24h: number;
    deadLetter: number;
    retrying: number;
  };
  locks: {
    healthStatus: string;
    staleCount: number;
    activeCount: number;
  };
}

async function getPipelineHealth(): Promise<PipelineHealth> {
  // Use production URL for public health endpoint to avoid deployment protection
  const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
  const response = await fetch(`${baseUrl}/api/health/pipeline`, {
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json() as Promise<PipelineHealth>;
}

async function triggerForceCleanup(): Promise<{ success: boolean; locksCleared: number }> {
  // Use production URL for admin endpoints to avoid deployment protection
  const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
  const adminSecret = process.env.ADMIN_API_SECRET;

  const response = await fetch(`${baseUrl}/api/admin/force-cleanup?source=auto-recover`, {
    headers: {
      'Authorization': `Bearer ${adminSecret}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Force cleanup failed: ${response.status}`);
  }

  return response.json() as Promise<{ success: boolean; locksCleared: number }>;
}

async function triggerRedeploy(reason: string): Promise<{ success: boolean; deploymentId: string }> {
  // Use production URL for admin endpoints to avoid deployment protection
  const baseUrl = process.env.PUBLIC_URL || 'https://tldrsec.app';
  const adminSecret = process.env.ADMIN_API_SECRET;

  const response = await fetch(`${baseUrl}/api/admin/trigger-redeploy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason, source: 'auto-recover' }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(`Redeploy failed: ${response.status} - ${error.error || 'Unknown'}`);
  }

  return response.json() as Promise<{ success: boolean; deploymentId: string }>;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Authentication
  if (!await authenticateRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get pipeline health
    const health = await getPipelineHealth();
    const now = Date.now();

    // Decision logic
    let action: 'none' | 'cleanup' | 'redeploy' = 'none';
    let reason = '';
    let result: Record<string, unknown> = {};

    // If healthy, no action needed
    if (health.status === 'HEALTHY') {
      recoveryState.consecutiveCleanups = 0;
      recoveryState.consecutiveRedeploys = 0;

      return NextResponse.json({
        action: 'none',
        reason: 'Pipeline is healthy',
        status: health.status,
        minutesSinceLastCompletion: health.minutesSinceLastCompletion,
        timestamp: new Date().toISOString(),
      });
    }

    // Check if stale locks need cleanup
    if (health.locks.staleCount > 0) {
      action = 'cleanup';
      reason = `${health.locks.staleCount} stale locks detected`;

      const cleanupResult = await triggerForceCleanup();
      result = cleanupResult;

      recoveryState.lastCleanupTime = now;
      recoveryState.consecutiveCleanups++;

      // Log cleanup action (no Slack - avoid spam)
      console.log('[AutoRecover] Cleanup triggered:', {
        reason,
        locksCleared: cleanupResult.locksCleared,
        consecutiveCleanups: recoveryState.consecutiveCleanups,
        pipelineStatus: health.status,
      });
    }
    // Check if redeploy is needed (critical stall, no stale locks, cooldown passed)
    else if (
      health.status === 'CRITICAL' &&
      health.minutesSinceLastCompletion !== null &&
      health.minutesSinceLastCompletion >= STALL_CRITICAL_MINUTES
    ) {
      // Check if we should wait after cleanup
      if (
        recoveryState.lastCleanupTime &&
        now - recoveryState.lastCleanupTime < CLEANUP_TO_REDEPLOY_WAIT_MS
      ) {
        const waitRemaining = Math.ceil(
          (CLEANUP_TO_REDEPLOY_WAIT_MS - (now - recoveryState.lastCleanupTime)) / 60000
        );

        return NextResponse.json({
          action: 'wait',
          reason: `Waiting ${waitRemaining} minutes after cleanup before redeploying`,
          status: health.status,
          timestamp: new Date().toISOString(),
        });
      }

      // Check redeploy cooldown
      if (
        recoveryState.lastRedeployTime &&
        now - recoveryState.lastRedeployTime < REDEPLOY_COOLDOWN_MS
      ) {
        const cooldownRemaining = Math.ceil(
          (REDEPLOY_COOLDOWN_MS - (now - recoveryState.lastRedeployTime)) / 60000
        );

        return NextResponse.json({
          action: 'cooldown',
          reason: `Redeploy cooldown active. ${cooldownRemaining} minutes remaining`,
          status: health.status,
          timestamp: new Date().toISOString(),
        });
      }

      // Trigger redeploy
      action = 'redeploy';
      reason = `Pipeline stalled for ${health.minutesSinceLastCompletion} minutes`;

      const redeployResult = await triggerRedeploy(reason);
      result = redeployResult;

      recoveryState.lastRedeployTime = now;
      recoveryState.consecutiveRedeploys++;

      // Log redeploy action (no Slack - avoid spam)
      console.log('[AutoRecover] Redeploy triggered:', {
        reason,
        deploymentId: redeployResult.deploymentId,
        consecutiveRedeploys: recoveryState.consecutiveRedeploys,
      });
    }
    // Degraded but not critical - log warning
    else if (health.status === 'DEGRADED') {
      return NextResponse.json({
        action: 'monitoring',
        reason: 'Pipeline degraded, monitoring for recovery',
        status: health.status,
        minutesSinceLastCompletion: health.minutesSinceLastCompletion,
        timestamp: new Date().toISOString(),
      });
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      action,
      reason,
      ...result,
      status: health.status,
      duration,
      recoveryState: {
        consecutiveCleanups: recoveryState.consecutiveCleanups,
        consecutiveRedeploys: recoveryState.consecutiveRedeploys,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AutoRecover] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
