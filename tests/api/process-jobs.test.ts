// Mock Prisma client
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    jobQueue: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    },
    $disconnect: jest.fn()
  }))
}));

// Mock dependencies first to avoid reference errors
jest.mock('@/lib/logging', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    })
  }
}));

jest.mock('@/lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordTiming: jest.fn(),
    recordValue: jest.fn(),
    trackJobOperation: jest.fn()
  }
}));

// Mock JobQueueService
const mockGetJobsToProcess = jest.fn();
const mockUpdateJobStatus = jest.fn();

jest.mock('@/lib/job-queue', () => ({
  JobQueueService: {
    getJobsToProcess: mockGetJobsToProcess,
    updateJobStatus: mockUpdateJobStatus
  }
}));

// Mock the lock service
jest.mock('@/lib/job-queue/lock-service', () => ({
  LockService: {
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(true)
  }
}));

// Mock the summarize function
const mockSummarizeFiling = jest.fn().mockResolvedValue({
  summaryId: 'mock-summary-id',
  summaryText: 'Mock summary text',
  summaryJSON: { key: 'value' }
});

jest.mock('@/lib/ai/summarize', () => ({
  summarizeFiling: mockSummarizeFiling
}));

// Import after mocks
import { GET } from '@/app/api/cron/process-jobs/route';

describe('Process Jobs API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle empty jobs list', async () => {
    // Mock empty jobs
    mockGetJobsToProcess.mockResolvedValueOnce([]);
    
    // Call the API
    const req = new Request('https://example.com/api/cron/process-jobs');
    
    const response = await GET(req);
    const data = await response.json();
    
    // Verify the response
    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      message: 'No jobs to process',
      jobsProcessed: 0
    });
    
    // Verify our mocks were called correctly
    expect(mockGetJobsToProcess).toHaveBeenCalled();
  });

  it('should process SUMMARIZE_FILING jobs successfully', async () => {
    // Create mock job
    const mockJob = {
      id: 'job-1',
      jobType: 'SUMMARIZE_FILING',
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      payload: {
        summaryId: 'summary-1',
        filingId: 'filing-1',
        filingType: '10-K'
      }
    };
    
    // Setup mocks
    mockGetJobsToProcess.mockResolvedValueOnce([mockJob]);
    
    // Call the API
    const req = new Request('https://example.com/api/cron/process-jobs?limit=1');
    
    const response = await GET(req);
    const data = await response.json();
    
    // Verify the response
    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({
      success: true,
      processed: 1,
      succeeded: 1,
      failed: 0
    }));
    
    // Verify our mocks were called correctly
    expect(mockGetJobsToProcess).toHaveBeenCalled();
    expect(mockUpdateJobStatus).toHaveBeenCalledTimes(2); // Once for PROCESSING, once for COMPLETED
    expect(mockSummarizeFiling).toHaveBeenCalledWith('summary-1');
  });
});
