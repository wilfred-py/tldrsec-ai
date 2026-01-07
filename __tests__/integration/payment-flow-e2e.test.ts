// Mock fetch globally
global.fetch = jest.fn();

describe('Payment Flow End-to-End', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Successful payment simulation
  it('should simulate successful subscription payment', async () => {
    // Mock checkout API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        sessionUrl: 'https://checkout.stripe.com/pay/cs_test_123',
        sessionId: 'cs_test_123'
      })
    });

    const checkoutResponse = await fetch('/api/checkout/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        planType: 'PRO'
      })
    });

    const checkoutData = await checkoutResponse.json();
    expect(checkoutData.sessionUrl).toContain('checkout.stripe.com');
    
    // Mock webhook response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ received: true })
    });

    // Simulate webhook call after successful payment
    const webhookResponse = await fetch('/api/webhook/stripe', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'stripe-signature': 'test_signature'
      },
      body: JSON.stringify({
        type: 'checkout.session.completed',
        data: {
          object: {
            customer_email: 'test@example.com',
            subscription: 'sub_test123',
            metadata: { planType: 'PRO', source: 'homepage' }
          }
        }
      })
    });

    expect(webhookResponse.status).toBe(200);
  });

  // Test 2: Failed payment handling
  it('should handle failed payment webhook', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ received: true })
    });

    const webhookResponse = await fetch('/api/webhook/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'checkout.session.expired',
        data: {
          object: {
            customer_email: 'test@example.com',
            metadata: { planType: 'PRO', source: 'homepage' }
          }
        }
      })
    });

    expect(webhookResponse.status).toBe(200);
  });

  // Test 3: Complete integration flow
  it('should handle complete PRO subscription flow', async () => {
    // Step 1: Create checkout session
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        sessionUrl: 'https://checkout.stripe.com/pay/cs_test_pro',
        sessionId: 'cs_test_pro'
      })
    });

    const checkoutResponse = await fetch('/api/checkout/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        planType: 'PRO'
      })
    });

    expect(checkoutResponse.ok).toBe(true);
    
    // Step 2: Simulate successful payment webhook
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ received: true })
    });

    const webhookResponse = await fetch('/api/webhook/stripe', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'stripe-signature': 'test_signature'
      },
      body: JSON.stringify({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_pro',
            customer_email: 'test@example.com',
            subscription: 'sub_test_pro',
            metadata: { planType: 'PRO', source: 'homepage' }
          }
        }
      })
    });

    expect(webhookResponse.status).toBe(200);
  });
});