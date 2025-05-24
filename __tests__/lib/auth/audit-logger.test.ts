import * as auditLogger from '@/lib/auth/audit-logger';
import { AuditEventType } from '@/lib/auth/audit-logger';
import { logger } from '@/lib/logging';

// Mock the logger dependency
jest.mock('@/lib/logging', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Audit Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logAuditEvent', () => {
    it('should log regular events at info level', () => {
      // Setup
      const eventType = AuditEventType.LOGIN_SUCCESS;
      const userId = 'user123';
      const resourceId = 'resource123';
      const metadata = { source: 'web', ip: '127.0.0.1' };

      // Execute
      auditLogger.logAuditEvent(eventType, userId, resourceId, metadata);

      // Assert
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Audit event', expect.objectContaining({
        eventType,
        userId,
        resourceId,
        source: 'web',
        ip: '127.0.0.1',
        timestamp: expect.any(String)
      }));
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should log security events at warn level', () => {
      // Setup
      const eventType = AuditEventType.SUMMARY_ACCESS_DENIED;
      const userId = 'user123';
      const resourceId = 'summary123';
      const metadata = { reason: 'untracked_ticker' };

      // Execute
      auditLogger.logAuditEvent(eventType, userId, resourceId, metadata);

      // Assert
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith('Security audit event', expect.objectContaining({
        eventType,
        userId,
        resourceId,
        reason: 'untracked_ticker',
        timestamp: expect.any(String)
      }));
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should use "anonymous" for null userId', () => {
      // Execute
      auditLogger.logAuditEvent(AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT, null);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(
        'Security audit event', 
        expect.objectContaining({
          userId: 'anonymous'
        })
      );
    });
  });

  describe('logSummaryAccess', () => {
    it('should log successful access with correct event type', () => {
      // Execute
      auditLogger.logSummaryAccess('user123', 'summary123', true, { tickerSymbol: 'AAPL' });

      // Assert that the correct event type was used
      expect(logger.info).toHaveBeenCalledWith('Audit event', expect.objectContaining({
        eventType: AuditEventType.SUMMARY_VIEW,
        userId: 'user123',
        resourceId: 'summary123',
        tickerSymbol: 'AAPL'
      }));
    });

    it('should log denied access with correct event type', () => {
      // Execute
      auditLogger.logSummaryAccess('user123', 'summary123', false, { reason: 'untracked_ticker' });

      // Assert that the correct event type was used
      expect(logger.warn).toHaveBeenCalledWith('Security audit event', expect.objectContaining({
        eventType: AuditEventType.SUMMARY_ACCESS_DENIED,
        userId: 'user123',
        resourceId: 'summary123',
        reason: 'untracked_ticker'
      }));
    });
  });
}); 