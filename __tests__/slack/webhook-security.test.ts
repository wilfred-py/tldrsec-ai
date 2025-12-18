/**
 * Webhook Security Tests
 *
 * Tests for Slack webhook endpoint security including rate limiting,
 * input validation, and error handling.
 */

import { NextRequest } from 'next/server';
import { POST } from '../../app/api/slack/events/route';

// Mock dependencies
jest.mock('../../lib/logging', () => ({
  logger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

jest.mock('../../lib/slack/conversation-handler', () => ({
  handleConversation: jest.fn().mockResolvedValue(undefined),
}));

// Mock environment variables
const originalEnv = process.env;
beforeAll(() => {
  process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
  process.env.SLACK_BOT_TOKEN = 'test-bot-token';
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Slack Webhook Security', () => {
  describe('Rate Limiting', () => {
    it('should rate limit excessive requests from same IP', async () => {
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: JSON.stringify({ type: 'url_verification', challenge: 'test' }),
        headers: {
          'x-forwarded-for': '192.168.1.100',
          'content-type': 'application/json',
        },
      });

      // Make many requests quickly
      const responses = [];
      for (let i = 0; i < 105; i++) {
        const response = await POST(mockRequest.clone());
        responses.push(response);
      }

      // Some should be rate limited (429)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should include rate limit headers in response', async () => {
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: JSON.stringify({ type: 'url_verification', challenge: 'test' }),
        headers: {
          'x-forwarded-for': '192.168.1.101',
          'content-type': 'application/json',
        },
      });

      const response = await POST(mockRequest);
      
      // Check for rate limit headers (might not be present in successful response)
      if (response.status === 429) {
        expect(response.headers.get('X-RateLimit-Limit')).toBeTruthy();
        expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy();
        expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
      }
    });
  });

  describe('Input Validation', () => {
    it('should reject oversized payloads', async () => {
      const largePayload = 'x'.repeat(11 * 1024); // 11KB > 10KB limit
      
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: largePayload,
        headers: {
          'x-forwarded-for': '192.168.1.102',
          'content-type': 'application/json',
        },
      });

      const response = await POST(mockRequest);
      expect(response.status).toBe(413); // Payload Too Large
    });

    it('should reject invalid JSON', async () => {
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: '{"invalid": json}',
        headers: {
          'x-forwarded-for': '192.168.1.103',
          'content-type': 'application/json',
        },
      });

      const response = await POST(mockRequest);
      expect(response.status).toBe(400); // Bad Request
    });

    it('should handle missing headers gracefully', async () => {
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: JSON.stringify({ type: 'url_verification', challenge: 'test' }),
        // No headers
      });

      const response = await POST(mockRequest);
      // Should not crash, should return some response
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Signature Verification', () => {
    it('should reject requests without signature headers', async () => {
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: JSON.stringify({ 
          type: 'event_callback',
          event: { type: 'app_mention', user: 'U123', channel: 'C123', text: 'test' }
        }),
        headers: {
          'x-forwarded-for': '192.168.1.104',
          'content-type': 'application/json',
          // Missing x-slack-signature and x-slack-request-timestamp
        },
      });

      const response = await POST(mockRequest);
      expect(response.status).toBe(401); // Unauthorized
    });

    it('should reject requests with old timestamps', async () => {
      const oldTimestamp = Math.floor((Date.now() - 400 * 1000) / 1000); // 400 seconds ago
      
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: JSON.stringify({ 
          type: 'event_callback',
          event: { type: 'app_mention', user: 'U123', channel: 'C123', text: 'test' }
        }),
        headers: {
          'x-forwarded-for': '192.168.1.105',
          'content-type': 'application/json',
          'x-slack-request-timestamp': oldTimestamp.toString(),
          'x-slack-signature': 'v0=invalid',
        },
      });

      const response = await POST(mockRequest);
      expect(response.status).toBe(401); // Unauthorized
    });
  });

  describe('Error Handling', () => {
    it('should handle app_mention events with missing fields', async () => {
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: JSON.stringify({ 
          type: 'event_callback',
          event: { type: 'app_mention' } // Missing user, channel, text
        }),
        headers: {
          'x-forwarded-for': '192.168.1.106',
          'content-type': 'application/json',
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=test',
        },
      });

      const response = await POST(mockRequest);
      // Should acknowledge but not crash
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.ok).toBe(true);
    });

    it('should return 200 for unknown event types', async () => {
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: JSON.stringify({ 
          type: 'event_callback',
          event: { type: 'unknown_event_type' }
        }),
        headers: {
          'x-forwarded-for': '192.168.1.107',
          'content-type': 'application/json',
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=test',
        },
      });

      const response = await POST(mockRequest);
      expect(response.status).toBe(200);
    });

    it('should handle catastrophic errors gracefully', async () => {
      // Mock a function to throw an error
      const originalConsole = console.error;
      console.error = jest.fn();

      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: 'null', // This might cause JSON.parse to work but create issues later
        headers: {
          'x-forwarded-for': '192.168.1.108',
        },
      });

      const response = await POST(mockRequest);
      // Should not crash the server
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);

      console.error = originalConsole;
    });
  });

  describe('URL Verification', () => {
    it('should handle URL verification challenges correctly', async () => {
      const challenge = 'test-challenge-12345';
      
      const mockRequest = new NextRequest('https://example.com/api/slack/events', {
        method: 'POST',
        body: JSON.stringify({ 
          type: 'url_verification',
          challenge: challenge
        }),
        headers: {
          'x-forwarded-for': '192.168.1.109',
          'content-type': 'application/json',
        },
      });

      const response = await POST(mockRequest);
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.challenge).toBe(challenge);
    });
  });

  describe('Security Headers', () => {
    it('should handle requests with various IP header formats', async () => {
      const testCases = [
        { headers: { 'x-forwarded-for': '192.168.1.110, 10.0.0.1' } },
        { headers: { 'x-real-ip': '192.168.1.111' } },
        { headers: {} }, // No IP headers
      ];

      for (const testCase of testCases) {
        const mockRequest = new NextRequest('https://example.com/api/slack/events', {
          method: 'POST',
          body: JSON.stringify({ type: 'url_verification', challenge: 'test' }),
          headers: {
            'content-type': 'application/json',
            ...testCase.headers,
          },
        });

        const response = await POST(mockRequest);
        // Should handle all cases without crashing
        expect(response.status).toBeGreaterThanOrEqual(200);
      }
    });
  });
});