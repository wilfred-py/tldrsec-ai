import { NextRequest } from 'next/server';
import { PreferenceService } from '@/lib/user/preference-service';
import { auth } from '@clerk/nextjs/server';
import { NotificationPreference } from '@/lib/email/notification-types';
import { UserPreferences } from '@/lib/user/preference-types';
import { GET, PATCH } from '@/app/api/user/route';
import { getPrismaClient } from '@/lib/db/prisma';

// Mock Clerk auth() — the route now uses auth() not currentUser() so it can
// take the cheap Clerk-id-only path and resolve to the DB user explicitly.
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  currentUser: jest.fn(),
}));

// Mock the PreferenceService
jest.mock('@/lib/user/preference-service', () => ({
  PreferenceService: {
    getUserPreferences: jest.fn(),
    updateUserPreferences: jest.fn()
  }
}));

// Mock prisma — the route now resolves clerkId → DB user.id before calling
// PreferenceService. The existing bug was passing clerkId straight through.
// route.ts caches the client at module load (const prisma = getPrismaClient()),
// so the mock must return a stable singleton whose methods we can re-mock per test.
jest.mock('@/lib/db/prisma', () => {
  const mockPrismaClient = {
    user: { findFirst: jest.fn() },
  };
  return {
    getPrismaClient: () => mockPrismaClient,
    __mockPrismaClient: mockPrismaClient,
  };
});

// Mock the logger
jest.mock('@/lib/logging', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    })
  }
}));

// Mock the monitoring module
jest.mock('@/lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn()
  }
}));

// Stripe / trial imports get pulled in transitively through the route.
// Stub them so the test environment doesn't choke on env vars.
jest.mock('@/lib/stripe', () => ({
  isStripeEnabled: () => false,
  handleStripeError: (e: unknown) => ({ message: String(e), statusCode: 500 }),
  getCustomer: jest.fn(),
  SUBSCRIPTION_PLANS: {},
  getPriceIdForPlan: jest.fn(),
  createBillingPortalSession: jest.fn(),
}));
jest.mock('@/lib/auth/trial-service', () => ({
  TrialService: { checkTrialStatusFromUser: jest.fn() },
}));

class MockNextRequest extends NextRequest {
  private _body: unknown;

