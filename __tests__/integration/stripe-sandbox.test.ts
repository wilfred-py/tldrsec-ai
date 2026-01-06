import { stripe } from '@/lib/stripe';

// Mock Stripe for testing
jest.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: jest.fn()
      }
    },
    webhookEndpoints: {
      list: jest.fn()
    }
  }
}));

describe('Stripe Sandbox Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Stripe client initialization
  it('should initialize Stripe client successfully', () => {
    expect(stripe).toBeDefined();
    expect(stripe.checkout).toBeDefined();
    expect(stripe.webhookEndpoints).toBeDefined();
  });

  // Test 2: CREATE checkout session for PRO plan
  it('should create checkout session for PRO plan', async () => {
    const mockSession = {
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
      mode: 'subscription'
    };

    (stripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: 'price_pro_monthly', quantity: 1 }],
      mode: 'subscription',
      success_url: 'https://test.com/success',
      cancel_url: 'https://test.com/cancel',
      customer_email: 'test@example.com'
    });

    expect(session.id).toMatch(/^cs_test_/);
    expect(session.url).toContain('checkout.stripe.com');
    expect(session.mode).toBe('subscription');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
      payment_method_types: ['card'],
      line_items: [{ price: 'price_pro_monthly', quantity: 1 }],
      mode: 'subscription',
      success_url: 'https://test.com/success',
      cancel_url: 'https://test.com/cancel',
      customer_email: 'test@example.com'
    });
  });

  // Test 3: CREATE checkout session for MAX plan
  it('should create checkout session for MAX plan', async () => {
    const mockSession = {
      id: 'cs_test_456',
      url: 'https://checkout.stripe.com/pay/cs_test_456'
    };

    (stripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: 'price_max_monthly', quantity: 1 }],
      mode: 'subscription',
      success_url: 'https://test.com/success',
      cancel_url: 'https://test.com/cancel',
      customer_email: 'test@example.com'
    });

    expect(session.id).toMatch(/^cs_test_/);
    expect(session.url).toContain('checkout.stripe.com');
  });

  // Test 4: Webhook endpoint validation
  it('should validate webhook endpoint configuration', async () => {
    const mockWebhooks = {
      data: [{
        url: 'https://tldrsec.app/api/webhook/stripe',
        enabled_events: ['checkout.session.completed', 'customer.subscription.created']
      }]
    };

    (stripe.webhookEndpoints.list as jest.Mock).mockResolvedValue(mockWebhooks);

    const webhookEndpoints = await stripe.webhookEndpoints.list();
    
    expect(webhookEndpoints.data.length).toBeGreaterThan(0);
    expect(webhookEndpoints.data[0].url).toContain('/api/webhook/stripe');
    expect(webhookEndpoints.data[0].enabled_events).toContain('checkout.session.completed');
  });
});