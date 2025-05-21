import { DigestService } from '../digest-service';
import { JobQueueService } from '../../job-queue';
import { ResendClient } from '../resend-client';
import { NotificationPreference } from '../notification-service';

// Mock dependencies
jest.mock('../index', () => ({
  ResendClient: jest.fn(),
  sendEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id', success: true }),
}));

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
    startTimer: jest.fn().mockReturnValue('timer-id'),
    stopTimer: jest.fn(),
    recordValue: jest.fn(),
  }
}));

jest.mock('../../job-queue', () => ({
  JobQueueService: {
    addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
  }
}));

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    ticker: {
      findMany: jest.fn(),
    },
    summary: {
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    sentDigest: {
      create: jest.fn(),
    }
  };
  
  return {
    PrismaClient: jest.fn().mockImplementation(() => mockPrismaClient),
  };
});

describe('DigestService', () => {
  let digestService: DigestService;
  let mockEmailClient: jest.Mocked<ResendClient>;
  let mockPrismaClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mock Prisma client instance
    mockPrismaClient = (new (require('@prisma/client').PrismaClient)());
    
    mockEmailClient = new ResendClient() as jest.Mocked<ResendClient>;
    digestService = new DigestService(mockEmailClient);
    
    // Reset all mock implementations to defaults
    mockPrismaClient.user.findMany.mockReset();
    mockPrismaClient.user.findUnique.mockReset();
    mockPrismaClient.ticker.findMany.mockReset();
    mockPrismaClient.summary.updateMany.mockReset();
  });

  describe('scheduleDigestCompilation', () => {
    it('should schedule a job and not run immediately by default', async () => {
      // Mock JobQueueService.addJob to return a mock job
      const mockJob = { id: 'job-1234' };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      
      await digestService.scheduleDigestCompilation();
      
      // Should have called JobQueueService.addJob with the right parameters
      expect(JobQueueService.addJob).toHaveBeenCalledWith({
        jobType: 'COMPILE_DAILY_DIGEST',
        payload: expect.objectContaining({
          scheduledAt: expect.any(String)
        }),
        priority: 7,
        idempotencyKey: expect.stringContaining('daily-digest-')
      });
      
      // Should not run immediately
      expect(mockPrismaClient.user.findMany).not.toHaveBeenCalled();
    });

    it('should run compilation immediately when specified', async () => {
      // Mock JobQueueService.addJob to return a mock job
      const mockJob = { id: 'job-1234' };
      (JobQueueService.addJob as jest.Mock).mockResolvedValue(mockJob);
      
      // Mock getUsersWithDigestPreference to return empty array to simplify test
      mockPrismaClient.user.findMany.mockResolvedValue([]);
      
      await digestService.scheduleDigestCompilation(true);
      
      // Should schedule job first
      expect(JobQueueService.addJob).toHaveBeenCalled();
      
      // And should have started compilation by querying for users
      expect(mockPrismaClient.user.findMany).toHaveBeenCalled();
    });
  });

  describe('compileAndSendDigests', () => {
    it('should skip users with no summaries', async () => {
      // Mock user with digest preference
      const mockUsers = [{
        id: 'user-1',
        email: 'user1@example.com',
        name: 'User One',
        preferences: { emailNotificationPreference: NotificationPreference.DAILY }
      }];
      mockPrismaClient.user.findMany.mockResolvedValue(mockUsers);
      
      // Mock user retrieval
      mockPrismaClient.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user1@example.com',
        name: 'User One'
      });
      
      // Mock empty ticker/summary data
      mockPrismaClient.ticker.findMany.mockResolvedValue([]);
      
      await digestService.compileAndSendDigests();
      
      // Should not try to send email
      expect(require('../index').sendEmail).not.toHaveBeenCalled();
      
      // Should record empty count metric
      expect(require('../../monitoring').monitoring.incrementCounter)
        .toHaveBeenCalledWith('digest.email.empty', 1);
    });

    it('should process and send digests for users with summaries', async () => {
      // Set up mock data
      const mockUser = {
        id: 'user-1',
        email: 'user1@example.com',
        name: 'User One',
        notificationPreference: 'daily',
        tickers: [
          {
            id: 'ticker-1',
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            summaries: [
              {
                id: 'summary-1',
                filingType: '10-K',
                filingDate: new Date(),
                filingUrl: 'https://example.com/filing.pdf',
                summaryText: 'Test summary text',
                summaryJSON: { 
                  period: 'FY 2022',
                  insights: ['Revenue up 5%']
                },
                sentToUser: false,
                createdAt: new Date()
              }
            ]
          }
        ]
      };
      
      // Configure mocks
      mockPrismaClient.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaClient.summary.update.mockResolvedValue({});
      
      // Call the function
      await digestService.compileAndSendDigests();
      
      // Should find users with digest preference
      expect(mockPrismaClient.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.any(Object),
          where: expect.objectContaining({
            preferences: expect.objectContaining({
              path: ['emailNotificationPreference']
            })
          })
        })
      );
      
      // Should send email
      expect(require('../index').sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: expect.anything(), // Allow any value for 'to' since we now use an object with email/name
          from: 'digest@tldrsec.com',
          subject: expect.stringContaining('Your Daily SEC Filings Digest'), // Subject now includes date
          metadata: expect.objectContaining({
            type: 'daily-digest',
            userId: 'user-1',
            summaryCount: 1,
            tickerCount: 1
          })
        })
      );
      
      // Should mark summary as sent
      expect(mockPrismaClient.summary.update).toHaveBeenCalledWith({
        where: { id: 'summary-1' },
        data: { sentToUser: true }
      });
    });
  });

  describe('getUsersWithDigestPreference', () => {
    it('should query and format users with daily preference', async () => {
      const mockDbUsers = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          name: 'User One',
          preferences: {
            emailNotificationPreference: NotificationPreference.DAILY,
            watchedTickers: ['AAPL', 'MSFT'],
            watchedFormTypes: ['10-K', '8-K']
          }
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          name: null,
          preferences: {
            emailNotificationPreference: NotificationPreference.DAILY
          }
        }
      ];
      
      mockPrismaClient.user.findMany.mockResolvedValue(mockDbUsers);
      
      // We're testing a private method, so we need to use a bit of a hack to access it
      const result = await (digestService as any).getUsersWithDigestPreference();
      
      expect(result).toEqual([
        {
          userId: 'user-1',
          email: 'user1@example.com',
          name: 'User One',
          emailNotificationPreference: NotificationPreference.DAILY,
          watchedTickers: ['AAPL', 'MSFT'],
          watchedFormTypes: ['10-K', '8-K']
        },
        {
          userId: 'user-2',
          email: 'user2@example.com',
          name: null,
          emailNotificationPreference: NotificationPreference.DAILY,
          watchedTickers: [],
          watchedFormTypes: []
        }
      ]);
    });
  });

  describe('compileUserDigest', () => {
    it('should throw error if user not found', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(null);
      
      await expect((digestService as any).compileUserDigest('non-existent-user'))
        .rejects.toThrow('User non-existent-user not found');
    });
    
    it('should format digest data correctly', async () => {
      // Mock user
      mockPrismaClient.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user1@example.com',
        name: 'User One'
      });
      
      // Mock tickers with summaries
      const mockTickers = [
        {
          id: 'ticker-1',
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          summaries: [
            {
              id: 'summary-1',
              filingType: '10-K',
              filingDate: new Date('2023-01-15'),
              filingUrl: 'https://example.com/filing1.pdf',
              summaryText: 'Annual report summary',
              summaryJSON: { period: 'FY 2022' },
              createdAt: new Date('2023-01-16')
            }
          ]
        },
        {
          id: 'ticker-2',
          symbol: 'MSFT',
          companyName: 'Microsoft Corporation',
          summaries: [] // Empty summaries should be filtered out
        }
      ];
      
      mockPrismaClient.ticker.findMany.mockResolvedValue(mockTickers);
      
      const result = await (digestService as any).compileUserDigest('user-1');
      
      expect(result).toEqual({
        userId: 'user-1',
        email: 'user1@example.com',
        name: 'User One',
        tickerGroups: [
          {
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            summaries: [
              {
                id: 'summary-1',
                filingType: '10-K',
                filingDate: expect.any(Date),
                filingUrl: 'https://example.com/filing1.pdf',
                summaryText: 'Annual report summary',
                summaryJSON: { period: 'FY 2022' },
                createdAt: expect.any(Date)
              }
            ]
          }
        ]
      });
      
      // Should filter out tickers with no summaries
      expect(result.tickerGroups.length).toBe(1);
      expect(result.tickerGroups[0].symbol).toBe('AAPL');
    });
  });

  describe('formatDigestEmail', () => {
    it('should generate both HTML and text versions', () => {
      const digestData = {
        userId: 'user-1',
        email: 'user1@example.com',
        name: 'User One',
        tickerGroups: [
          {
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            summaries: [
              {
                id: 'summary-1',
                filingType: '10-K',
                filingDate: new Date('2023-01-15'),
                filingUrl: 'https://example.com/filing1.pdf',
                summaryText: 'Annual report summary',
                summaryJSON: { 
                  period: 'FY 2022',
                  insights: ['Revenue grew by 10%']
                },
                createdAt: new Date()
              }
            ]
          }
        ]
      };
      
      // Call the function - use any to access private method
      const result = (digestService as any).formatDigestEmail(digestData);
      
      // Check that we get both HTML and text
      expect(result.html).toBeDefined();
      expect(result.text).toBeDefined();
      
      // HTML should contain expected content
      expect(result.html).toContain('Your Daily SEC Filings Digest');
      expect(result.html).toContain('User One');
      expect(result.html).toContain('AAPL');
      expect(result.html).toContain('Apple Inc.');
      expect(result.html).toContain('10-K');
      expect(result.html).toContain('FY 2022');
      expect(result.html).toContain('Revenue grew by 10%');
      
      // Text should contain expected content (note: text is now in uppercase in the template)
      expect(result.text).toContain('DAILY SEC FILINGS DIGEST');
      expect(result.text).toContain('User One');
      expect(result.text).toContain('AAPL - Apple Inc.');
      expect(result.text).toContain('10-K');
      expect(result.text).toContain('FY 2022');
      expect(result.text).toContain('Revenue grew by 10%');
    });
  });

  describe('countSummaries', () => {
    it('should correctly count total summaries', () => {
      const digestData = {
        userId: 'user-1',
        email: 'user1@example.com',
        name: 'User One',
        tickerGroups: [
          {
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            summaries: [
              { id: 's1' } as any,
              { id: 's2' } as any,
            ]
          },
          {
            symbol: 'MSFT',
            companyName: 'Microsoft Corporation',
            summaries: [
              { id: 's3' } as any,
            ]
          },
          {
            symbol: 'GOOG',
            companyName: 'Google Inc.',
            summaries: []
          }
        ]
      };
      
      const count = (digestService as any).countSummaries(digestData);
      expect(count).toBe(3);
    });
  });
}); 