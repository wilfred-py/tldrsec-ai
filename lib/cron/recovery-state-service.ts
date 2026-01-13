/**
 * RecoveryStateService - Persistent auto-recovery state management
 *
 * This service manages recovery state that persists in the database,
 * surviving Vercel deployments. Previously, recovery state was stored
 * in-memory and would reset on every deployment, causing:
 * - False healthy signals after deploys during ongoing incidents
 * - Reset of consecutiveDegraded counters before action thresholds
 * - Loss of cleanup/redeploy history
 *
 * Key features:
 * - Singleton pattern in database (single row with id='singleton')
 * - In-memory caching for performance (cleared on simulated deploy)
 * - All methods use upsert to handle missing row gracefully
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

/**
 * Default state values for initialization
 */
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
 * In-memory cache for performance.
 * Refreshed from DB on each getState() call.
 * Can be cleared via clearCache() to simulate deploy.
 */
let cachedState: RecoveryState | null = null;

/**
 * RecoveryStateService provides persistent storage for auto-recovery state.
 *
 * Usage:
 * ```typescript
 * // Get current state
 * const state = await RecoveryStateService.getState();
 *
 * // Update on degraded health
 * await RecoveryStateService.incrementConsecutiveDegraded();
 *
 * // Reset when healthy
 * await RecoveryStateService.resetOnHealthy();
 *
 * // Record recovery actions
 * await RecoveryStateService.recordCleanup();
 * await RecoveryStateService.recordRedeploy();
 * ```
 */
export class RecoveryStateService {
  private static readonly SINGLETON_ID = 'singleton';

  /**
   * Get current recovery state from database.
   * Creates default state if none exists.
   */
  static async getState(): Promise<RecoveryState> {
    const prisma = getPrismaClient();

    const dbState = await prisma.recoveryState.findUnique({
      where: { id: this.SINGLETON_ID },
    });

    if (!dbState) {
      // Create default state if doesn't exist
      await prisma.recoveryState.create({
        data: { id: this.SINGLETON_ID },
      });
      cachedState = { ...DEFAULT_STATE };
      return cachedState;
    }

    cachedState = {
      consecutiveDegraded: dbState.consecutiveDegraded,
      consecutiveCleanups: dbState.consecutiveCleanups,
      consecutiveRedeploys: dbState.consecutiveRedeploys,
      lastCleanupTime: dbState.lastCleanupTime,
      lastRedeployTime: dbState.lastRedeployTime,
      lastHealthyTime: dbState.lastHealthyTime,
      lastDegradedTime: dbState.lastDegradedTime,
    };

    return cachedState;
  }

  /**
   * Increment consecutive degraded counter and update timestamp.
   * Called when pipeline health is DEGRADED.
   */
  static async incrementConsecutiveDegraded(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: {
        id: this.SINGLETON_ID,
        consecutiveDegraded: 1,
        lastDegradedTime: new Date(),
      },
      update: {
        consecutiveDegraded: { increment: 1 },
        lastDegradedTime: new Date(),
      },
    });

    // Invalidate cache
    cachedState = null;
  }

  /**
   * Record a cleanup action.
   * Increments cleanup counter and updates timestamp.
   */
  static async recordCleanup(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: {
        id: this.SINGLETON_ID,
        consecutiveCleanups: 1,
        lastCleanupTime: new Date(),
      },
      update: {
        consecutiveCleanups: { increment: 1 },
        lastCleanupTime: new Date(),
      },
    });

    // Invalidate cache
    cachedState = null;
  }

  /**
   * Record a redeploy action.
   * Increments redeploy counter and updates timestamp.
   */
  static async recordRedeploy(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: {
        id: this.SINGLETON_ID,
        consecutiveRedeploys: 1,
        lastRedeployTime: new Date(),
      },
      update: {
        consecutiveRedeploys: { increment: 1 },
        lastRedeployTime: new Date(),
      },
    });

    // Invalidate cache
    cachedState = null;
  }

  /**
   * Reset state when pipeline returns to healthy.
   * Resets degraded counter but preserves cleanup/redeploy history.
   */
  static async resetOnHealthy(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: {
        id: this.SINGLETON_ID,
        consecutiveDegraded: 0,
        lastHealthyTime: new Date(),
      },
      update: {
        consecutiveDegraded: 0,
        lastHealthyTime: new Date(),
      },
    });

    // Invalidate cache
    cachedState = null;
  }

  /**
   * Full reset of all state.
   * Used for testing or manual intervention.
   */
  static async reset(): Promise<void> {
    const prisma = getPrismaClient();

    await prisma.recoveryState.upsert({
      where: { id: this.SINGLETON_ID },
      create: { id: this.SINGLETON_ID },
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

    cachedState = null;
  }

  /**
   * Clear in-memory cache.
   * Used to simulate Vercel deployment in tests.
   */
  static clearCache(): void {
    cachedState = null;
  }
}
