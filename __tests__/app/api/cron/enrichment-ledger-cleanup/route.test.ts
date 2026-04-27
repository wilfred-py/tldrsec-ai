/**
 * Unit tests for the enrichment-ledger-cleanup cron route.
 *
 * Verifies:
 *   - Auth gate rejects unauthenticated callers.
 *   - 90-day cutoff is computed and passed as `dateIso < cutoffIso` to both
 *     EnrichmentSpendEntry.deleteMany and EnrichmentSpend.deleteMany.
 *   - Telemetry counter `ai.enrichment_ledger_pruned` emits with row counts.
 *   - 5xx with diagnostic body when Prisma rejects.
 *
 * NOTE: jest.mock() factories run before module-scoped `const`s are initialized,
 * so all jest.fn()s must be inline. Refs are pulled out via `jest.requireMock`
 * after `jest.mock` registration.
 */

jest.mock('../../../../../lib/db/prisma', () => {
  const prismaSingleton = {
    enrichmentSpendEntry: { deleteMany: jest.fn() },
    enrichmentSpend: { deleteMany: jest.fn() },
  };
  return { getPrismaClient: () => prismaSingleton };
});

jest.mock('../../../../../lib/cron/auth-service', () => ({
  CronAuthService: { validateCronRequest: jest.fn() },
}));

jest.mock('../../../../../lib/monitoring', () => ({
  monitoring: { incrementCounter: jest.fn(), recordMetric: jest.fn() },
}));

jest.mock('../../../../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../../../../../app/api/cron/enrichment-ledger-cleanup/route';
import { getPrismaClient } from '../../../../../lib/db/prisma';
import { CronAuthService } from '../../../../../lib/cron/auth-service';
import { monitoring } from '../../../../../lib/monitoring';

const prismaMock = getPrismaClient() as unknown as {
  enrichmentSpendEntry: { deleteMany: jest.Mock };
  enrichmentSpend: { deleteMany: jest.Mock };
};
const mockEntryDeleteMany = prismaMock.enrichmentSpendEntry.deleteMany;
const mockSpendDeleteMany = prismaMock.enrichmentSpend.deleteMany;
const mockValidateCronRequest = CronAuthService.validateCronRequest as jest.Mock;
const mockIncrementCounter = monitoring.incrementCounter as jest.Mock;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/enrichment-ledger-cleanup', {
    method: 'GET',
    headers: { 'x-execution-id': 'test-run' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateCronRequest.mockResolvedValue({ isValid: true, clientIP: '127.0.0.1' });
  mockEntryDeleteMany.mockResolvedValue({ count: 0 });
  mockSpendDeleteMany.mockResolvedValue({ count: 0 });
});

describe('GET /api/cron/enrichment-ledger-cleanup', () => {
  it('returns 401 when auth fails', async () => {
    mockValidateCronRequest.mockResolvedValueOnce({
      isValid: false,
      error: 'bad signature',
      clientIP: '1.2.3.4',
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockEntryDeleteMany).not.toHaveBeenCalled();
    expect(mockSpendDeleteMany).not.toHaveBeenCalled();
  });

  it('passes a 90-day-old cutoff to both deleteMany calls', async () => {
    const before = Date.now();
    await GET(makeRequest());
    const after = Date.now();

    expect(mockEntryDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockSpendDeleteMany).toHaveBeenCalledTimes(1);

    const entryArg = mockEntryDeleteMany.mock.calls[0][0];
    const spendArg = mockSpendDeleteMany.mock.calls[0][0];
    expect(entryArg).toEqual({ where: { dateIso: { lt: expect.any(String) } } });
    expect(spendArg).toEqual({ where: { dateIso: { lt: expect.any(String) } } });

    const entryCutoff = entryArg.where.dateIso.lt;
    const spendCutoff = spendArg.where.dateIso.lt;
    expect(entryCutoff).toBe(spendCutoff);

    // Cutoff must be the YYYY-MM-DD form of (now - 90 days), within tolerance.
    const expectedMin = new Date(before - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const expectedMax = new Date(after - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    expect([expectedMin, expectedMax]).toContain(entryCutoff);
  });

  it('emits telemetry counters with the deleted row counts', async () => {
    mockEntryDeleteMany.mockResolvedValueOnce({ count: 7 });
    mockSpendDeleteMany.mockResolvedValueOnce({ count: 2 });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entriesDeleted: number; spendDeleted: number };
    expect(body.entriesDeleted).toBe(7);
    expect(body.spendDeleted).toBe(2);

    expect(mockIncrementCounter).toHaveBeenCalledWith(
      'ai.enrichment_ledger_pruned',
      7,
      { table: 'EnrichmentSpendEntry' },
    );
    expect(mockIncrementCounter).toHaveBeenCalledWith(
      'ai.enrichment_ledger_pruned',
      2,
      { table: 'EnrichmentSpend' },
    );
  });

  it('deletes children before parents (FK-safe order)', async () => {
    const callOrder: string[] = [];
    mockEntryDeleteMany.mockImplementationOnce(async () => {
      callOrder.push('entry');
      return { count: 1 };
    });
    mockSpendDeleteMany.mockImplementationOnce(async () => {
      callOrder.push('spend');
      return { count: 1 };
    });
    await GET(makeRequest());
    expect(callOrder).toEqual(['entry', 'spend']);
  });

  it('returns 500 when Prisma rejects', async () => {
    mockEntryDeleteMany.mockRejectedValueOnce(new Error('db down'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('db down');
  });
});
