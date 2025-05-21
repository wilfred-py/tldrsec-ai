import { DigestService } from '../digest-service';
import { JobQueueService, processJobCallback } from '../../job-queue';
import { ResendClient } from '../resend-client';

// We'll test the integration with JobQueueService but still mock underlying dependencies
jest.mock('../resend-client');
jest.mock('../../logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));
jest.mock('../../monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
    recordValue: jest.fn(),
  }
}));

// Mock email sending
jest.mock('../index', () => ({
  ResendClient: jest.fn(),
  sendEmail: jest.fn().mockResolvedValue({}),
}));

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    ticker: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    summary: {
      updateMany: jest.fn(),
    },
    jobQueue: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    }
  };
  
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Partial mock of JobQueueService - we'll only mock selected methods
jest.mock('../../job-queue', () => {
  const originalModule = jest.requireActual('../../job-queue');
  return {
    ...originalModule,
    JobQueueService: {
      ...originalModule.JobQueueService,
      addJob: jest.fn(),
      processJob: jest.fn(),
    }
  };
});

describe('DigestService Integration', () => {
  let digestService: DigestService;
  let mockPrismaClient: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaClient = (new (require('@prisma/client').PrismaClient)());
    digestService = new DigestService();
  });
  
  describe('JobQueue Integration', () => {
    it('should create a job with the correct jobType when scheduling', async () => {
      // Mock job creation
      const mockJob = { id: 'job-123', jobType: 'COMPILE_DAILY_DIGEST' };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      
      await digestService.scheduleDigestCompilation();
      
      // Check that we're using the correct job type constant
      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'COMPILE_DAILY_DIGEST',
          priority: 7
        })
      );
    });
    
    it('should generate an idempotency key that includes the current date', async () => {
      // Mock job creation
      const mockJob = { id: 'job-123' };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      
      // Save original Date
      const RealDate = global.Date;
      
      // Mock Date.now() to return a fixed timestamp
      const currentDate = new Date('2023-03-15T12:00:00Z');
      global.Date = class extends RealDate {
        constructor() {
          super();
          return currentDate;
        }
        static now() {
          return currentDate.getTime();
        }
      } as typeof global.Date;
      
      await digestService.scheduleDigestCompilation();
      
      // Restore Date
      global.Date = RealDate;
      
      // Verify idempotency key includes the date
      expect(JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'daily-digest-2023-03-15'
        })
      );
    });
    
    it('should run digest compilation when processJob is called with the correct job', async () => {
      // Create a spy on the compileAndSendDigests method
      const compileAndSendDigestsSpy = jest.spyOn(
        digestService,
        'compileAndSendDigests'
      ).mockImplementation(async () => {});
      
      // Create a mock job
      const mockJob = {
        id: 'job-123',
        jobType: 'COMPILE_DAILY_DIGEST',
        payload: {
          scheduledAt: new Date().toISOString()
        }
      };
      
      // Call processJobCallback directly
      await processJobCallback(mockJob, digestService);
      
      // Check that compileAndSendDigests was called
      expect(compileAndSendDigestsSpy).toHaveBeenCalled();
    });
    
    it('should not run compilation for other job types', async () => {
      // Create a spy on the compileAndSendDigests method
      const compileAndSendDigestsSpy = jest.spyOn(
        digestService,
        'compileAndSendDigests'
      ).mockImplementation(async () => {});
      
      // Create a mock job with a different job type
      const mockJob = {
        id: 'job-123',
        jobType: 'SOME_OTHER_JOB',
        payload: {}
      };
      
      // Call processJobCallback directly
      await processJobCallback(mockJob, digestService);
      
      // Check that compileAndSendDigests was NOT called
      expect(compileAndSendDigestsSpy).not.toHaveBeenCalled();
    });
  });
}); 