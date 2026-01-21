/**
 * Tests for RecoveryStateService
 *
 * Unit tests for RecoveryStateService that verify the service correctly
 * interacts with the database to persist recovery state.
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 1
 */

import { getPrismaClient } from '@/lib/db/prisma';
import { RecoveryStateService } from '@/lib/cron/recovery-state-service';

// Get mocked Prisma client
const mockPrisma = getPrismaClient();

describe('RecoveryStateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RecoveryStateService.clearCache();
  });

  describe('getState', () => {
    it('should return default state when no state exists in database', async () => {
      // Mock findUnique to return null (no existing state)
      (mockPrisma.recoveryState.findUnique as jest.Mock).mockResolvedValueOnce(null);
      // Mock create for initial state
      (mockPrisma.recoveryState.create as jest.Mock).mockResolvedValueOnce({ id: 'singleton' });

      const state = await RecoveryStateService.getState();

      expect(state).toEqual({
        consecutiveDegraded: 0,
        consecutiveCleanups: 0,
        consecutiveRedeploys: 0,
        lastCleanupTime: null,
        lastRedeployTime: null,
        lastHealthyTime: null,
        lastDegradedTime: null,
      });
      expect(mockPrisma.recoveryState.findUnique).toHaveBeenCalledWith({
        where: { id: 'singleton' },
      });
    });

    it('should return persisted state from database', async () => {
      const mockDbState = {
        id: 'singleton',
        consecutiveDegraded: 2,
        consecutiveCleanups: 1,
        consecutiveRedeploys: 0,
        lastCleanupTime: new Date('2026-01-09T10:00:00Z'),
        lastRedeployTime: null,
        lastHealthyTime: new Date('2026-01-09T09:00:00Z'),
        lastDegradedTime: new Date('2026-01-09T10:30:00Z'),
      };
      (mockPrisma.recoveryState.findUnique as jest.Mock).mockResolvedValueOnce(mockDbState);

      const state = await RecoveryStateService.getState();

      expect(state.consecutiveDegraded).toBe(2);
      expect(state.consecutiveCleanups).toBe(1);
      expect(state.lastCleanupTime).toEqual(new Date('2026-01-09T10:00:00Z'));
    });
  });

  describe('incrementConsecutiveDegraded', () => {
    it('should call upsert with increment operation', async () => {
      (mockPrisma.recoveryState.upsert as jest.Mock).mockResolvedValueOnce({ id: 'singleton' });

      await RecoveryStateService.incrementConsecutiveDegraded();

      expect(mockPrisma.recoveryState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'singleton' },
          create: expect.objectContaining({
            id: 'singleton',
            consecutiveDegraded: 1,
          }),
          update: expect.objectContaining({
            consecutiveDegraded: { increment: 1 },
          }),
        })
      );
    });
  });

  describe('recordCleanup', () => {
    it('should call upsert with cleanup increment', async () => {
      (mockPrisma.recoveryState.upsert as jest.Mock).mockResolvedValueOnce({ id: 'singleton' });

      await RecoveryStateService.recordCleanup();

      expect(mockPrisma.recoveryState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'singleton' },
          update: expect.objectContaining({
            consecutiveCleanups: { increment: 1 },
          }),
        })
      );
    });
  });

  describe('recordRedeploy', () => {
    it('should call upsert with redeploy increment', async () => {
      (mockPrisma.recoveryState.upsert as jest.Mock).mockResolvedValueOnce({ id: 'singleton' });

      await RecoveryStateService.recordRedeploy();

      expect(mockPrisma.recoveryState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'singleton' },
          update: expect.objectContaining({
            consecutiveRedeploys: { increment: 1 },
          }),
        })
      );
    });
  });

  describe('resetOnHealthy', () => {
    it('should reset degraded counter to zero', async () => {
      (mockPrisma.recoveryState.upsert as jest.Mock).mockResolvedValueOnce({ id: 'singleton' });

      await RecoveryStateService.resetOnHealthy();

      expect(mockPrisma.recoveryState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'singleton' },
          update: expect.objectContaining({
            consecutiveDegraded: 0,
          }),
        })
      );
    });
  });

  describe('reset', () => {
    it('should reset all counters to default values', async () => {
      (mockPrisma.recoveryState.upsert as jest.Mock).mockResolvedValueOnce({ id: 'singleton' });

      await RecoveryStateService.reset();

      expect(mockPrisma.recoveryState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'singleton' },
          update: expect.objectContaining({
            consecutiveDegraded: 0,
            consecutiveCleanups: 0,
            consecutiveRedeploys: 0,
            lastCleanupTime: null,
            lastRedeployTime: null,
            lastHealthyTime: null,
            lastDegradedTime: null,
          }),
        })
      );
    });
  });

  describe('clearCache', () => {
    it('should clear the in-memory cache', async () => {
      // First load state into cache
      const mockDbState = {
        id: 'singleton',
        consecutiveDegraded: 5,
        consecutiveCleanups: 0,
        consecutiveRedeploys: 0,
        lastCleanupTime: null,
        lastRedeployTime: null,
        lastHealthyTime: null,
        lastDegradedTime: null,
      };
      (mockPrisma.recoveryState.findUnique as jest.Mock).mockResolvedValue(mockDbState);

      await RecoveryStateService.getState();

      // Clear cache
      RecoveryStateService.clearCache();

      // Next getState should query DB again
      await RecoveryStateService.getState();

      // findUnique should be called twice (once before clear, once after)
      expect(mockPrisma.recoveryState.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
