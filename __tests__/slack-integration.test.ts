/**
 * Comprehensive Slack Integration Tests
 * 
 * Tests for security vulnerabilities, edge cases, and error scenarios
 * as identified in the code review process.
 */

import { NextRequest } from 'next/server';
import { POST as slackEventsHandler } from '../app/api/slack/events/route';
import crypto from 'crypto';

// Mock the logger
jest.mock('../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Mock the conversation handler
jest.mock('../lib/slack/conversation-handler', () => ({
  handleConversation: jest.fn().mockResolvedValue(undefined),
}));

// Mock rate limiter
jest.mock('../lib/slack/rate-limiter', () => ({
  checkRateLimit: jest.fn(() => ({ allowed: true, resetTime: Date.now() + 60000 })),
  getRateLimitHeaders: jest.fn(() => ({ 'X-RateLimit-Remaining': '99' })),
}));

// Mock input validation
jest.mock('../lib/slack/input-validation', () => ({
  validateSlackPayload: jest.fn((payload) => ({ valid: true, sanitized: payload })),
  validatePayloadComplexity: jest.fn(() => ({ valid: true })),
  detectSuspiciousPatterns: jest.fn(() => []),
}));

describe('Slack Integration Security Tests', () => {
  const SLACK_SIGNING_SECRET = 'test_signing_secret';
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      SLACK_SIGNING_SECRET,
      SLACK_BOT_TOKEN: 'xoxb-test-token',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Webhook Signature Validation', () => {
    function createSignedRequest(body: any, secret: string = SLACK_SIGNING_SECRET): NextRequest {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyString = JSON.stringify(body);
      const baseString = `v0:${timestamp}:${bodyString}`;
      const signature = 'v0=' + crypto.createHmac('sha256', secret).update(baseString).digest('hex');

      return new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        body: bodyString,
      });
    }

    test('should reject requests without signature headers', async () => {
      const request = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        body: JSON.stringify({ type: 'event_callback', event: { type: 'app_mention' } }),
      });

      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid signature');
    });

    test('should reject requests with invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const request = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': 'v0=invalid_signature',
        },
        body: JSON.stringify({ type: 'event_callback', event: { type: 'app_mention' } }),
      });

      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid signature');
    });

    test('should reject requests with expired timestamp', async () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 seconds old
      const bodyString = JSON.stringify({ type: 'event_callback', event: { type: 'app_mention' } });
      const baseString = `v0:${oldTimestamp}:${bodyString}`;
      const signature = 'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(baseString).digest('hex');

      const request = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': oldTimestamp,
          'x-slack-signature': signature,
        },
        body: bodyString,
      });

      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid signature');
    });

    test('should handle timing attack attempts with constant-time comparison', async () => {
      // Test that signature comparison uses timing-safe comparison
      // This test verifies the code uses crypto.timingSafeEqual
      const request = createSignedRequest(
        { type: 'event_callback', event: { type: 'app_mention', user: 'U123', channel: 'C123', text: 'test' } },
        'wrong_secret'
      );

      const response = await slackEventsHandler(request);
      expect(response.status).toBe(401);
      
      // Verify timing-safe comparison is used (implementation check)
      const cryptoSpy = jest.spyOn(crypto, 'timingSafeEqual');
      await slackEventsHandler(request);
      expect(cryptoSpy).toHaveBeenCalled();
    });

    test('should handle signature with different lengths gracefully', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const request = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': 'v0=short', // Too short signature
        },
        body: JSON.stringify({ type: 'event_callback', event: { type: 'app_mention' } }),
      });

      const response = await slackEventsHandler(request);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Invalid signature' });
    });
  });

  describe('Malformed Payload Handling', () => {
    test('should reject invalid JSON payload', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const invalidBody = '{invalid json}';
      const baseString = `v0:${timestamp}:${invalidBody}`;
      const signature = 'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(baseString).digest('hex');

      const request = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        body: invalidBody,
      });

      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON payload');
    });

    test('should reject oversized payloads', async () => {
      const largePayload = { 
        type: 'event_callback', 
        event: { 
          type: 'app_mention',
          text: 'x'.repeat(11 * 1024) // Over 10KB limit
        } 
      };
      
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyString = JSON.stringify(largePayload);
      const baseString = `v0:${timestamp}:${bodyString}`;
      const signature = 'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(baseString).digest('hex');

      const request = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        body: bodyString,
      });

      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(413);
      expect(data.error).toBe('Request body too large');
    });

    test('should handle missing required fields in app_mention event', async () => {
      const incompleteEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          // Missing user, channel, and text fields
        }
      };

      const request = createSignedRequest(incompleteEvent);
      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      // Should acknowledge but ignore
      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    test('should handle events with missing type field', async () => {
      const malformedEvent = {
        type: 'event_callback',
        event: {
          // Missing type field
          user: 'U123',
          channel: 'C123',
          text: 'test'
        }
      };

      const request = createSignedRequest(malformedEvent);
      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      // Should acknowledge but ignore
      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    test('should handle deeply nested malicious payloads', async () => {
      const validatePayloadComplexity = require('../lib/slack/input-validation').validatePayloadComplexity;
      validatePayloadComplexity.mockReturnValueOnce({ 
        valid: false, 
        errors: ['Payload nesting too deep'] 
      });

      const nestedPayload = {
        type: 'event_callback',
        event: { type: 'app_mention', user: 'U123', channel: 'C123', text: 'test' }
      };

      const request = createSignedRequest(nestedPayload);
      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Payload too complex');
    });
  });

  describe('Database Connection Failures', () => {
    test('should handle database connection failure gracefully', async () => {
      const handleConversation = require('../lib/slack/conversation-handler').handleConversation;
      handleConversation.mockRejectedValueOnce(new Error('Database connection failed: ECONNREFUSED'));

      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: '@bot status'
        }
      };

      const request = createSignedRequest(validEvent);
      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      // Should still acknowledge to prevent Slack retries
      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      
      // Verify error was caught and logged
      expect(handleConversation).toHaveBeenCalled();
    });

    test('should handle database timeout during metrics calculation', async () => {
      const handleConversation = require('../lib/slack/conversation-handler').handleConversation;
      handleConversation.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Query timeout after 30000ms')), 100);
        });
      });

      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: '@bot daily report'
        }
      };

      const request = createSignedRequest(validEvent);
      const response = await slackEventsHandler(request);
      
      // Should acknowledge immediately
      expect(response.status).toBe(200);
      
      // Wait for async error to be caught
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(handleConversation).toHaveBeenCalled();
    });

    test('should handle connection pool exhaustion', async () => {
      const handleConversation = require('../lib/slack/conversation-handler').handleConversation;
      handleConversation.mockRejectedValueOnce(new Error('Connection pool timeout. No available connections.'));

      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: '@bot status'
        }
      };

      const request = createSignedRequest(validEvent);
      const response = await slackEventsHandler(request);
      
      expect(response.status).toBe(200);
      expect(handleConversation).toHaveBeenCalled();
    });
  });

  describe('XSS and Input Sanitization', () => {
    test('should sanitize XSS attempts in event text', async () => {
      const detectSuspiciousPatterns = require('../lib/slack/input-validation').detectSuspiciousPatterns;
      detectSuspiciousPatterns.mockReturnValueOnce(['XSS attempt detected']);

      const xssEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: '<script>alert("XSS")</script>'
        }
      };

      const request = createSignedRequest(xssEvent);
      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Message contains invalid content');
    });

    test('should detect SQL injection attempts in text', async () => {
      const detectSuspiciousPatterns = require('../lib/slack/input-validation').detectSuspiciousPatterns;
      detectSuspiciousPatterns.mockReturnValueOnce(['SQL injection pattern detected']);

      const sqlInjectionEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: "'; DROP TABLE users; --"
        }
      };

      const request = createSignedRequest(sqlInjectionEvent);
      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Message contains invalid content');
    });

    test('should handle command injection attempts', async () => {
      const detectSuspiciousPatterns = require('../lib/slack/input-validation').detectSuspiciousPatterns;
      detectSuspiciousPatterns.mockReturnValueOnce(['Command injection detected']);

      const commandInjectionEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: '$(rm -rf /)'
        }
      };

      const request = createSignedRequest(commandInjectionEvent);
      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Message contains invalid content');
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits on webhook endpoint', async () => {
      const checkRateLimit = require('../lib/slack/rate-limiter').checkRateLimit;
      checkRateLimit.mockReturnValueOnce({ 
        allowed: false, 
        resetTime: Date.now() + 60000 
      });

      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: 'test'
        }
      };

      const request = createSignedRequest(validEvent);
      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(429);
      expect(data.error).toBe('Rate limit exceeded. Please try again later.');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    });

    test('should track rate limits by IP address', async () => {
      const checkRateLimit = require('../lib/slack/rate-limiter').checkRateLimit;
      checkRateLimit.mockClear();
      checkRateLimit.mockReturnValue({ allowed: true, resetTime: Date.now() + 60000 });

      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: 'test'
        }
      };

      const request = createSignedRequest(validEvent);
      // Add IP headers
      request.headers.set('x-forwarded-for', '192.168.1.1');
      
      await slackEventsHandler(request);
      
      expect(checkRateLimit).toHaveBeenCalledWith('slack_webhook', '192.168.1.1');
    });
  });

  describe('Error Boundary and Async Handler Protection', () => {
    test('should catch and handle errors in async event processing', async () => {
      const handleConversation = require('../lib/slack/conversation-handler').handleConversation;
      handleConversation.mockRejectedValueOnce(new Error('Unexpected async error'));

      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: '@bot status'
        }
      };

      const request = createSignedRequest(validEvent);
      const response = await slackEventsHandler(request);
      
      // Should not crash, should return success to prevent Slack retries
      expect(response.status).toBe(200);
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(handleConversation).toHaveBeenCalled();
    });

    test('should handle errors in signature verification gracefully', async () => {
      // Mock crypto.timingSafeEqual to throw
      const originalTimingSafeEqual = crypto.timingSafeEqual;
      crypto.timingSafeEqual = jest.fn(() => {
        throw new Error('Signature comparison error');
      });

      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: 'test'
        }
      };

      const request = createSignedRequest(validEvent);
      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid signature');
      
      // Restore original
      crypto.timingSafeEqual = originalTimingSafeEqual;
    });

    test('should handle critical errors without exposing internal details', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const request = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': 'v0=test',
        },
        body: null, // Null body to cause error
      });

      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      // Should return generic error without exposing internals
      expect(response.status).toBe(200); // 200 to prevent retries
      expect(data.ok).toBe(false);
      expect(data.error).toBe('Internal error');
      expect(data).not.toHaveProperty('stack');
      expect(data).not.toHaveProperty('message');
    });
  });

  describe('URL Verification Challenge', () => {
    test('should handle URL verification without signature check', async () => {
      const urlVerification = {
        type: 'url_verification',
        challenge: 'test_challenge_123',
        token: 'deprecated_verification_token'
      };

      const request = new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        body: JSON.stringify(urlVerification),
      });

      const response = await slackEventsHandler(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.challenge).toBe('test_challenge_123');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty database results gracefully', async () => {
      const handleConversation = require('../lib/slack/conversation-handler').handleConversation;
      handleConversation.mockResolvedValueOnce(undefined);

      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: '@bot status'
        }
      };

      const request = createSignedRequest(validEvent);
      const response = await slackEventsHandler(request);
      
      expect(response.status).toBe(200);
      expect(handleConversation).toHaveBeenCalled();
    });

    test('should handle metrics calculation at day boundary', async () => {
      // Set time to 23:59:59
      const originalNow = Date.now;
      Date.now = jest.fn(() => new Date('2024-01-01T23:59:59Z').getTime());

      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: '@bot daily report'
        }
      };

      const request = createSignedRequest(validEvent);
      const response = await slackEventsHandler(request);
      
      expect(response.status).toBe(200);
      
      // Restore
      Date.now = originalNow;
    });

    test('should handle concurrent webhook requests', async () => {
      const validEvent = {
        type: 'event_callback',
        event: {
          type: 'app_mention',
          user: 'U123',
          channel: 'C123',
          text: '@bot status'
        }
      };

      const requests = Array(5).fill(null).map(() => createSignedRequest(validEvent));
      const responses = await Promise.all(requests.map(req => slackEventsHandler(req)));
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});

