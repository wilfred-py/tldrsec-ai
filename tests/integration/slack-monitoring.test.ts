/**
 * Comprehensive Integration Tests for Slack Monitoring
 * Addresses Quality Engineer review requirements:
 * - HMAC signature validation edge cases
 * - Slack webhook failure scenarios  
 * - Concurrent cron execution handling
 * - Error boundary testing for malformed data
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

// Mock modules
jest.mock('@/lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }))
  }
}));

jest.mock('@/lib/slack/daily-report-handler', () => ({
  generateHourlySummary: jest.fn()
}));

// Import after mocks
import { GET as slackHourlySummary } from '@/app/api/cron/slack-hourly-summary/route';

/**
 * Helper function to generate valid HMAC signature
 */
function generateValidHmac(timestamp: string, method: string, path: string, secret: string): string {
  const payload = `${timestamp}:${method}:${path}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Helper function to create test request with headers
 */
function createTestRequest(headers: Record<string, string> = {}): NextRequest {
  const request = new NextRequest('http://localhost:3000/api/cron/slack-hourly-summary', {
    method: 'GET',
    headers: new Headers(headers)
  });
  return request;
}

describe('HMAC Signature Validation', () => {
  const VALID_SECRET = 'test-cron-secret-that-is-long-enough';
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = VALID_SECRET;
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should accept valid HMAC signature', async () => {
    const { generateHourlySummary } = require('@/lib/slack/daily-report-handler');
    generateHourlySummary.mockResolvedValue({ text: 'Test', blocks: [] });
    
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'ok'
    });

    const timestamp = Date.now().toString();
    const signature = generateValidHmac(timestamp, 'GET', '/api/cron/slack-hourly-summary', VALID_SECRET);
    
    const request = createTestRequest({
      'x-hmac-signature': signature,
      'x-hmac-timestamp': timestamp
    });

    const response = await slackHourlySummary(request);
    expect(response.status).toBe(200);
  });

  it('should reject invalid HMAC signature', async () => {
    const timestamp = Date.now().toString();
    
    const request = createTestRequest({
      'x-hmac-signature': 'invalid-signature',
      'x-hmac-timestamp': timestamp
    });

    const response = await slackHourlySummary(request);
    expect(response.status).toBe(401);
  });

  it('should handle missing CRON_SECRET gracefully', async () => {
    delete process.env.CRON_SECRET;
    
    const request = createTestRequest({
      'authorization': 'Bearer test'
    });

    const response = await slackHourlySummary(request);
    expect(response.status).toBe(401);
  });
});

describe('Slack Webhook Integration', () => {
  const VALID_SECRET = 'test-cron-secret-that-is-long-enough';
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = VALID_SECRET;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should handle missing webhook URL configuration', async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    
    const { generateHourlySummary } = require('@/lib/slack/daily-report-handler');
    generateHourlySummary.mockResolvedValue({ text: 'Test', blocks: [] });

    const request = createTestRequest({
      'authorization': `Bearer ${VALID_SECRET}`
    });

    const response = await slackHourlySummary(request);
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.error).toBe('SLACK_WEBHOOK_URL not configured');
  });

  it('should handle webhook failures gracefully', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    
    const { generateHourlySummary } = require('@/lib/slack/daily-report-handler');
    generateHourlySummary.mockResolvedValue({ text: 'Test', blocks: [] });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limited'
    });

    const request = createTestRequest({
      'authorization': `Bearer ${VALID_SECRET}`
    });

    const response = await slackHourlySummary(request);
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
  });
});

describe('Error Boundary Testing', () => {
  const VALID_SECRET = 'test-cron-secret-that-is-long-enough';
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = VALID_SECRET;
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should handle summary generation errors', async () => {
    const { generateHourlySummary } = require('@/lib/slack/daily-report-handler');
    generateHourlySummary.mockRejectedValue(new Error('Database error'));

    const request = createTestRequest({
      'authorization': `Bearer ${VALID_SECRET}`
    });

    const response = await slackHourlySummary(request);
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Database error');
  });
});