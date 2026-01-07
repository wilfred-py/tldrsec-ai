import { POST } from '@/app/api/checkout/direct/route';
import { NextRequest } from 'next/server';

// Mock Stripe
jest.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/pay/cs_test_123'
        })
      }
    }
  },
  SUBSCRIPTION_PLANS: {
    FREE: {
      name: 'Free',
      monthlyPriceId: null,
      tickerLimit: 3
    },
    PRO: {
      name: 'Pro',
      monthlyPriceId: 'price_pro_monthly',
      tickerLimit: 25
    },
    MAX: {
      name: 'Max',
      monthlyPriceId: 'price_max_monthly', 
      tickerLimit: -1
    }
  }
}));

// Mock Clerk
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  clerkClient: {
    users: {
      createUser: jest.fn().mockResolvedValue({
        id: 'user_test_123',
        emailAddresses: [{ emailAddress: 'test@example.com' }]
      })
    }
  }
}));

describe('/api/checkout/direct - 3-Tier Edge Cases First', () => {
  // Test 1: Invalid email validation (EDGE CASE)
  it('should reject invalid email addresses with 400 error', async () => {
    const request = new NextRequest('http://localhost/api/checkout/direct', {
      method: 'POST',
      body: JSON.stringify({
        email: 'invalid-email',
        planType: 'PRO'
      })
    });

    const response = await POST(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid email');
  });

  // Test 2: Invalid plan type (EDGE CASE)
  it('should reject invalid plan types with 400 error', async () => {
    const request = new NextRequest('http://localhost/api/checkout/direct', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        planType: 'INVALID'
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  // Test 3: Missing required fields (EDGE CASE)
  it('should reject requests missing required fields', async () => {
    const request = new NextRequest('http://localhost/api/checkout/direct', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  // Test 4: MAX plan type validation (EDGE CASE)
  it('should accept MAX as valid plan type', async () => {
    const request = new NextRequest('http://localhost/api/checkout/direct', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        planType: 'MAX'
      })
    });

    const response = await POST(request);
    // Should not fail validation (will fail for other reasons initially)
    expect(response.status).not.toBe(400);
  });
});

describe('/api/checkout/direct - 3-Tier Happy Path', () => {
  // Test 5: FREE plan success
  it('should handle FREE plan with immediate redirect', async () => {
    const request = new NextRequest('http://localhost/api/checkout/direct', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        planType: 'FREE'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.redirectUrl).toBe('/onboarding');
    expect(data.planType).toBe('FREE');
  });

  // Test 6: PRO plan checkout session
  it('should create Stripe checkout session for PRO plan', async () => {
    const request = new NextRequest('http://localhost/api/checkout/direct', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        planType: 'PRO'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionUrl).toContain('checkout.stripe.com');
    expect(data.sessionId).toMatch(/^cs_/);
  });

  // Test 7: MAX plan checkout session
  it('should create Stripe checkout session for MAX plan', async () => {
    const request = new NextRequest('http://localhost/api/checkout/direct', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        planType: 'MAX'
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionUrl).toContain('checkout.stripe.com');
    expect(data.sessionId).toMatch(/^cs_/);
  });
});