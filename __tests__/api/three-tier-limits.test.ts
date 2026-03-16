import { POST } from '@/app/api/user/tickers/route';
import { NextRequest } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';

jest.mock('@clerk/nextjs/server');
jest.mock('@/lib/db/prisma');
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn()
}));

describe('3-Tier Limits - FREE, PRO, MAX', () => {
  let mockPrisma: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock auth functions
    (auth as jest.MockedFunction<typeof auth>).mockResolvedValue({ userId: 'user_123' });
    (currentUser as jest.MockedFunction<typeof currentUser>).mockResolvedValue({
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
      firstName: 'Test',
      lastName: 'User'
    } as any);
    
    // Mock Prisma
    mockPrisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn()
      },
      ticker: {
        create: jest.fn(),
        findFirst: jest.fn()
      }
    };
    
    (getPrismaClient as jest.MockedFunction<typeof getPrismaClient>).mockReturnValue(mockPrisma);
  });

  // Test 1: FREE (Trial) tier is now unlimited — should allow any number of tickers
  it('should allow FREE (Trial) user unlimited tickers', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      subscriptionTier: 'FREE',
      tickers: new Array(100).fill({ symbol: 'TEST' }) // Many tickers
    });

    mockPrisma.ticker.findFirst.mockResolvedValue(null); // No existing ticker
    mockPrisma.ticker.create.mockResolvedValue({
      id: 'ticker_123',
      symbol: 'TSLA',
      companyName: 'Tesla Inc'
    });

    const request = new NextRequest('http://localhost/api/user/tickers', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'TSLA', companyName: 'Tesla Inc' })
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockPrisma.ticker.create).toHaveBeenCalled();
  });

  // Test 2: PRO limit exceeded (EDGE CASE) 
  it('should reject PRO user at 25 ticker limit', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user_123',
      subscriptionTier: 'PRO',
      tickers: new Array(25).fill({ symbol: 'TEST' }) // At PRO limit
    });

    const request = new NextRequest('http://localhost/api/user/tickers', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'TSLA', companyName: 'Tesla Inc' })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.currentTier).toBe('PRO');
    expect(data.maxTickers).toBe(25);
  });

  // Test 3: MAX tier unlimited (EDGE CASE - should never limit)
  it('should allow MAX user unlimited tickers', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user_123',
      subscriptionTier: 'MAX',
      tickers: new Array(1000).fill({ symbol: 'TEST' }) // Way over other limits
    });
    
    mockPrisma.ticker.findFirst.mockResolvedValue(null); // No existing ticker
    mockPrisma.ticker.create.mockResolvedValue({
      id: 'ticker_123',
      symbol: 'TSLA',
      companyName: 'Tesla Inc'
    });

    const request = new NextRequest('http://localhost/api/user/tickers', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'TSLA', companyName: 'Tesla Inc' })
    });

    const response = await POST(request);
    
    expect(response.status).toBe(200);
    expect(mockPrisma.ticker.create).toHaveBeenCalled();
  });

  // Test 4: Under limit success (HAPPY PATH)
  it('should allow ticker addition for FREE (unlimited) user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user_123',
      subscriptionTier: 'FREE',
      tickers: new Array(2).fill({ symbol: 'TEST' })
    });
    
    mockPrisma.ticker.findFirst.mockResolvedValue(null); // No existing ticker
    mockPrisma.ticker.create.mockResolvedValue({
      id: 'ticker_123',
      symbol: 'TSLA',
      companyName: 'Tesla Inc'
    });

    const request = new NextRequest('http://localhost/api/user/tickers', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'TSLA', companyName: 'Tesla Inc' })
    });

    const response = await POST(request);
    
    expect(response.status).toBe(200);
    expect(mockPrisma.ticker.create).toHaveBeenCalled();
  });
});