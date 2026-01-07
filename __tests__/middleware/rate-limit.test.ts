import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    // Clear cache before each test
    jest.clearAllMocks();
  });

  it('should allow requests under rate limit', async () => {
    const middleware = rateLimit(rateLimitConfigs.checkout);
    const mockHandler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
    
    const request = new NextRequest('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    const response = await middleware(request, mockHandler);
    
    expect(response.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledWith(request);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
  });

  it('should block requests that exceed rate limit', async () => {
    const middleware = rateLimit({
      interval: 60 * 1000, // 1 minute
      uniqueTokenPerInterval: 500,
      max: 2, // Very low limit for testing
    });
    
    const mockHandler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
    
    const request = new NextRequest('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.2' },
    });

    // First two requests should succeed
    await middleware(request, mockHandler);
    await middleware(request, mockHandler);
    
    // Third request should be rate limited
    const response = await middleware(request, mockHandler);
    const data = await response.json();
    
    expect(response.status).toBe(429);
    expect(data.error).toBe('Rate limit exceeded. Please try again later.');
    expect(data.retryAfter).toBeGreaterThan(0);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('should use different rate limits for different IPs', async () => {
    const middleware = rateLimit({
      interval: 60 * 1000,
      uniqueTokenPerInterval: 500,
      max: 1,
    });
    
    const mockHandler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
    
    const request1 = new NextRequest('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.3' },
    });
    
    const request2 = new NextRequest('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.4' },
    });

    // Both IPs should be able to make one request
    const response1 = await middleware(request1, mockHandler);
    const response2 = await middleware(request2, mockHandler);
    
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(2);
  });

  it('should handle requests without IP headers', async () => {
    const middleware = rateLimit(rateLimitConfigs.checkout);
    const mockHandler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
    
    const request = new NextRequest('http://localhost:3000/api/checkout', {
      method: 'POST',
      // No IP headers
    });

    const response = await middleware(request, mockHandler);
    
    expect(response.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledWith(request);
  });

  it('should reset rate limit after time window', async () => {
    // Note: This test would need timer mocking to work properly in real scenarios
    // For now, we'll test the logic without actual time passage
    const middleware = rateLimit({
      interval: 1, // 1ms for testing
      uniqueTokenPerInterval: 500,
      max: 1,
    });
    
    const mockHandler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
    
    const request = new NextRequest('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.5' },
    });

    // First request should succeed
    const response1 = await middleware(request, mockHandler);
    expect(response1.status).toBe(200);
    
    // Wait for window to expire (in real scenario)
    await new Promise(resolve => setTimeout(resolve, 5));
    
    // Second request should also succeed after window reset
    const response2 = await middleware(request, mockHandler);
    expect(response2.status).toBe(200);
  });

  it('should include correct headers in rate limited response', async () => {
    const config = {
      interval: 60 * 1000,
      uniqueTokenPerInterval: 500,
      max: 1,
    };
    
    const middleware = rateLimit(config);
    const mockHandler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
    
    const request = new NextRequest('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.6' },
    });

    // First request to exhaust limit
    await middleware(request, mockHandler);
    
    // Second request should be rate limited
    const response = await middleware(request, mockHandler);
    
    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('1');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });
});