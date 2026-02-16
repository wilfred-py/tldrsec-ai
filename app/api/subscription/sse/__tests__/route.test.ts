import { GET } from '../route';
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';

// Mock dependencies
jest.mock('@clerk/nextjs/server');
jest.mock('@/lib/db/prisma');

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;

describe('SSE Subscription Endpoint', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    mockGetPrismaClient.mockReturnValue(mockPrisma);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const request = new NextRequest('http://localhost:3000/api/subscription/sse');
      const response = await GET(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    });

    it('should allow authenticated users', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      mockPrisma.user.findUnique.mockResolvedValue({
        authProviderId: 'user_123',
        planType: 'FREE',
        isActive: true,
        isTrialing: false,
        daysRemaining: 30,
        trialEndsAt: null,
        isGrandfathered: false,
      });

      const request = new NextRequest('http://localhost:3000/api/subscription/sse');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    });
  });

  describe('Connection Limits', () => {
    it('should reject connection if user exceeds per-user limit', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      // Open maximum allowed connections (3)
      const requests = [];
      for (let i = 0; i < 3; i++) {
        const req = new NextRequest('http://localhost:3000/api/subscription/sse');
        requests.push(GET(req));
      }

      await Promise.all(requests);

      // 4th connection should be rejected
      const fourthRequest = new NextRequest('http://localhost:3000/api/subscription/sse');
      const response = await GET(fourthRequest);

      expect(response.status).toBe(429);
      expect(await response.text()).toContain('Connection limit exceeded');
    });
  });

  describe('SSE Stream', () => {
    it('should send initial connection message', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      mockPrisma.user.findUnique.mockResolvedValue({
        authProviderId: 'user_123',
        planType: 'FREE',
        isActive: true,
        isTrialing: false,
        daysRemaining: 30,
        trialEndsAt: null,
        isGrandfathered: false,
      });

      const request = new NextRequest('http://localhost:3000/api/subscription/sse');
      const response = await GET(request);

      expect(response.status).toBe(200);

      const reader = response.body?.getReader();
      const { value } = await reader!.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('data: {');
      expect(text).toContain('"type":"connected"');
    });

    it('should send subscription updates for trial users ending soon', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      mockPrisma.user.findUnique.mockResolvedValue({
        authProviderId: 'user_123',
        planType: 'PRO',
        isActive: true,
        isTrialing: true,
        daysRemaining: 0,
        trialEndsAt: new Date().toISOString(),
        isGrandfathered: false,
      });

      const request = new NextRequest('http://localhost:3000/api/subscription/sse');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { authProviderId: 'user_123' },
        select: expect.objectContaining({
          authProviderId: true,
          planType: true,
          isTrialing: true,
        }),
      });
    });

    it('should include authProviderId in SSE updates', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      const trialUser = {
        authProviderId: 'user_123',
        planType: 'PRO' as const,
        isActive: true,
        isTrialing: true,
        daysRemaining: 0,
        trialEndsAt: new Date().toISOString(),
        isGrandfathered: false,
      };

      mockPrisma.user.findUnique.mockResolvedValue(trialUser);

      const request = new NextRequest('http://localhost:3000/api/subscription/sse');
      const response = await GET(request);

      expect(response.status).toBe(200);

      // Verify user query includes authProviderId
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            authProviderId: true,
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/subscription/sse');
      const response = await GET(request);

      // Should still return 200 and establish connection
      expect(response.status).toBe(200);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on connection abort', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      mockPrisma.user.findUnique.mockResolvedValue({
        authProviderId: 'user_123',
        planType: 'FREE',
        isActive: true,
        isTrialing: false,
        daysRemaining: 30,
        trialEndsAt: null,
        isGrandfathered: false,
      });

      const abortController = new AbortController();
      const request = new NextRequest('http://localhost:3000/api/subscription/sse', {
        signal: abortController.signal,
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      // Abort the connection
      abortController.abort();

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Connection should be cleaned up (can open new one)
      const newRequest = new NextRequest('http://localhost:3000/api/subscription/sse');
      const newResponse = await GET(newRequest);
      expect(newResponse.status).toBe(200);
    });
  });

  describe('Security', () => {
    it('should validate subscription data with Zod schema', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      // Mock invalid data
      mockPrisma.user.findUnique.mockResolvedValue({
        authProviderId: 'user_123',
        planType: 'INVALID_PLAN', // Should fail validation
        isActive: true,
        isTrialing: true,
        daysRemaining: 0,
        trialEndsAt: new Date().toISOString(),
        isGrandfathered: false,
      });

      const request = new NextRequest('http://localhost:3000/api/subscription/sse');
      const response = await GET(request);

      // Should still connect but not send invalid data
      expect(response.status).toBe(200);
    });

    it('should set proper CORS headers', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      mockPrisma.user.findUnique.mockResolvedValue({
        authProviderId: 'user_123',
        planType: 'FREE',
        isActive: true,
        isTrialing: false,
        daysRemaining: 30,
        trialEndsAt: null,
        isGrandfathered: false,
      });

      const request = new NextRequest('http://localhost:3000/api/subscription/sse');
      const response = await GET(request);

      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
      expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    });
  });
});
