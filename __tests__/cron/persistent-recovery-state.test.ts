/**
 * Tests for RecoveryStateService — the deep persistent-recovery module.
 *
 * These tests assert on observable outcomes through the module's
 * interface: after a mutation, the returned RecoveryState reflects the
 * new counters and timestamps. The pre-deepening suite asserted on the
 * shape of Prisma `upsert` calls (past the interface) and on the
 * behaviour of an in-memory cache that no longer exists.
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 1
 */

import { getPrismaClient } from '@/lib/db/prisma';
import {
  RecoveryStateService,
  type RecoveryState,
} from '@/lib/cron/recovery-state-service';

const mockPrisma = getPrismaClient();

interface RecoveryRow {
  id: string;
  consecutiveDegraded: number;
  consecutiveCleanups: number;
  consecutiveRedeploys: number;
  lastCleanupTime: Date | null;
  lastRedeployTime: Date | null;
  lastHealthyTime: Date | null;
  lastDegradedTime: Date | null;
}

const emptyRow: RecoveryRow = {
  id: 'singleton',
  consecutiveDegraded: 0,
  consecutiveCleanups: 0,
  consecutiveRedeploys: 0,
  lastCleanupTime: null,
  lastRedeployTime: null,
  lastHealthyTime: null,
  lastDegradedTime: null,
};

function mockUpsertReturns(row: Partial<RecoveryRow>): void {
  (mockPrisma.recoveryState.upsert as jest.Mock).mockResolvedValueOnce({
    ...emptyRow,
    ...row,
  });
}

function mockFindUniqueReturns(row: Partial<RecoveryRow> | null): void {
  if (row === null) {
    (mockPrisma.recoveryState.findUnique as jest.Mock).mockResolvedValueOnce(null);
  } else {
    (mockPrisma.recoveryState.findUnique as jest.Mock).mockResolvedValueOnce({
      ...emptyRow,
      ...row,
    });
  }
}

describe('RecoveryStateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getState', () => {
    it('creates and returns the default state when no row exists', async () => {
      mockFindUniqueReturns(null);
      (mockPrisma.recoveryState.create as jest.Mock).mockResolvedValueOnce(emptyRow);

      const state = await RecoveryStateService.getState();

      expect(state).toEqual<RecoveryState>({
        consecutiveDegraded: 0,
        consecutiveCleanups: 0,
        consecutiveRedeploys: 0,
        lastCleanupTime: null,
        lastRedeployTime: null,
        lastHealthyTime: null,
        lastDegradedTime: null,
      });
    });

    it('returns the persisted state when a row exists', async () => {
      const persisted = {
        consecutiveDegraded: 2,
        consecutiveCleanups: 1,
        consecutiveRedeploys: 0,
        lastCleanupTime: new Date('2026-01-09T10:00:00Z'),
        lastRedeployTime: null,
        lastHealthyTime: new Date('2026-01-09T09:00:00Z'),
        lastDegradedTime: new Date('2026-01-09T10:30:00Z'),
      };
      mockFindUniqueReturns(persisted);

      const state = await RecoveryStateService.getState();

      expect(state.consecutiveDegraded).toBe(2);
      expect(state.consecutiveCleanups).toBe(1);
      expect(state.lastCleanupTime).toEqual(new Date('2026-01-09T10:00:00Z'));
      expect(state.lastHealthyTime).toEqual(new Date('2026-01-09T09:00:00Z'));
    });
  });

  describe('incrementConsecutiveDegraded', () => {
    it('returns the fresh state with the incremented degraded counter', async () => {
      const nowIsh = new Date('2026-01-09T11:00:00Z');
      mockUpsertReturns({
        consecutiveDegraded: 3,
        lastDegradedTime: nowIsh,
      });

      const state = await RecoveryStateService.incrementConsecutiveDegraded();

      expect(state.consecutiveDegraded).toBe(3);
      expect(state.lastDegradedTime).toEqual(nowIsh);
    });
  });

  describe('recordCleanup', () => {
    it('returns the fresh state with the incremented cleanup counter', async () => {
      const cleanupTime = new Date('2026-01-09T11:05:00Z');
      mockUpsertReturns({
        consecutiveCleanups: 4,
        lastCleanupTime: cleanupTime,
      });

      const state = await RecoveryStateService.recordCleanup();

      expect(state.consecutiveCleanups).toBe(4);
      expect(state.lastCleanupTime).toEqual(cleanupTime);
    });
  });

  describe('recordRedeploy', () => {
    it('returns the fresh state with the incremented redeploy counter', async () => {
      const redeployTime = new Date('2026-01-09T11:10:00Z');
      mockUpsertReturns({
        consecutiveRedeploys: 2,
        lastRedeployTime: redeployTime,
      });

      const state = await RecoveryStateService.recordRedeploy();

      expect(state.consecutiveRedeploys).toBe(2);
      expect(state.lastRedeployTime).toEqual(redeployTime);
    });
  });

  describe('resetOnHealthy', () => {
    it('returns the fresh state with degraded counter cleared and healthy timestamp set', async () => {
      const healthyTime = new Date('2026-01-09T11:15:00Z');
      mockUpsertReturns({
        consecutiveDegraded: 0,
        consecutiveCleanups: 5,
        consecutiveRedeploys: 1,
        lastHealthyTime: healthyTime,
      });

      const state = await RecoveryStateService.resetOnHealthy();

      expect(state.consecutiveDegraded).toBe(0);
      expect(state.consecutiveCleanups).toBe(5);
      expect(state.consecutiveRedeploys).toBe(1);
      expect(state.lastHealthyTime).toEqual(healthyTime);
    });
  });

  describe('reset', () => {
    it('returns the fully-defaulted state', async () => {
      mockUpsertReturns(emptyRow);

      const state = await RecoveryStateService.reset();

      expect(state).toEqual<RecoveryState>({
        consecutiveDegraded: 0,
        consecutiveCleanups: 0,
        consecutiveRedeploys: 0,
        lastCleanupTime: null,
        lastRedeployTime: null,
        lastHealthyTime: null,
        lastDegradedTime: null,
      });
    });
  });

  describe('mutation-then-caller pattern', () => {
    it('lets a caller drive a full cleanup+healthy sequence without a follow-up getState', async () => {
      const cleanupTime = new Date('2026-01-09T12:00:00Z');
      mockUpsertReturns({
        consecutiveCleanups: 1,
        lastCleanupTime: cleanupTime,
      });
      const healthyTime = new Date('2026-01-09T12:05:00Z');
      mockUpsertReturns({
        consecutiveCleanups: 1,
        lastCleanupTime: cleanupTime,
        consecutiveDegraded: 0,
        lastHealthyTime: healthyTime,
      });

      const afterCleanup = await RecoveryStateService.recordCleanup();
      const afterHealthy = await RecoveryStateService.resetOnHealthy();

      expect(afterCleanup.consecutiveCleanups).toBe(1);
      expect(afterHealthy.consecutiveDegraded).toBe(0);
      expect(afterHealthy.lastCleanupTime).toEqual(cleanupTime);
      expect(afterHealthy.lastHealthyTime).toEqual(healthyTime);

      expect(mockPrisma.recoveryState.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.recoveryState.findUnique).not.toHaveBeenCalled();
    });
  });
});
