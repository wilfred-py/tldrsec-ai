/**
 * Tests for POST /api/onboarding/check-email
 * Checks if email already exists (user account or pending onboarding)
 */

import { POST } from '@/app/api/onboarding/check-email/route';
import { NextRequest } from 'next/server';

// Mock Prisma client
const mockUserFindUnique = jest.fn();
const mockPendingOnboardingFindUnique = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: mockUserFindUnique,
    },
    pendingOnboarding: {
      findUnique: mockPendingOnboardingFindUnique,
    },
  }),
}));

describe('POST /api/onboarding/check-email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no user and no pending onboarding found
    mockUserFindUnique.mockResolvedValue(null);
    mockPendingOnboardingFindUnique.mockResolvedValue(null);
  });

  it('should return NEW_USER for non-existent email', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('NEW_USER');
    expect(data.canProceed).toBe(true);
  });

  it('should return EXISTING_USER for email with completed onboarding', async () => {
    // Mock user with onboardingCompleted: true
    mockUserFindUnique.mockResolvedValue({
      onboardingCompleted: true,
      _count: { tickers: 5 }
    });

    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'existing@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('EXISTING_USER');
    expect(data.canProceed).toBe(false);
    expect(data.message).toContain('already have an account');
    expect(data.existingTickerCount).toBe(5);
  });

  it('should return INCOMPLETE_USER for email with incomplete onboarding', async () => {
    // Mock user with onboardingCompleted: false
    mockUserFindUnique.mockResolvedValue({
      onboardingCompleted: false,
      _count: { tickers: 2 }
    });

    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'incomplete@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('INCOMPLETE_USER');
    expect(data.canProceed).toBe(false);
    expect(data.message).toContain('pending account');
    expect(data.existingTickerCount).toBe(2);
  });

  it('should return PENDING_ONBOARDING for email with existing pending record', async () => {
    // No user but has pending onboarding
    mockPendingOnboardingFindUnique.mockResolvedValue({
      id: 'pending-123',
      email: 'pending@example.com',
      sectors: ['technology'],
      tickers: JSON.stringify([{ symbol: 'AAPL', companyName: 'Apple' }]),
    });

    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'pending@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('PENDING_ONBOARDING');
    expect(data.canProceed).toBe(true);
    expect(data.message).toContain('Resuming');
  });

  it('should return 400 for missing email', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('should return 400 for invalid email format', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'notanemail' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('should return 400 for email without TLD', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@domain' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('should normalize email to lowercase', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'Test@Example.COM' }),
    });

    await POST(request);

    // Verify the email was normalized when querying
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      select: {
        onboardingCompleted: true,
        _count: { select: { tickers: true } }
      }
    });
  });

  it('should handle database errors gracefully', async () => {
    mockUserFindUnique.mockRejectedValue(new Error('Database connection failed'));

    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});