describe('Slack Integration Performance Tests', () => {
  test('should respond within 3 seconds for all events', async () => {
    const handleConversation = require('../lib/slack/conversation-handler').handleConversation;
    handleConversation.mockImplementationOnce(() => {
      return new Promise(resolve => setTimeout(resolve, 5000)); // Simulate slow processing
    });

    const validEvent = {
      type: 'event_callback',
      event: {
        type: 'app_mention',
        user: 'U123',
        channel: 'C123',
        text: '@bot complex query'
      }
    };

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyString = JSON.stringify(validEvent);
    const baseString = `v0:${timestamp}:${bodyString}`;
    const signature = 'v0=' + crypto.createHmac('sha256', 'test_signing_secret').update(baseString).digest('hex');

    const request = new NextRequest('http://localhost/api/slack/events', {
      method: 'POST',
      headers: {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': signature,
      },
      body: bodyString,
    });

    const startTime = Date.now();
    const response = await slackEventsHandler(request);
    const responseTime = Date.now() - startTime;
    
    // Should respond quickly even with slow async processing
    expect(responseTime).toBeLessThan(1000); // Should respond in under 1 second
    expect(response.status).toBe(200);
  });

  test('should handle high volume of metrics queries efficiently', async () => {
    const validEvent = {
      type: 'event_callback',
      event: {
        type: 'app_mention',
        user: 'U123',
        channel: 'C123',
        text: '@bot status'
      }
    };

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyString = JSON.stringify(validEvent);
    const baseString = `v0:${timestamp}:${bodyString}`;
    const signature = 'v0=' + crypto.createHmac('sha256', 'test_signing_secret').update(baseString).digest('hex');

    // Simulate 100 concurrent requests
    const requests = Array(100).fill(null).map(() => 
      new NextRequest('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature,
        },
        body: bodyString,
      })
    );

    const startTime = Date.now();
    const responses = await Promise.all(requests.map(req => slackEventsHandler(req)));
    const totalTime = Date.now() - startTime;
    
    // All requests should complete within reasonable time
    expect(totalTime).toBeLessThan(5000); // 5 seconds for 100 requests
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
  });
});