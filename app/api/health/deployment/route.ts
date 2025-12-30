import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';

// Track when this instance was initialized (cold start detection)
const instanceStartTime = Date.now();
let warmupComplete = false;

/**
 * Deployment Health Check Endpoint
 *
 * Returns 200 only if deployment is stable and warmed up.
 * Used by Cloudflare Worker to verify Vercel is ready before full pipeline execution.
 *
 * GET /api/health/deployment
 */
export async function GET() {
  const startTime = Date.now();
  const instanceAge = Date.now() - instanceStartTime;

  const checks: {
    database: { connected: boolean; latencyMs: number };
    environment: { cronSecretConfigured: boolean; databaseUrlConfigured: boolean };
    warmup: { complete: boolean; instanceAgeMs: number; coldStart: boolean };
  } = {
    database: { connected: false, latencyMs: 0 },
    environment: { cronSecretConfigured: false, databaseUrlConfigured: false },
    warmup: { complete: warmupComplete, instanceAgeMs: instanceAge, coldStart: instanceAge < 5000 }
  };

  let allHealthy = true;

  // Check 1: Database connection
  try {
    const dbStart = Date.now();
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      connected: true,
      latencyMs: Date.now() - dbStart
    };

    // Mark warmup complete after first successful database query
    if (!warmupComplete) {
      warmupComplete = true;
    }
  } catch {
    checks.database = {
      connected: false,
      latencyMs: Date.now() - startTime
    };
    allHealthy = false;
  }

  // Check 2: Environment configuration
  checks.environment = {
    cronSecretConfigured: !!process.env.CRON_SECRET,
    databaseUrlConfigured: !!process.env.DATABASE_URL
  };

  if (!checks.environment.cronSecretConfigured || !checks.environment.databaseUrlConfigured) {
    allHealthy = false;
  }

  // Check 3: Warmup status
  checks.warmup = {
    complete: warmupComplete,
    instanceAgeMs: instanceAge,
    coldStart: instanceAge < 5000 // Less than 5 seconds old = cold start
  };

  const response = {
    ready: allHealthy,
    status: allHealthy ? 'OK' : 'NOT_READY',
    checks,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || 'local',
    deploymentUrl: process.env.VERCEL_URL || 'localhost',
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - startTime
  };

  // Return 503 if not ready, 200 if ready
  return NextResponse.json(response, {
    status: allHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
