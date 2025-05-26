import { saveUserPreferences, addTickerSubscription } from '../../../../app/(auth)/onboarding/actions';
import { prisma } from '@/lib/db/prisma';

// Mock prisma
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      update: jest.fn().mockResolvedValue({ id: 'user-1' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    watchlist: {
      create: jest.fn().mockResolvedValue({ id: 'watchlist-1' }),
    },
  },
}));

// Mock toast notifications
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Onboarding Flow Server Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveUserPreferences', () => {
    it('should successfully save user preferences', async () => {
      const result = await saveUserPreferences({
        userId: 'user-1',
        fullName: 'John Doe',
        jobTitle: 'Software Engineer',
        company: 'Acme Corp',
        bio: 'I am a software engineer interested in SEC filings',
        uiPreferences: {
          theme: 'dark',
          dashboardLayout: 'compact',
        },
        emailFrequency: 'IMMEDIATE',
        filingTypes: {
          form10K: true,
          form10Q: true,
          form8K: true,
          form4: false,
        },
        contentPreferences: {
          includeSummary: true,
          includeRiskFactors: true,
          includeFinancials: true,
        },
      });

      expect(result).toEqual({ success: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          fullName: 'John Doe',
          jobTitle: 'Software Engineer',
          company: 'Acme Corp',
          bio: 'I am a software engineer interested in SEC filings',
          uiPreferences: {
            theme: 'dark',
            dashboardLayout: 'compact',
          },
          emailFrequency: 'IMMEDIATE',
          filingTypePreferences: {
            form10K: true,
            form10Q: true,
            form8K: true,
            form4: false,
          },
          contentPreferences: {
            includeSummary: true,
            includeRiskFactors: true,
            includeFinancials: true,
          },
          onboardingCompleted: true,
        }),
      });
    });

    it('should return error when user update fails', async () => {
      (prisma.user.update as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const result = await saveUserPreferences({
        userId: 'user-1',
        fullName: 'John Doe',
        jobTitle: 'Software Engineer',
        company: 'Acme Corp',
        bio: 'I am a software engineer interested in SEC filings',
        uiPreferences: {
          theme: 'dark',
          dashboardLayout: 'compact',
        },
        emailFrequency: 'IMMEDIATE',
        filingTypes: {
          form10K: true,
          form10Q: true,
          form8K: true,
          form4: false,
        },
        contentPreferences: {
          includeSummary: true,
          includeRiskFactors: true,
          includeFinancials: true,
        },
      });

      expect(result).toEqual({
        success: false,
        error: 'Failed to save user preferences. Database error',
      });
    });
  });

  describe('addTickerSubscription', () => {
    it('should successfully add a ticker subscription', async () => {
      const result = await addTickerSubscription({
        userId: 'user-1',
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
      });

      expect(result).toEqual({ success: true });
      expect(prisma.watchlist.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
        },
      });
    });

    it('should return error when ticker addition fails', async () => {
      (prisma.watchlist.create as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const result = await addTickerSubscription({
        userId: 'user-1',
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
      });

      expect(result).toEqual({
        success: false,
        error: 'Failed to add ticker. Database error',
      });
    });
  });

  describe('End-to-End Onboarding Flow', () => {
    it('should allow a user to complete the full onboarding process', async () => {
      // Step 1: Save user preferences
      const preferencesResult = await saveUserPreferences({
        userId: 'user-1',
        fullName: 'John Doe',
        jobTitle: 'Software Engineer',
        company: 'Acme Corp',
        bio: 'I am a software engineer',
        uiPreferences: { theme: 'dark', dashboardLayout: 'compact' },
        emailFrequency: 'IMMEDIATE',
        filingTypes: { form10K: true, form10Q: true, form8K: true, form4: false },
        contentPreferences: { includeSummary: true, includeRiskFactors: true, includeFinancials: true },
      });
      
      expect(preferencesResult.success).toBe(true);
      
      // Step 2: Add ticker subscriptions
      const ticker1Result = await addTickerSubscription({
        userId: 'user-1',
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
      });
      
      expect(ticker1Result.success).toBe(true);
      
      const ticker2Result = await addTickerSubscription({
        userId: 'user-1',
        symbol: 'MSFT',
        companyName: 'Microsoft Corporation',
      });
      
      expect(ticker2Result.success).toBe(true);
      
      // Verify all necessary calls were made
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.watchlist.create).toHaveBeenCalledTimes(2);
    });
  });
}); 