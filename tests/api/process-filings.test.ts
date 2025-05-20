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

jest.mock('@/lib/job-queue', () => ({
  JobQueueService: {
    addJob: jest.fn().mockImplementation(() => Promise.resolve({
      id: 'mock-job-id',
      status: 'PENDING'
    }))
  }
}));

// Mock Prisma
const mockFindMany = jest.fn();
const mockCreate = jest.fn();

// Mock Prisma client
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    secFiling: {
      findMany: mockFindMany
    },
    summary: {
      create: mockCreate
    },
    $disconnect: jest.fn()
  }))
}));

import { NextResponse } from 'next/server';
import { GET } from '@/app/api/cron/process-filings/route';
import { v4 as uuidv4 } from 'uuid';

// Simple mock request factory
const createMockRequest = (url: string) => {
  return new Request(url);
};

describe('Process Filings API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle empty filings list', async () => {
    // Mock empty filings
    mockFindMany.mockResolvedValueOnce([]);
    
    // Call the API
    const req = createMockRequest('https://example.com/api/cron/process-filings');
    
    const response = await GET(req);
    const data = await response.json();
    
    // Verify the response
    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      message: 'No unprocessed filings found',
      processed: 0
    });
    
    // Verify our mocks were called correctly
    expect(mockFindMany).toHaveBeenCalled();
  });

  it('should process filings and create summary records', async () => {
    // Mock filings data
    const mockFilings = [
      {
        id: 'filing-1',
        filingType: '10-K',
        url: 'https://example.com/filing1.html',
        tickerId: 'ticker-1',
        filingDate: new Date(),
        ticker: {
          symbol: 'AAPL',
          companyName: 'Apple Inc.'
        }
      },
      {
        id: 'filing-2',
        filingType: '8-K',
        url: 'https://example.com/filing2.html',
        tickerId: 'ticker-2',
        filingDate: new Date(),
        ticker: {
          symbol: 'MSFT',
          companyName: 'Microsoft Corporation'
        }
      }
    ];
    
    mockFindMany.mockResolvedValueOnce(mockFilings);
    mockCreate.mockImplementation(({ data }) => Promise.resolve({
      ...data
    }));
    
    // Call the API
    const req = createMockRequest('https://example.com/api/cron/process-filings?limit=5');
    
    const response = await GET(req);
    const data = await response.json();
    
    // Verify the response
    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({
      success: true,
      processed: 2,
      succeeded: 2,
      failed: 0
    }));
    
    // Verify that summary records were created
    expect(mockCreate).toHaveBeenCalledTimes(2);
    
    // Check that jobs were queued with appropriate priorities
    const { JobQueueService } = require('@/lib/job-queue');
    expect(JobQueueService.addJob).toHaveBeenCalledTimes(2);
    
    // Verify priority
    expect(JobQueueService.addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'SUMMARIZE_FILING',
        priority: 7 // 10-K priority
      })
    );
  });
}); 