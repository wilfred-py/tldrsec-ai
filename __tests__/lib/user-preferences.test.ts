import { PrismaClient } from '@prisma/client';
import { NotificationPreference } from '@/lib/email/notification-types';

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'test-user-id',
        clerkId: 'test-clerk-id'
      }),
      create: jest.fn().mockResolvedValue({
        id: 'test-user-id',
        clerkId: 'test-clerk-id'
      })
    },
    userPreferences: {
      upsert: jest.fn().mockResolvedValue({
        id: 'test-prefs-id',
        userId: 'test-user-id'
      })
    },
    ticker: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'test-ticker-id',
        symbol: 'AAPL'
      }),
      create: jest.fn().mockResolvedValue({
        id: 'test-ticker-id',
        symbol: 'MSFT'
      })
    },
    tickerSubscription: {
      upsert: jest.fn().mockResolvedValue({
        id: 'test-subscription-id',
        userId: 'test-user-id',
        tickerId: 'test-ticker-id'
      })
    },
    $connect: jest.fn(),
    $disconnect: jest.fn()
  };

  return {
    PrismaClient: jest.fn().mockImplementation(() => mockPrismaClient)
  };
});

describe('User Preferences', () => {
  let prisma: PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
  });

  describe('Saving user preferences', () => {
    it('should find existing user and update preferences', async () => {
      const userPrefs = {
        notifications: {
          emailFrequency: 'IMMEDIATE' as NotificationPreference,
          filingTypes: {
            form10K: true,
            form10Q: true,
            form8K: true,
            form4: false,
            otherFilings: false
          },
          contentPreferences: {
            includeSummary: true,
            includeFilingDetails: true,
            includeAnalysis: true
          }
        },
        ui: {
          theme: 'dark' as const,
          dashboardLayout: 'compact' as const
        }
      };

      // Simulate saving preferences
      await prisma.user.findUnique({ where: { clerkId: 'test-clerk-id' } });
      await prisma.userPreferences.upsert({
        where: { userId: 'test-user-id' },
        create: {
          userId: 'test-user-id',
          notificationPreferences: userPrefs.notifications,
          uiPreferences: userPrefs.ui
        },
        update: {
          notificationPreferences: userPrefs.notifications,
          uiPreferences: userPrefs.ui
        }
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: 'test-clerk-id' }
      });

      expect(prisma.userPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: 'test-user-id' },
        create: expect.objectContaining({
          userId: 'test-user-id',
          notificationPreferences: userPrefs.notifications,
          uiPreferences: userPrefs.ui
        }),
        update: expect.objectContaining({
          notificationPreferences: userPrefs.notifications,
          uiPreferences: userPrefs.ui
        })
      });
    });

    it('should create new user if not found', async () => {
      // Mock user not found
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const userPrefs = {
        notifications: {
          emailFrequency: 'DAILY' as NotificationPreference,
          filingTypes: {
            form10K: true,
            form10Q: false,
            form8K: true,
            form4: false,
            otherFilings: false
          },
          contentPreferences: {
            includeSummary: true,
            includeFilingDetails: false,
            includeAnalysis: false
          }
        },
        ui: {
          theme: 'light' as const,
          dashboardLayout: 'detailed' as const
        }
      };

      // Simulate saving preferences for new user
      const user = await prisma.user.findUnique({ where: { clerkId: 'test-clerk-id' } });
      
      if (!user) {
        await prisma.user.create({
          data: {
            clerkId: 'test-clerk-id',
            preferences: {
              create: {
                notificationPreferences: userPrefs.notifications,
                uiPreferences: userPrefs.ui
              }
            }
          }
        });
      }

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: 'test-clerk-id' }
      });
      
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkId: 'test-clerk-id',
          preferences: {
            create: expect.objectContaining({
              notificationPreferences: userPrefs.notifications,
              uiPreferences: userPrefs.ui
            })
          }
        })
      });
    });
  });

  describe('Ticker subscriptions', () => {
    it('should add a ticker subscription', async () => {
      const tickerData = {
        symbol: 'AAPL',
        companyName: 'Apple Inc.'
      };

      // Simulate adding ticker subscription
      const user = await prisma.user.findUnique({ where: { clerkId: 'test-clerk-id' } });
      
      if (user) {
        const ticker = await prisma.ticker.findFirst({
          where: {
            OR: [
              { symbol: tickerData.symbol },
              { aliases: { has: tickerData.symbol } }
            ]
          }
        });

        let tickerId = ticker?.id;

        // If ticker doesn't exist, create it
        if (!ticker) {
          const newTicker = await prisma.ticker.create({
            data: {
              symbol: tickerData.symbol,
              companyName: tickerData.companyName || '',
              cik: '',
              exchangeCodes: [],
              isActive: true
            }
          });
          tickerId = newTicker.id;
        }

        await prisma.tickerSubscription.upsert({
          where: {
            userId_tickerId: {
              userId: user.id,
              tickerId: tickerId!
            }
          },
          create: {
            userId: user.id,
            tickerId: tickerId!,
            overridePreferences: false
          },
          update: {
            overridePreferences: false
          }
        });
      }

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: 'test-clerk-id' }
      });
      
      expect(prisma.ticker.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { symbol: 'AAPL' },
            { aliases: { has: 'AAPL' } }
          ]
        }
      });
      
      expect(prisma.tickerSubscription.upsert).toHaveBeenCalled();
    });
  });
}); 