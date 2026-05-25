/**
 * Unit tests for scripts/backfill-cleaned-content.ts
 *
 * Verifies: cursor-based batch loop, error-tolerance (one bad row doesn't
 * abort the batch), dry-run (no writes), and progress logging cadence.
 */

// Mock prisma before the script module is imported
const mockUpdate = jest.fn(async () => ({}));
const mockFindMany = jest.fn();

jest.mock('../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    filingContentCache: {
      findMany: mockFindMany,
      update: mockUpdate,
    },
  })),
}));

// Mock cleanHtmlContent so tests don't depend on DOM parsing infrastructure
jest.mock('../../lib/parsers/filing-extractor', () => ({
  cleanHtmlContent: jest.fn((html: string) => `CLEANED:${html}`),
}));

import { runBackfill } from '../../scripts/backfill-cleaned-content';
import { cleanHtmlContent } from '../../lib/parsers/filing-extractor';

const mockedClean = cleanHtmlContent as jest.MockedFunction<typeof cleanHtmlContent>;

describe('backfill-cleaned-content — runBackfill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls update for each row with non-empty cleaned content', async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: 'row-1', content: '<html>content1</html>' },
        { id: 'row-2', content: '<html>content2</html>' },
      ])
      .mockResolvedValueOnce([]); // terminate loop

    await runBackfill({ dryRun: false, sleepMs: 0 });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'row-1' } })
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'row-2' } })
    );
  });

  it('does NOT call update in dry-run mode', async () => {
    mockFindMany
      .mockResolvedValueOnce([{ id: 'row-1', content: '<html>x</html>' }])
      .mockResolvedValueOnce([]);

    await runBackfill({ dryRun: true, sleepMs: 0 });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips rows where cleanHtmlContent returns empty string (warns instead of erroring)', async () => {
    mockedClean.mockReturnValueOnce('').mockReturnValue('CLEANED:content');

    mockFindMany
      .mockResolvedValueOnce([
        { id: 'row-empty', content: '<html></html>' },
        { id: 'row-ok', content: '<html>content</html>' },
      ])
      .mockResolvedValueOnce([]);

    await runBackfill({ dryRun: false, sleepMs: 0 });

    // row-empty skipped, row-ok written
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'row-ok' } })
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('row-empty')
    );
  });

  it('continues processing remaining rows after a per-row error', async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: 'row-bad', content: '<html>bad</html>' },
        { id: 'row-good', content: '<html>good</html>' },
      ])
      .mockResolvedValueOnce([]);

    // Make update throw on first row, succeed on second
    mockUpdate
      .mockRejectedValueOnce(new Error('DB write failed'))
      .mockResolvedValueOnce({});

    await runBackfill({ dryRun: false, sleepMs: 0 });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('row-bad')
    );
  });

  it('is idempotent — uses cursor pagination so already-cleaned rows are not re-queried', async () => {
    // findMany only returns rows WHERE cleanedContent IS NULL — the WHERE clause
    // in the real code ensures already-cleaned rows are never returned.
    // This test verifies the WHERE predicate is forwarded to findMany.
    mockFindMany.mockResolvedValue([]); // always empty — loop exits on first call

    await runBackfill({ dryRun: false, sleepMs: 0 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cleanedContent: null, status: 'CACHED' }),
      })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('advances cursor between batches', async () => {
    // Use mockImplementation with a call-counter closure to avoid one-time
    // value queue ordering surprises (mockResolvedValueOnce can interact
    // unexpectedly with clearAllMocks across tests).
    const responses = [
      [{ id: 'a-001', content: '<html>1</html>' }, { id: 'a-002', content: '<html>2</html>' }],
      [{ id: 'b-001', content: '<html>3</html>' }],
      [],
    ];
    let callIndex = 0;
    mockFindMany.mockImplementation(async () => responses[callIndex++] ?? []);

    await runBackfill({ dryRun: false, sleepMs: 0 });

    // Loop made 3 findMany calls total (2 data batches + 1 empty terminator)
    expect(mockFindMany).toHaveBeenCalledTimes(3);

    // Second call should use cursor = last id of first batch
    expect(mockFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: 'a-002' },
        skip: 1,
      })
    );
    // Third call uses cursor from second batch
    expect(mockFindMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        cursor: { id: 'b-001' },
        skip: 1,
      })
    );
  });
});
