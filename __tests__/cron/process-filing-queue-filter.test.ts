/**
 * Process Filing Queue Job Types Filter Tests
 *
 * Tests the jobTypes query parameter filtering functionality that prevents
 * discovery jobs from blocking fetch/summarize jobs in the cron pipeline.
 */

import { GET } from '../../app/api/cron/process-filing-queue/route';

// Mock dependencies
jest.mock('../../lib/logging', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../lib/cron/auth-service', () => ({
  CronAuthService: {
    validateCronRequest: jest.fn(),
  },
}));

jest.mock('../../lib/cron/background-filing-worker', () => ({
  BackgroundFilingWorker: jest.fn().mockImplementation((options) => ({
    processBatch: jest.fn().mockResolvedValue(undefined),
    options, // Store options for verification
  })),
}));

// Helper to create a mock request with nextUrl support
function createMockRequest(url: string) {
  const urlObj = new URL(url);
  return {
    nextUrl: {
      searchParams: urlObj.searchParams,
    },
    headers: {
      get: () => null,
    },
  } as any;
}

describe('process-filing-queue jobTypes filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: auth passes
    const { CronAuthService } = require('../../lib/cron/auth-service');
    CronAuthService.validateCronRequest.mockResolvedValue({
      isValid: true,
      clientIP: '127.0.0.1',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should accept valid job type filter', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobTypesFilter).toEqual(['ASYNC_FETCH_FILING']);
  });

  it('should reject invalid job type filter', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=INVALID_TYPE'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid job types');
    expect(data.invalidTypes).toContain('INVALID_TYPE');
  });

  it('should process all types when no filter provided', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobTypesFilter).toBe('all');
  });

  it('should accept multiple job types', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobTypesFilter).toEqual(['ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED']);
  });

  it('should pass job types filter to worker', async () => {
    const { BackgroundFilingWorker } = require('../../lib/cron/background-filing-worker');

    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED'
    );

    await GET(request);

    // Verify worker was instantiated with the job types filter
    expect(BackgroundFilingWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTypes: ['ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED'],
      })
    );
  });

  it('should pass undefined job types when no filter provided', async () => {
    const { BackgroundFilingWorker } = require('../../lib/cron/background-filing-worker');

    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue'
    );

    await GET(request);

    // Verify worker was instantiated without job types filter
    expect(BackgroundFilingWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTypes: undefined,
      })
    );
  });

  it('should reject request with mixed valid and invalid job types', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,INVALID_TYPE'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid job types');
    expect(data.invalidTypes).toContain('INVALID_TYPE');
  });

  it('should handle empty job types parameter gracefully', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes='
    );

    const response = await GET(request);
    const data = await response.json();

    // Empty string should be treated as no filter
    expect(response.status).toBe(200);
    expect(data.jobTypesFilter).toBe('all');
  });

  it('should accept ASYNC_DISCOVER_FILINGS as valid job type', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobTypesFilter).toEqual(['ASYNC_DISCOVER_FILINGS']);
  });

  it('should handle whitespace in job types parameter', async () => {
    const request = createMockRequest(
      'http://localhost:3000/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,%20ASYNC_SUMMARIZE_CACHED'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Whitespace should be trimmed
    expect(data.jobTypesFilter).toEqual(['ASYNC_FETCH_FILING', 'ASYNC_SUMMARIZE_CACHED']);
  });
});
