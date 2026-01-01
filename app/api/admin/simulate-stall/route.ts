import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';

// Track simulated stall state
interface SimulatedStall {
  active: boolean;
  staleLocks: number;
  stallMinutes: number;
  createdAt: Date;
  lockIds: string[];
}

let simulatedStall: SimulatedStall | null = null;

// For testing only - reset simulation state
export function _resetSimulationForTesting(): void {
  simulatedStall = null;
}

function authenticate(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.ADMIN_API_SECRET;

  if (!authHeader || !expectedSecret) {
    return false;
  }

  const providedSecret = authHeader.replace('Bearer ', '');
  return providedSecret === expectedSecret;
}

function isAllowedEnvironment(): boolean {
  const env = process.env.NODE_ENV;
  return env === 'development' || env === 'test';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Authentication
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Environment protection - only works in dev/test
  if (!isAllowedEnvironment()) {
    return NextResponse.json(
      { error: 'Simulate stall endpoint is disabled in production for safety' },
      { status: 403 }
    );
  }

  try {
    // Parse body with defaults
    let staleLocks = 3;
    let stallMinutes = 150;

    try {
      const body = await request.json() as { staleLocks?: number; stallMinutes?: number };
      staleLocks = body.staleLocks ?? staleLocks;
      stallMinutes = body.stallMinutes ?? stallMinutes;
    } catch {
      // Use defaults
    }

    const prisma = getPrismaClient();
    const now = new Date();
    const expiredAt = new Date(now.getTime() - stallMinutes * 60 * 1000);
    const lockIds: string[] = [];

    // Create stale locks that look like a real stall
    for (let i = 0; i < staleLocks; i++) {
      const lock = await prisma.jobLock.create({
        data: {
          lockName: `simulated-stall-lock-${i}-${now.getTime()}`,
          acquiredBy: 'simulate-stall-endpoint',
          acquiredAt: expiredAt,
          expiresAt: expiredAt, // Already expired
          released: false,
        },
      });
      lockIds.push(lock.id);
    }

    // Store simulation state
    simulatedStall = {
      active: true,
      staleLocks,
      stallMinutes,
      createdAt: now,
      lockIds,
    };

    console.log('[SimulateStall] Created simulation:', {
      staleLocks,
      stallMinutes,
      lockIds,
    });

    return NextResponse.json({
      success: true,
      simulation: {
        active: true,
        staleLocks,
        stallMinutes,
        createdAt: now.toISOString(),
        lockIds,
      },
      instructions: [
        `Created ${staleLocks} stale locks simulating a ${stallMinutes}-minute stall`,
        'Wait for auto-recovery cron (runs every 15 minutes) to detect and clean up',
        'Or call /api/cron/auto-recover manually to trigger immediate recovery',
        'Call DELETE /api/admin/simulate-stall to clear simulation',
      ],
    });
  } catch (error) {
    console.error('[SimulateStall] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  // Authentication
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prisma = getPrismaClient();
    let cleared = false;

    // Clear any simulated locks
    if (simulatedStall && simulatedStall.lockIds.length > 0) {
      await prisma.jobLock.deleteMany({
        where: {
          id: { in: simulatedStall.lockIds },
        },
      });
      cleared = true;
    }

    // Also clean up any orphaned simulation locks
    const orphaned = await prisma.jobLock.deleteMany({
      where: {
        acquiredBy: 'simulate-stall-endpoint',
      },
    });

    const previousState = simulatedStall;
    simulatedStall = null;

    console.log('[SimulateStall] Cleared simulation:', {
      previousState,
      orphanedCleared: orphaned.count,
    });

    return NextResponse.json({
      success: true,
      cleared: cleared || orphaned.count > 0,
      previousSimulation: previousState,
      orphanedCleared: orphaned.count,
    });
  } catch (error) {
    console.error('[SimulateStall] Clear failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Authentication
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    simulation: simulatedStall,
    active: simulatedStall?.active ?? false,
  });
}
