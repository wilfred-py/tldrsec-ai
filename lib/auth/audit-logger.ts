import { logger } from '@/lib/logging';

/**
 * Audit log event types for security and compliance
 */
export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  
  // Access events
  SUMMARY_VIEW = 'summary_view',
  SUMMARY_ACCESS_DENIED = 'summary_access_denied',
  SUMMARY_DOWNLOAD = 'summary_download',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'unauthorized_access_attempt',
  
  // Data modification events
  WATCHLIST_ADD = 'watchlist_add',
  WATCHLIST_REMOVE = 'watchlist_remove',
  USER_SETTINGS_CHANGED = 'user_settings_changed',
  
  // Admin events
  ADMIN_ACTION = 'admin_action'
}

/**
 * Log an audit event for security monitoring and compliance
 * @param eventType The type of event being logged
 * @param userId The ID of the user performing the action (if available)
 * @param resourceId The ID of the resource being accessed (if applicable)
 * @param metadata Additional context about the event
 */
export function logAuditEvent(
  eventType: AuditEventType,
  userId: string | null,
  resourceId?: string,
  metadata: Record<string, any> = {}
): void {
  // Prepare the audit log entry
  const auditLog = {
    eventType,
    timestamp: new Date().toISOString(),
    userId: userId || 'anonymous',
    resourceId,
    ...metadata,
  };
  
  // Log the event
  switch (eventType) {
    case AuditEventType.SUMMARY_ACCESS_DENIED:
    case AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT:
      // Security events get logged at warn level
      logger.warn('Security audit event', auditLog);
      break;
    default:
      // Regular audit events
      logger.info('Audit event', auditLog);
  }
  
  // In a production environment, we might want to:
  // 1. Store audit logs in a separate database table
  // 2. Send critical security events to a monitoring service
  // 3. Implement retention policies for compliance
}

/**
 * Log summary access specifically
 * @param userId User ID accessing the summary
 * @param summaryId ID of the summary being accessed
 * @param wasSuccessful Whether access was granted
 * @param metadata Additional context
 */
export function logSummaryAccess(
  userId: string | null,
  summaryId: string,
  wasSuccessful: boolean,
  metadata: Record<string, any> = {}
): void {
  const eventType = wasSuccessful 
    ? AuditEventType.SUMMARY_VIEW 
    : AuditEventType.SUMMARY_ACCESS_DENIED;
    
  logAuditEvent(eventType, userId, summaryId, metadata);
} 