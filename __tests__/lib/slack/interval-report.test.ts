/**
 * Tests for generateIntervalReport function
 *
 * These tests validate the 10-minute interval report generation
 * for Slack pipeline verification reports.
 */

import { generateIntervalReport } from '@/lib/slack/daily-report-handler';

// Mock the database client to avoid real DB calls
jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
  })),
}));

describe('generateIntervalReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return SlackWebhookPayload with blocks', async () => {
    const result = await generateIntervalReport(10);
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('blocks');
    expect(Array.isArray(result.blocks)).toBe(true);
  });

  it('should use 10-MINUTE header when minutesBack is 10', async () => {
    // With mocked empty DB, skipEmpty=false to ensure we get blocks
    const result = await generateIntervalReport(10, { skipEmpty: false });
    const headerBlock = result.blocks?.find(
      (b) => b.type === 'header'
    ) as { type: 'header'; text?: { text?: string } } | undefined;
    expect(headerBlock?.text?.text).toContain('10-MINUTE');
  });

  it('should include time period in context block', async () => {
    const result = await generateIntervalReport(10, { skipEmpty: false });
    const contextBlock = result.blocks?.find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
  });

  it('should return empty blocks array when skipEmpty is true and no activity', async () => {
    // Default skipEmpty=true, mocked DB returns empty arrays
    const result = await generateIntervalReport(10, { skipEmpty: true });
    // If no filings in interval, should return empty blocks
    expect(result.blocks?.length).toBe(0);
    expect(result.text).toBe('');
  });

  it('should handle different interval values', async () => {
    const result5 = await generateIntervalReport(5, { skipEmpty: false });
    const result15 = await generateIntervalReport(15, { skipEmpty: false });

    const headerBlock5 = result5.blocks?.find(
      (b) => b.type === 'header'
    ) as { type: 'header'; text?: { text?: string } } | undefined;
    const headerBlock15 = result15.blocks?.find(
      (b) => b.type === 'header'
    ) as { type: 'header'; text?: { text?: string } } | undefined;

    expect(headerBlock5?.text?.text).toContain('5-MINUTE');
    expect(headerBlock15?.text?.text).toContain('15-MINUTE');
  });

  it('should include unfurl_links and unfurl_media set to false', async () => {
    const result = await generateIntervalReport(10);
    expect(result.unfurl_links).toBe(false);
    expect(result.unfurl_media).toBe(false);
  });
});
