/**
 * Tests for sendOnboardingFallbackNotice — the long-tail "we're watching"
 * notice when no cached cross-user summaries exist for the user's tickers.
 */

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

const mockSendEmail = jest.fn();
jest.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockGetEmailTemplate = jest.fn();
jest.mock('@/lib/email/templates', () => ({
  getEmailTemplate: (...args: unknown[]) => mockGetEmailTemplate(...args),
}));

import { sendOnboardingFallbackNotice } from '@/lib/email/onboarding-fallback-service';
import { EmailType } from '@/lib/email/types';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEmailTemplate.mockResolvedValue({
    html: '<p>fallback</p>',
    text: 'fallback',
  });
});

describe('sendOnboardingFallbackNotice', () => {
  const baseArgs = {
    userId: 'user_1',
    email: 'a@b.com',
    recipientName: 'Wilfred',
    trackedTickers: ['AAPL', 'MSFT', 'GOOGL'],
  };

  describe('idempotency', () => {
    it('returns already_sent when onboardingFirstEmailSentAt is set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: new Date('2026-01-01'),
      });
      const result = await sendOnboardingFallbackNotice(baseArgs);
      expect(result).toEqual({ delivered: false, reason: 'already_sent' });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('proceeds when onboardingFirstEmailSentAt is null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockSendEmail.mockResolvedValue({ success: true });
      const result = await sendOnboardingFallbackNotice(baseArgs);
      expect(result.delivered).toBe(true);
    });
  });

  describe('subject line', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockSendEmail.mockResolvedValue({ success: true });
    });

    it('uses first 3 tickers verbatim when ≤3', async () => {
      await sendOnboardingFallbackNotice({
        ...baseArgs,
        trackedTickers: ['AAPL', 'MSFT'],
      });
      const subject = mockSendEmail.mock.calls[0][0].subject;
      expect(subject).toBe("We're watching AAPL, MSFT");
    });

    it('truncates to first 3 tickers + "+N" overflow when >3', async () => {
      await sendOnboardingFallbackNotice({
        ...baseArgs,
        trackedTickers: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'COIN'],
      });
      const subject = mockSendEmail.mock.calls[0][0].subject;
      expect(subject).toBe("We're watching AAPL, MSFT, GOOGL +2");
    });

    it('falls back to generic copy when trackedTickers is empty', async () => {
      await sendOnboardingFallbackNotice({
        ...baseArgs,
        trackedTickers: [],
      });
      const subject = mockSendEmail.mock.calls[0][0].subject;
      expect(subject).toBe("We're watching your tickers");
    });
  });

  describe('template + tag', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockSendEmail.mockResolvedValue({ success: true });
    });

    it('uses ONBOARDING_FALLBACK_NOTICE template', async () => {
      await sendOnboardingFallbackNotice(baseArgs);
      expect(mockGetEmailTemplate).toHaveBeenCalledWith(
        EmailType.ONBOARDING_FALLBACK_NOTICE,
        expect.objectContaining({
          recipientName: 'Wilfred',
          trackedTickers: ['AAPL', 'MSFT', 'GOOGL'],
        })
      );
    });

    it('tags email with type:onboarding-fallback-notice', async () => {
      await sendOnboardingFallbackNotice(baseArgs);
      const tags = mockSendEmail.mock.calls[0][0].tags;
      expect(tags).toContain('type:onboarding-fallback-notice');
    });
  });

  describe('success path', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockSendEmail.mockResolvedValue({ success: true });
    });

    it('returns delivered:true', async () => {
      const result = await sendOnboardingFallbackNotice(baseArgs);
      expect(result).toEqual({ delivered: true });
    });

    it('updates User.onboardingFirstEmailSentAt to now', async () => {
      await sendOnboardingFallbackNotice(baseArgs);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user_1' },
          data: { onboardingFirstEmailSentAt: expect.any(Date) },
        })
      );
    });

    it('does NOT set onboardingFirstSummaryId (no summary was sent)', async () => {
      await sendOnboardingFallbackNotice(baseArgs);
      const updateData = mockPrisma.user.update.mock.calls[0][0].data;
      expect(updateData.onboardingFirstSummaryId).toBeUndefined();
    });
  });

  describe('send failure', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
    });

    it('returns send_failed with error.message when sendEmail.success=false', async () => {
      mockSendEmail.mockResolvedValue({
        success: false,
        error: { message: 'rate limited', code: '429' },
      });
      const result = await sendOnboardingFallbackNotice(baseArgs);
      expect(result).toEqual({
        delivered: false,
        reason: 'send_failed',
        error: 'rate limited',
      });
    });

    it('does NOT update User on send failure', async () => {
      mockSendEmail.mockResolvedValue({
        success: false,
        error: { message: 'oops', code: '500' },
      });
      await sendOnboardingFallbackNotice(baseArgs);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('internal error', () => {
    it('returns internal_error when getEmailTemplate throws', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockGetEmailTemplate.mockRejectedValue(new Error('template explosion'));
      const result = await sendOnboardingFallbackNotice(baseArgs);
      expect(result.delivered).toBe(false);
      expect(result.reason).toBe('internal_error');
      expect(result.error).toContain('template explosion');
    });

    it('returns internal_error when sendEmail throws (not just returns failure)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockSendEmail.mockRejectedValue(new Error('network down'));
      const result = await sendOnboardingFallbackNotice(baseArgs);
      expect(result.reason).toBe('internal_error');
      expect(result.error).toContain('network down');
    });
  });
});