  constructor(body: unknown = {}) {
    super(new Request('https://example.com/api/user?type=preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }));
    this._body = body;
  }

  async json() {
    return this._body;
  }
}

describe('User Preferences API', () => {
  // Clerk id ≠ DB id is the realistic case for users created via onboarding,
  // where User.id is a generated UUID and User.authProviderId is the Clerk id.
  // This is the exact mismatch that broke the save flow.
  const clerkId = 'user_2abc123xyz';
  const dbUserId = '550e8400-e29b-41d4-a716-446655440000';

  const mockPreferences: UserPreferences = {
    notifications: {
      emailFrequency: NotificationPreference.DAILY,
      filingTypes: {
        form10K: true,
        form10Q: true,
        form8K: true,
        form4: false,
        otherFilings: {
          formN2: false,
          formNMFP: false,
          formD: false,
          form497: false,
          formSD: false
        }
      },
      contentPreferences: {
        includeSummary: true,
        includeFilingDetails: false,
        includeAnalysis: false
      }
    },
    ui: {
      theme: 'light',
      dashboardLayout: 'compact'
    },
    subscriptions: [
      {
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        overridePreferences: false
      }
    ]
  };

  const mockFindFirst = (getPrismaClient() as unknown as {
    user: { findFirst: jest.Mock };
  }).user.findFirst;

  beforeEach(() => {
    jest.resetAllMocks();
    (auth as unknown as jest.Mock).mockResolvedValue({ userId: clerkId });

    // Default: prisma finds the user by authProviderId, returning the UUID id.
    // This is the realistic onboarded-user case the production bug missed.
    mockFindFirst.mockResolvedValue({ id: dbUserId });

    (PreferenceService.getUserPreferences as jest.Mock).mockResolvedValue(mockPreferences);
    (PreferenceService.updateUserPreferences as jest.Mock).mockResolvedValue({
      success: true,
      message: 'Preferences updated successfully',
      preferences: mockPreferences
    });
  });

  describe('GET /api/user?type=preferences', () => {
    it('resolves Clerk id to DB user id before calling PreferenceService (regression for save-spinner bug)', async () => {
      const request = new NextRequest(new Request('https://example.com/api/user?type=preferences'));

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.preferences).toEqual(mockPreferences);

      // The actual bug: route used to pass Clerk id directly. Now it must
      // resolve via prisma.user.findFirst({ OR: [{id},{authProviderId}] }).
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ id: clerkId }, { authProviderId: clerkId }],
          deletedAt: null,
        },
        select: { id: true },
      });
      // And PreferenceService MUST be called with the DB id, never the Clerk id.
      expect(PreferenceService.getUserPreferences).toHaveBeenCalledWith(dbUserId);
      expect(PreferenceService.getUserPreferences).not.toHaveBeenCalledWith(clerkId);
    });

    it('returns 401 when Clerk auth has no userId', async () => {
      (auth as unknown as jest.Mock).mockResolvedValue({ userId: null });

      const request = new NextRequest(new Request('https://example.com/api/user?type=preferences'));
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(PreferenceService.getUserPreferences).not.toHaveBeenCalled();
    });

    it('returns 404 when Clerk user has no matching DB row yet', async () => {
      mockFindFirst.mockResolvedValue(null);

      const request = new NextRequest(new Request('https://example.com/api/user?type=preferences'));
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.message).toBe('User not found');
      expect(PreferenceService.getUserPreferences).not.toHaveBeenCalled();
    });

    it('surfaces PreferenceService failures as 500', async () => {
      (PreferenceService.getUserPreferences as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest(new Request('https://example.com/api/user?type=preferences'));
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Database error');
    });
  });

  describe('PATCH /api/user?type=preferences', () => {
    it('resolves Clerk id to DB user id before persisting (regression for save-spinner bug)', async () => {
      const updates = { notifications: { emailFrequency: NotificationPreference.IMMEDIATE } };

      const request = new MockNextRequest(updates);
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ id: clerkId }, { authProviderId: clerkId }],
          deletedAt: null,
        },
        select: { id: true },
      });
      // The save must go through the DB id, not the Clerk id. This is the assertion
      // that fails on the broken pre-fix code and proves the regression is fixed.
      expect(PreferenceService.updateUserPreferences).toHaveBeenCalledWith(dbUserId, updates);
      expect(PreferenceService.updateUserPreferences).not.toHaveBeenCalledWith(clerkId, updates);
    });

    it('returns 401 when Clerk auth has no userId', async () => {
      (auth as unknown as jest.Mock).mockResolvedValue({ userId: null });

      const request = new MockNextRequest({});
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(PreferenceService.updateUserPreferences).not.toHaveBeenCalled();
    });

    it('returns 404 when Clerk user has no matching DB row yet', async () => {
      mockFindFirst.mockResolvedValue(null);

      const request = new MockNextRequest({ notifications: { emailFrequency: NotificationPreference.DAILY } });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.message).toBe('User not found');
      expect(PreferenceService.updateUserPreferences).not.toHaveBeenCalled();
    });

    it('returns 400 on invalid JSON body', async () => {
      const request = new NextRequest(new Request('https://example.com/api/user?type=preferences', {
        method: 'PATCH'
      }));
      jest.spyOn(request, 'json').mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Invalid JSON in request body');
    });

    it('forwards PreferenceService validation failures with status 400', async () => {
      (PreferenceService.updateUserPreferences as jest.Mock).mockResolvedValue({
        success: false,
        message: 'Invalid preference format'
      });

      const request = new MockNextRequest({ invalid: 'data' });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Invalid preference format');
    });

    it('filters out soft-deleted users (defense against stale Clerk sessions)', async () => {
      // The real assertion is that `deletedAt: null` is in the where clause —
      // that's what excludes soft-deleted users from findFirst's result set.
      // findFirst returning null is the OBSERVABLE outcome; the where-clause
      // shape is the MECHANISM that produces it.
      mockFindFirst.mockResolvedValue(null);

      const request = new MockNextRequest({ notifications: { emailFrequency: NotificationPreference.DAILY } });
      const response = await PATCH(request);

      expect(response.status).toBe(404);
      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        })
      );
      expect(PreferenceService.updateUserPreferences).not.toHaveBeenCalled();
    });

    it('handles users created via the subscription-checkout path where User.id === Clerk id', async () => {
      // Edge case: handlePostSubscription creates users with id = clerkId.
      // For these users, findFirst should still match (via the first OR branch)
      // and the DB id and Clerk id happen to be equal. PreferenceService
      // gets the Clerk id, but only because that's also the DB id.
      mockFindFirst.mockResolvedValue({ id: clerkId });

      const updates = { notifications: { emailFrequency: NotificationPreference.DAILY } };
      const request = new MockNextRequest(updates);
      const response = await PATCH(request);

      expect(response.status).toBe(200);
      expect(PreferenceService.updateUserPreferences).toHaveBeenCalledWith(clerkId, updates);
    });
  });
});
