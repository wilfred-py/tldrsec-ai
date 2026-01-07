import { POST } from '@/app/api/webhooks/stripe/route';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

// Mock dependencies
jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    securityAuditLog: {
      create: jest.fn(),
    },
  })),
}));

jest.mock('@/lib/audit/payment-logger', () => ({
  PaymentLogger: {
    webhookReceived: jest.fn(),
  },
}));

// Mock Stripe
const mockStripe = {
  webhooks: {
    constructEvent: jest.fn(),
  },
  subscriptions: {
    retrieve: jest.fn(),
  },
} as unknown as Stripe;

jest.mock('stripe', () => {
  return jest.fn(() => mockStripe);
});

describe('/api/webhooks/stripe', () => {
  const originalEnv = process.env;
  const mockPrisma = require('@/lib/db/prisma').getPrismaClient();

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      STRIPE_PRICE_ID_PRO: 'price_pro_123',
      STRIPE_PRICE_ID_MAX: 'price_max_123',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject requests without stripe signature', async () => {
    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ test: 'data' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing signature');
  });

  it('should reject requests with invalid stripe signature', async () => {
    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ test: 'data' }),
      headers: {
        'stripe-signature': 'invalid_signature',
      },
    });

    // Mock constructEvent to throw error
    (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid signature');
  });

  it('should handle checkout.session.completed webhook', async () => {
    const webhookEvent = {
      id: 'evt_123',
      type: 'checkout.session.completed',
      created: Date.now() / 1000,
      data: {
        object: {
          customer_email: 'test@example.com',
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    };

    const mockSubscription = {
      items: {
        data: [{
          price: {
            id: 'price_pro_123',
          },
        }],
      },
    };

    const mockUser = {
      id: 'user_123',
      email: 'test@example.com',
    };

    // Mock successful webhook verification
    (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(webhookEvent);
    (mockStripe.subscriptions.retrieve as jest.Mock).mockResolvedValue(mockSubscription);
    mockPrisma().user.findUnique.mockResolvedValue(mockUser);
    mockPrisma().user.update.mockResolvedValue({ ...mockUser, subscriptionTier: 'PRO' });

    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify(webhookEvent),
      headers: {
        'stripe-signature': 'valid_signature',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
    expect(mockPrisma().user.update).toHaveBeenCalledWith({
      where: { id: 'user_123' },
      data: {
        subscriptionTier: 'PRO',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      },
    });
  });

  it('should handle customer.subscription.updated webhook', async () => {
    const webhookEvent = {
      id: 'evt_456',
      type: 'customer.subscription.updated',
      created: Date.now() / 1000,
      data: {
        object: {
          id: 'sub_123',
          items: {
            data: [{
              price: {
                id: 'price_max_123',
              },
            }],
          },
        },
      },
    };

    const mockUser = {
      id: 'user_123',
      stripeSubscriptionId: 'sub_123',
    };

    (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(webhookEvent);
    mockPrisma().user.findUnique.mockResolvedValue(mockUser);
    mockPrisma().user.update.mockResolvedValue({ ...mockUser, subscriptionTier: 'MAX' });

    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify(webhookEvent),
      headers: {
        'stripe-signature': 'valid_signature',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockPrisma().user.update).toHaveBeenCalledWith({
      where: { id: 'user_123' },
      data: { subscriptionTier: 'MAX' },
    });
  });

  it('should handle customer.subscription.deleted webhook', async () => {
    const webhookEvent = {
      id: 'evt_789',
      type: 'customer.subscription.deleted',
      created: Date.now() / 1000,
      data: {
        object: {
          id: 'sub_123',
        },
      },
    };

    const mockUser = {
      id: 'user_123',
      stripeSubscriptionId: 'sub_123',
    };

    (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(webhookEvent);
    mockPrisma().user.findUnique.mockResolvedValue(mockUser);
    mockPrisma().user.update.mockResolvedValue({ ...mockUser, subscriptionTier: 'FREE' });

    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify(webhookEvent),
      headers: {
        'stripe-signature': 'valid_signature',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockPrisma().user.update).toHaveBeenCalledWith({
      where: { id: 'user_123' },
      data: {
        subscriptionTier: 'FREE',
        stripeSubscriptionId: null,
      },
    });
  });

  it('should handle invoice.payment_failed webhook', async () => {
    const webhookEvent = {
      id: 'evt_payment_failed',
      type: 'invoice.payment_failed',
      created: Date.now() / 1000,
      data: {
        object: {
          id: 'in_123',
          customer: 'cus_123',
          amount_due: 19900, // $199.00
          attempt_count: 2,
        },
      },
    };

    (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(webhookEvent);

    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify(webhookEvent),
      headers: {
        'stripe-signature': 'valid_signature',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    // Should log payment failure but not update database
  });

  it('should handle unknown webhook events gracefully', async () => {
    const webhookEvent = {
      id: 'evt_unknown',
      type: 'unknown.event.type',
      created: Date.now() / 1000,
      data: {
        object: {
          id: 'unknown_123',
        },
      },
    };

    (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(webhookEvent);

    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify(webhookEvent),
      headers: {
        'stripe-signature': 'valid_signature',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
  });

  it('should handle database errors gracefully', async () => {
    const webhookEvent = {
      id: 'evt_db_error',
      type: 'checkout.session.completed',
      created: Date.now() / 1000,
      data: {
        object: {
          customer_email: 'test@example.com',
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    };

    (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(webhookEvent);
    mockPrisma().user.findUnique.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify(webhookEvent),
      headers: {
        'stripe-signature': 'valid_signature',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });
});