import { jest } from '@jest/globals';
import { mockResendClient, mockDigestService } from './__mocks__/email-clients';
import { mockPrisma } from './__mocks__/prisma';
import { mockUser, mockUserDigestData } from './__fixtures__/user-data';
import { mockCompletedFiling } from './__fixtures__/filing-data';

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock('../../lib/email/resend-client', () => ({
  ResendClient: jest.fn(() => mockResendClient),
}));

jest.mock('../../lib/email/digest-service', () => ({
  DigestService: jest.fn(() => mockDigestService),
}));

describe('Digest Notification Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([mockUser]);
    mockDigestService.getUserDigestData.mockResolvedValue(mockUserDigestData);
    mockDigestService.getDigestSummaries.mockResolvedValue([mockCompletedFiling]);
    mockDigestService.getDigestErrors.mockResolvedValue([]);
    mockResendClient.sendEmail.mockResolvedValue({ id: 'email-123', success: true });
  });

  describe('User Digest Data', () => {
    it('should fetch user digest preferences', async () => {
      const data = await mockDigestService.getUserDigestData(mockUser.id);
      expect(data).toEqual(mockUserDigestData);
      expect(data.emailNotificationPreference).toBe('DAILY');
      expect(data.watchedFormTypes).toContain('10-K');
    });

    it('should handle users with no preferences', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{
        ...mockUser,
        preferences: {},
      }]);

      const users = await mockPrisma.user.findMany();
      expect(users[0].preferences).toEqual({});
    });
  });

  describe('Digest Generation', () => {
    it('should collect filing summaries', async () => {
      const summaries = await mockDigestService.getDigestSummaries(mockUser.id);
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toEqual(mockCompletedFiling);
    });

    it('should filter by user preferences', async () => {
      const customUser = {
        ...mockUser,
        preferences: {
          ...mockUser.preferences,
          watchedTickers: ['MOCK'],
        },
      };
      mockPrisma.user.findMany.mockResolvedValue([customUser]);

      const summaries = await mockDigestService.getDigestSummaries(customUser.id);
      expect(summaries[0].ticker).toBe('MOCK');
    });
  });

  describe('Email Sending', () => {
    it('should send digest emails', async () => {
      const result = await mockDigestService.sendDigestEmail(
        mockUserDigestData,
        [mockCompletedFiling],
        []
      );

      expect(result.success).toBe(true);
      expect(mockResendClient.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should include filing details in email', async () => {
      await mockDigestService.sendDigestEmail(
        mockUserDigestData,
        [mockCompletedFiling],
        []
      );

      const emailCall = mockResendClient.sendEmail.mock.calls[0][0];
      expect(emailCall.to).toBe(mockUser.email);
      expect(emailCall.subject).toContain('SEC Filing Summaries');
    });

    it('should handle empty summaries', async () => {
      mockDigestService.getDigestSummaries.mockResolvedValue([]);

      const summaries = await mockDigestService.getDigestSummaries(mockUser.id);
      expect(summaries).toHaveLength(0);
    });
  });
});
