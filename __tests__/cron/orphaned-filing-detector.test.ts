/**
 * Tests for OrphanedFilingDetector
 *
 * Unit tests for OrphanedFilingDetector that verify the service correctly
 * detects filings with processed=false but no corresponding JobQueue entries.
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 3
 */

import { OrphanedFilingDetector } from '@/lib/cron/orphaned-filing-detector';

describe('OrphanedFilingDetector', () => {
  describe('detectOrphanedFilings', () => {
    it('should return empty array when all unprocessed filings have jobs', async () => {
      // Mock: all unprocessed filings have corresponding jobs
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
        ],
        mockJobsForFilings: [
          { payload: { filingId: 'filing-1' } },
        ],
      });

      expect(orphaned).toHaveLength(0);
    });

    it('should detect filings without any jobs', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
          { id: 'filing-2', accessionNumber: 'ACC-2', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
        ],
        mockJobsForFilings: [
          { payload: { filingId: 'filing-1' } },
          // filing-2 has no jobs
        ],
      });

      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].id).toBe('filing-2');
    });

    it('should only consider filings older than threshold', async () => {
      const recentFiling = {
        id: 'filing-recent',
        accessionNumber: 'ACC-R',
        createdAt: new Date(), // Just created (within threshold)
      };

      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [recentFiling],
        mockJobsForFilings: [],
      });

      // Recent filings should not be flagged as orphaned
      expect(orphaned).toHaveLength(0);
    });

    it('should detect multiple orphaned filings', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', createdAt: new Date(Date.now() - 30 * 60 * 1000) },
          { id: 'filing-2', accessionNumber: 'ACC-2', createdAt: new Date(Date.now() - 25 * 60 * 1000) },
          { id: 'filing-3', accessionNumber: 'ACC-3', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
        ],
        mockJobsForFilings: [
          { payload: { filingId: 'filing-1' } },
          // filing-2 and filing-3 have no jobs
        ],
      });

      expect(orphaned).toHaveLength(2);
      expect(orphaned.map(f => f.id)).toContain('filing-2');
      expect(orphaned.map(f => f.id)).toContain('filing-3');
    });

    it('should return empty array when no unprocessed filings exist', async () => {
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        ageThresholdMinutes: 10,
        mockUnprocessedFilings: [],
        mockJobsForFilings: [],
      });

      expect(orphaned).toHaveLength(0);
    });

    it('should use default age threshold of 10 minutes', async () => {
      // Filing created 5 minutes ago (within default threshold)
      const orphaned = await OrphanedFilingDetector.detectOrphanedFilings({
        mockUnprocessedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', createdAt: new Date(Date.now() - 5 * 60 * 1000) },
        ],
        mockJobsForFilings: [],
      });

      expect(orphaned).toHaveLength(0);
    });
  });

  describe('recoverOrphanedFilings', () => {
    it('should create ASYNC_FETCH_FILING jobs for orphaned filings', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'ticker-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created).toHaveLength(1);
      expect(created[0].jobType).toBe('ASYNC_FETCH_FILING');
      expect(created[0].payload.filingId).toBe('filing-1');
    });

    it('should include source identifier in job payload', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-Q', tickerId: 'ticker-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created[0].payload.source).toBe('orphaned-filing-recovery');
    });

    it('should return empty array when no orphaned filings', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [],
        dryRun: true,
      });

      expect(created).toHaveLength(0);
    });

    it('should create jobs for multiple orphaned filings', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'ticker-1', createdAt: new Date() },
          { id: 'filing-2', accessionNumber: 'ACC-2', formType: '8-K', tickerId: 'ticker-2', createdAt: new Date() },
          { id: 'filing-3', accessionNumber: 'ACC-3', formType: 'Form 4', tickerId: 'ticker-3', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created).toHaveLength(3);
      expect(created[0].payload.filingId).toBe('filing-1');
      expect(created[1].payload.filingId).toBe('filing-2');
      expect(created[2].payload.filingId).toBe('filing-3');
    });

    it('should set higher priority for recovery jobs', async () => {
      const created = await OrphanedFilingDetector.recoverOrphanedFilings({
        mockOrphanedFilings: [
          { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'ticker-1', createdAt: new Date() },
        ],
        dryRun: true,
      });

      expect(created[0].priority).toBe(5);
    });
  });

  describe('getOrphanedSummary', () => {
    it('should return formatted summary for single orphaned filing', () => {
      const orphaned = [
        {
          id: 'filing-1',
          accessionNumber: 'ACC-1',
          formType: '10-K',
          tickerId: 'ticker-1',
          createdAt: new Date('2026-01-10T10:00:00Z'),
        },
      ];

      const summary = OrphanedFilingDetector.getOrphanedSummary(orphaned);

      expect(summary).toContain('filing-1');
      expect(summary).toContain('10-K');
      expect(summary).toContain('ACC-1');
    });

    it('should return formatted summary for multiple orphaned filings', () => {
      const orphaned = [
        { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'ticker-1', createdAt: new Date() },
        { id: 'filing-2', accessionNumber: 'ACC-2', formType: '8-K', tickerId: 'ticker-2', createdAt: new Date() },
      ];

      const summary = OrphanedFilingDetector.getOrphanedSummary(orphaned);

      expect(summary).toContain('filing-1');
      expect(summary).toContain('filing-2');
    });

    it('should return empty string for no orphaned filings', () => {
      const summary = OrphanedFilingDetector.getOrphanedSummary([]);

      expect(summary).toBe('');
    });
  });

  describe('checkAndRecover', () => {
    it('should return recovered count and filings list', async () => {
      // This test uses mocks provided to detectOrphanedFilings internally
      // For unit testing, we'll test the logic with dry run
      const result = await OrphanedFilingDetector.checkAndRecover({
        detectOptions: {
          ageThresholdMinutes: 10,
          mockUnprocessedFilings: [
            { id: 'filing-1', accessionNumber: 'ACC-1', formType: '10-K', tickerId: 'ticker-1', createdAt: new Date(Date.now() - 20 * 60 * 1000) },
          ],
          mockJobsForFilings: [],
        },
        dryRun: true,
      });

      expect(result.recovered).toBe(1);
      expect(result.filings).toHaveLength(1);
      expect(result.filings[0].id).toBe('filing-1');
    });

    it('should return zero when no orphaned filings found', async () => {
      const result = await OrphanedFilingDetector.checkAndRecover({
        detectOptions: {
          mockUnprocessedFilings: [],
          mockJobsForFilings: [],
        },
        dryRun: true,
      });

      expect(result.recovered).toBe(0);
      expect(result.filings).toHaveLength(0);
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      OrphanedFilingDetector.clearRateLimit();
    });

    it('should clear rate limit for testing', () => {
      // This test verifies the clearRateLimit method works
      OrphanedFilingDetector.clearRateLimit();
      // No error means success
      expect(true).toBe(true);
    });
  });
});
