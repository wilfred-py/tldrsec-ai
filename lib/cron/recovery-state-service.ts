/**
 * RecoveryStateService - Persistent auto-recovery state management
 *
 * Persists auto-recovery state across Vercel deployments. Previously,
 * recovery state was stored in-memory and would reset on every deployment,
 * causing:
 * - False healthy signals after deploys during ongoing incidents
 * - Reset of consecutiveDegraded counters before action thresholds
 * - Loss of cleanup/redeploy history
 *
 * The module is a deep singleton over the `RecoveryState` row (id='singleton').
 * Every mutation returns the fresh RecoveryState the caller then reads —
 * callers do not chain `mutate() + getState()`.
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 1
 */

import { getPrismaClient } from '@/lib/db/prisma';

/**
 * Recovery state interface matching database schema
 */
export interface RecoveryState {
  consecutiveDegraded: number;
  consecutiveCleanups: number;
  consecutiveRedeploys: number;
  lastCleanupTime: Date | null;
  lastRedeployTime: Date | null;
  lastHealthyTime: Date | null;
  lastDegradedTime: Date | null;
}

const SINGLETON_ID = 'singleton';

const DEFAULT_STATE: RecoveryState = {
  consecutiveDegraded: 0,
  consecutiveCleanups: 0,
  consecutiveRedeploys: 0,
  lastCleanupTime: null,
  lastRedeployTime: null,
  lastHealthyTime: null,
  lastDegradedTime: null,
};

/**
 * Fields that may appear on a raw `recoveryState` row. Only the persisted
 * columns are used here; the returned object is coerced to `RecoveryState`
 * defaults when a column is missing.
 */
interface RawRecoveryRow {
  consecutiveDegraded?: number;
  consecutiveCleanups?: number;
  consecutiveRedeploys?: number;
  lastCleanupTime?: Date | null;
  lastRedeployTime?: Date | null;
  lastHealthyTime?: Date | null;
  lastDegradedTime?: Date | null;
}

function toState(row: RawRecoveryRow | null | undefined): RecoveryState {
  if (!row) return { ...DEFAULT_STATE };
  return {
    consecutiveDegraded: row.consecutiveDegraded ?? 0,
    consecutiveCleanups: row.consecutiveCleanups ?? 0,
    consecutiveRedeploys: row.consecutiveRedeploys ?? 0,
    lastCleanupTime: row.lastCleanupTime ?? null,
    lastRedeployTime: row.lastRedeployTime ?? null,
    lastHealthyTime: row.lastHealthyTime ?? null,
    lastDegradedTime: row.lastDegradedTime ?? null,
  };
}

/**
 * RecoveryStateService provides persistent storage for auto-recovery state.
 *
 * Every mutation returns the fresh `RecoveryState` after write, so callers
 * never need `await X.mutate(); const state = await X.getState();`.
 *
 * Usage:
 * ```typescript
 * const state = await RecoveryStateService.getState();
 * const afterCleanup = await RecoveryStateService.recordCleanup();
 * const afterHealthy = await RecoveryStateService.resetOnHealthy();
 * ```
 */
export class RecoveryStateService {
  /**
   * Get current recovery state from database.
   * Creates default state if none exists.
   */
  static async getState(): Promise<RecoveryState> {
    const prisma = getPrismaClient();

    const dbState = await prisma.recoveryState.findUnique({
      where: { id: SINGLETON_ID },
    });

    if (!dbState) {
      const created = await prisma.recoveryState.create({
        data: { id: SINGLETON_ID },
      });
      return toState(created as RawRecoveryRow);
    }

    return toState(dbState as RawRecoveryRow);
  }

  /**
   * Increment consecutive-degraded counter and refresh timestamp.
   * Called when pipeline health is DEGRADED.
   */
  static async incrementConsecutiveDegraded(): Promise<RecoveryState> {
    const prisma = getPrismaClient();

    const row = await prisma.recoveryState.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        consecutiveDegraded: 1,
        lastDegradedTime: new Date(),
      },
      update: {
        consecutiveDegraded: { increment: 1 },
        lastDegradedTime: new Date(),
      },
    });

    return toState(row as RawRecoveryRow);
  }

  /**
   * Record a cleanup action.
   * Increments cleanup counter and refreshes timestamp.
   */
  static async recordCleanup(): Promise<RecoveryState> {
    const prisma = getPrismaClient();

    const row = await prisma.recoveryState.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        consecutiveCleanups: 1,
        lastCleanupTime: new Date(),
      },
      update: {
        consecutiveCleanups: { increment: 1 },
        lastCleanupTime: new Date(),
      },
    });

    return toState(row as RawRecoveryRow);
  }

  /**
   * Record a redeploy action.
   * Increments redeploy counter and refreshes timestamp.
   */
  static async recordRedeploy(): Promise<RecoveryState> {
    const prisma = getPrismaClient();

    const row = await prisma.recoveryState.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        consecutiveRedeploys: 1,
        lastRedeployTime: new Date(),
      },
      update: {
        consecutiveRedeploys: { increment: 1 },
        lastRedeployTime: new Date(),
      },
    });

    return toState(row as RawRecoveryRow);
  }

  /**
   * Reset state when pipeline returns to healthy.
   * Resets degraded counter but preserves cleanup/redeploy history.
   */
  static async resetOnHealthy(): Promise<RecoveryState> {
    const prisma = getPrismaClient();

    const row = await prisma.recoveryState.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        consecutiveDegraded: 0,
        lastHealthyTime: new Date(),
      },
      update: {
        consecutiveDegraded: 0,
        lastHealthyTime: new Date(),
      },
    });

    return toState(row as RawRecoveryRow);
  }

  /**
   * Full reset of all state.
   * Used for testing or manual intervention.
   */
  static async reset(): Promise<RecoveryState> {
    const prisma = getPrismaClient();

    const row = await prisma.recoveryState.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {
        consecutiveDegraded: 0,
        consecutiveCleanups: 0,
        consecutiveRedeploys: 0,
        lastCleanupTime: null,
        lastRedeployTime: null,
        lastHealthyTime: null,
        lastDegradedTime: null,
      },
    });

    return toState(row as RawRecoveryRow);
  }
}
