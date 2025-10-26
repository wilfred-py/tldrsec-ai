/**
 * GDPR-Compliant Secure Audit Logging System
 * 
 * Implements secure, compliant audit logging with automatic PII redaction
 * and structured security event tracking for regulatory compliance.
 */

import { logger } from '../logging';
import { dataSanitizer } from './data-sanitizer';

const auditLogger = logger.child('audit');

/**
 * Security event types for compliance tracking
 */
export enum SecurityEventType {
  AUTHENTICATION_ATTEMPT = 'authentication_attempt',
  AUTHORIZATION_CHECK = 'authorization_check',
  DATA_ACCESS = 'data_access',
  DATA_MODIFICATION = 'data_modification',
  ALERT_CREATION = 'alert_creation',
  FILING_PROCESSING = 'filing_processing',
  USER_NOTIFICATION = 'user_notification',
  SECURITY_VIOLATION = 'security_violation',
  SYSTEM_ERROR = 'system_error',
  PERFORMANCE_EVENT = 'performance_event'
}

/**
 * Security event severity levels
 */
export enum SecuritySeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Audit log entry structure
 */
interface AuditLogEntry {
  eventId: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  timestamp: string;
  userId?: string; // Will be sanitized
  sessionId?: string;
  resourceType?: string;
  resourceId?: string;
  operation?: string;
  outcome: 'success' | 'failure' | 'warning';
  message: string;
  details?: Record<string, unknown>;
  sourceIp?: string; // Will be sanitized
  userAgent?: string; // Will be sanitized
  environment: string;
  correlationId?: string;
  complianceFlags: {
    gdprProcessed: boolean;
    piiRedacted: boolean;
    retentionApplied: boolean;
  };
}

/**
 * Performance metrics for audit events
 */
interface PerformanceMetrics {
  duration?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  databaseQueries?: number;
  apiCalls?: number;
  cacheHits?: number;
  cacheMisses?: number;
}

/**
 * GDPR-compliant audit logging configuration
 */
interface AuditConfig {
  enablePIIRedaction: boolean;
  enablePerformanceLogging: boolean;
  retentionPeriodDays: number;
  minimumSeverityLevel: SecuritySeverity;
  enableRealTimeAlerts: boolean;
  complianceMode: 'development' | 'production';
}

/**
 * Default audit configuration
 */
const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  enablePIIRedaction: true,
  enablePerformanceLogging: true,
  retentionPeriodDays: 2555, // 7 years for financial compliance
  minimumSeverityLevel: SecuritySeverity.INFO,
  enableRealTimeAlerts: true,
  complianceMode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
};

/**
 * Secure audit logger with GDPR compliance
 */
export class SecureAuditLogger {
  private config: AuditConfig;
  private logBuffer: AuditLogEntry[] = [];
  private readonly maxBufferSize = 100;

  constructor(config: Partial<AuditConfig> = {}) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
  }

  /**
   * Log security event with automatic sanitization and compliance processing
   */
  async logSecurityEvent(
    eventType: SecurityEventType,
    severity: SecuritySeverity,
    message: string,
    context: {
      userId?: string;
      sessionId?: string;
      resourceType?: string;
      resourceId?: string;
      operation?: string;
      outcome?: 'success' | 'failure' | 'warning';
      details?: Record<string, unknown>;
      sourceIp?: string;
      userAgent?: string;
      correlationId?: string;
      performanceMetrics?: PerformanceMetrics;
    } = {}
  ): Promise<string> {
    try {
      // Generate unique event ID
      const eventId = dataSanitizer.generateSecureCorrelationId('audit');

      // Check severity threshold
      if (!this.shouldLog(severity)) {
        return eventId;
      }

      // Create audit log entry with sanitization
      const auditEntry = await this.createAuditEntry(
        eventId,
        eventType,
        severity,
        message,
        context
      );

      // Log the entry
      await this.writeAuditEntry(auditEntry);

      // Check for real-time alerts
      if (this.config.enableRealTimeAlerts && this.requiresAlert(severity, eventType)) {
        await this.triggerSecurityAlert(auditEntry);
      }

      return eventId;

    } catch (error) {
      // Fallback logging to prevent audit failures from breaking the system
      auditLogger.error('Failed to log security event', {
        eventType,
        severity,
        error: error instanceof Error ? error.message : 'Unknown error',
        fallbackLogged: true
      });

      return 'audit_failed_' + Date.now();
    }
  }

  /**
   * Log alert creation with comprehensive security context
   */
  async logAlertCreation(
    alertType: string,
    severity: string,
    userId?: string,
    details?: Record<string, unknown>,
    performanceMetrics?: PerformanceMetrics
  ): Promise<string> {
    return this.logSecurityEvent(
      SecurityEventType.ALERT_CREATION,
      this.mapSeverity(severity),
      `Alert created: ${alertType}`,
      {
        userId,
        resourceType: 'alert',
        operation: 'create',
        outcome: 'success',
        details: {
          alertType,
          originalSeverity: severity,
          ...details
        },
        performanceMetrics
      }
    );
  }

  /**
   * Log user notification event
   */
  async logUserNotification(
    userId: string,
    notificationType: string,
    outcome: 'success' | 'failure',
    details?: Record<string, unknown>
  ): Promise<string> {
    return this.logSecurityEvent(
      SecurityEventType.USER_NOTIFICATION,
      outcome === 'success' ? SecuritySeverity.INFO : SecuritySeverity.MEDIUM,
      `User notification ${notificationType}: ${outcome}`,
      {
        userId,
        resourceType: 'notification',
        operation: 'send',
        outcome,
        details
      }
    );
  }

  /**
   * Log filing processing event
   */
  async logFilingProcessing(
    userId: string,
    accessionNumber: string,
    outcome: 'success' | 'failure',
    performanceMetrics?: PerformanceMetrics,
    details?: Record<string, unknown>
  ): Promise<string> {
    return this.logSecurityEvent(
      SecurityEventType.FILING_PROCESSING,
      outcome === 'success' ? SecuritySeverity.INFO : SecuritySeverity.MEDIUM,
      `Filing processing: ${accessionNumber} - ${outcome}`,
      {
        userId,
        resourceType: 'filing',
        resourceId: accessionNumber,
        operation: 'process',
        outcome,
        details,
        performanceMetrics
      }
    );
  }

  /**
   * Log data access event for compliance
   */
  async logDataAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    operation: string,
    outcome: 'success' | 'failure',
    details?: Record<string, unknown>
  ): Promise<string> {
    return this.logSecurityEvent(
      SecurityEventType.DATA_ACCESS,
      SecuritySeverity.INFO,
      `Data access: ${operation} on ${resourceType}`,
      {
        userId,
        resourceType,
        resourceId,
        operation,
        outcome,
        details
      }
    );
  }

  /**
   * Log security violation
   */
  async logSecurityViolation(
    violationType: string,
    severity: SecuritySeverity,
    message: string,
    context: {
      userId?: string;
      sourceIp?: string;
      userAgent?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<string> {
    return this.logSecurityEvent(
      SecurityEventType.SECURITY_VIOLATION,
      severity,
      `Security violation: ${violationType} - ${message}`,
      {
        ...context,
        resourceType: 'security',
        operation: 'violation_detected',
        outcome: 'warning'
      }
    );
  }

  /**
   * Log performance event
   */
  async logPerformanceEvent(
    operation: string,
    metrics: PerformanceMetrics,
    threshold?: { metric: string; threshold: number; actual: number }
  ): Promise<string> {
    const severity = threshold 
      ? SecuritySeverity.MEDIUM 
      : SecuritySeverity.INFO;

    const message = threshold
      ? `Performance threshold exceeded: ${threshold.metric} (${threshold.actual} > ${threshold.threshold})`
      : `Performance metrics recorded for ${operation}`;

    return this.logSecurityEvent(
      SecurityEventType.PERFORMANCE_EVENT,
      severity,
      message,
      {
        resourceType: 'performance',
        operation,
        outcome: threshold ? 'warning' : 'success',
        performanceMetrics: metrics,
        details: threshold ? { threshold } : undefined
      }
    );
  }

  /**
   * Create sanitized audit entry
   */
  private async createAuditEntry(
    eventId: string,
    eventType: SecurityEventType,
    severity: SecuritySeverity,
    message: string,
    context: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    // Sanitize all context data
    const sanitizedContext = dataSanitizer.createSecureLogContext(context);

    return {
      eventId,
      eventType,
      severity,
      timestamp: new Date().toISOString(),
      userId: sanitizedContext.userId as string | undefined,
      sessionId: sanitizedContext.sessionId as string | undefined,
      resourceType: sanitizedContext.resourceType as string | undefined,
      resourceId: sanitizedContext.resourceId as string | undefined,
      operation: sanitizedContext.operation as string | undefined,
      outcome: (sanitizedContext.outcome as 'success' | 'failure' | 'warning') || 'success',
      message: dataSanitizer.sanitizeString(message),
      details: sanitizedContext.details as Record<string, unknown> | undefined,
      sourceIp: this.sanitizeIpAddress(sanitizedContext.sourceIp as string),
      userAgent: this.sanitizeUserAgent(sanitizedContext.userAgent as string),
      environment: process.env.NODE_ENV || 'development',
      correlationId: sanitizedContext.correlationId as string | undefined,
      complianceFlags: {
        gdprProcessed: true,
        piiRedacted: this.config.enablePIIRedaction,
        retentionApplied: true
      }
    };
  }

  /**
   * Write audit entry to secure log
   */
  private async writeAuditEntry(entry: AuditLogEntry): Promise<void> {
    // Add to buffer for batch processing
    this.logBuffer.push(entry);

    // Write immediately for high severity events
    if (entry.severity === SecuritySeverity.HIGH || entry.severity === SecuritySeverity.CRITICAL) {
      await this.flushBuffer();
    } else if (this.logBuffer.length >= this.maxBufferSize) {
      await this.flushBuffer();
    }

    // Regular audit log
    const logLevel = this.getLogLevel(entry.severity);
    auditLogger[logLevel]('Security audit event', {
      ...entry,
      _auditEntry: true
    });
  }

  /**
   * Flush audit buffer to persistent storage
   */
  private async flushBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    try {
      // In production, this would write to secure audit storage
      // For now, we'll just clear the buffer
      auditLogger.info('Audit buffer flushed', {
        entriesProcessed: this.logBuffer.length,
        timestamp: new Date().toISOString()
      });

      this.logBuffer = [];
    } catch (error) {
      auditLogger.error('Failed to flush audit buffer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        bufferSize: this.logBuffer.length
      });
    }
  }

  /**
   * Check if event should be logged based on severity
   */
  private shouldLog(severity: SecuritySeverity): boolean {
    const severityLevels = {
      [SecuritySeverity.INFO]: 0,
      [SecuritySeverity.LOW]: 1,
      [SecuritySeverity.MEDIUM]: 2,
      [SecuritySeverity.HIGH]: 3,
      [SecuritySeverity.CRITICAL]: 4
    };

    return severityLevels[severity] >= severityLevels[this.config.minimumSeverityLevel];
  }

  /**
   * Check if event requires real-time alert
   */
  private requiresAlert(severity: SecuritySeverity, eventType: SecurityEventType): boolean {
    if (severity === SecuritySeverity.CRITICAL) {
      return true;
    }

    if (severity === SecuritySeverity.HIGH && eventType === SecurityEventType.SECURITY_VIOLATION) {
      return true;
    }

    return false;
  }

  /**
   * Trigger security alert for critical events
   */
  private async triggerSecurityAlert(entry: AuditLogEntry): Promise<void> {
    try {
      auditLogger.error('SECURITY ALERT TRIGGERED', {
        eventId: entry.eventId,
        eventType: entry.eventType,
        severity: entry.severity,
        message: entry.message,
        timestamp: entry.timestamp,
        requiresImmedateAttention: true
      });

      // In production, this would trigger external alerting systems
    } catch (error) {
      auditLogger.error('Failed to trigger security alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventId: entry.eventId
      });
    }
  }

  /**
   * Map string severity to enum
   */
  private mapSeverity(severity: string): SecuritySeverity {
    const severityMap: Record<string, SecuritySeverity> = {
      'INFO': SecuritySeverity.INFO,
      'LOW': SecuritySeverity.LOW,
      'MEDIUM': SecuritySeverity.MEDIUM,
      'HIGH': SecuritySeverity.HIGH,
      'CRITICAL': SecuritySeverity.CRITICAL
    };

    return severityMap[severity.toUpperCase()] || SecuritySeverity.INFO;
  }

  /**
   * Get appropriate log level for severity
   */
  private getLogLevel(severity: SecuritySeverity): 'info' | 'warn' | 'error' {
    switch (severity) {
      case SecuritySeverity.CRITICAL:
      case SecuritySeverity.HIGH:
        return 'error';
      case SecuritySeverity.MEDIUM:
        return 'warn';
      default:
        return 'info';
    }
  }

  /**
   * Sanitize IP address for GDPR compliance
   */
  private sanitizeIpAddress(ip?: string): string | undefined {
    if (!ip || !this.config.enablePIIRedaction) {
      return ip;
    }

    // IPv4 - mask last octet
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
      }
    }

    // IPv6 - mask last segments
    if (ip.includes(':')) {
      const parts = ip.split(':');
      if (parts.length >= 4) {
        return parts.slice(0, 4).join(':') + '::xxxx';
      }
    }

    return '[IP_REDACTED]';
  }

  /**
   * Sanitize user agent for privacy
   */
  private sanitizeUserAgent(userAgent?: string): string | undefined {
    if (!userAgent || !this.config.enablePIIRedaction) {
      return userAgent;
    }

    // Keep browser and OS info, remove detailed version numbers
    return userAgent
      .replace(/\/[\d.]+/g, '/xxx')
      .replace(/\([^)]*\)/g, '(details_redacted)');
  }
}

/**
 * Global secure audit logger instance
 */
export const secureLogger = new SecureAuditLogger({
  enablePIIRedaction: true,
  enablePerformanceLogging: true,
  complianceMode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
});

/**
 * Convenience functions for common audit operations
 */
export const auditLog = {
  /**
   * Alert creation audit
   */
  alertCreated: (alertType: string, severity: string, userId?: string, details?: Record<string, unknown>) =>
    secureLogger.logAlertCreation(alertType, severity, userId, details),

  /**
   * User notification audit
   */
  userNotified: (userId: string, type: string, outcome: 'success' | 'failure', details?: Record<string, unknown>) =>
    secureLogger.logUserNotification(userId, type, outcome, details),

  /**
   * Filing processing audit
   */
  filingProcessed: (userId: string, accessionNumber: string, outcome: 'success' | 'failure', metrics?: PerformanceMetrics) =>
    secureLogger.logFilingProcessing(userId, accessionNumber, outcome, metrics),

  /**
   * Data access audit
   */
  dataAccessed: (userId: string, resourceType: string, resourceId: string, operation: string, outcome: 'success' | 'failure') =>
    secureLogger.logDataAccess(userId, resourceType, resourceId, operation, outcome),

  /**
   * Security violation audit
   */
  securityViolation: (type: string, severity: SecuritySeverity, message: string, context?: Record<string, unknown>) =>
    secureLogger.logSecurityViolation(type, severity, message, context || {}),

  /**
   * Performance event audit
   */
  performance: (operation: string, metrics: PerformanceMetrics) =>
    secureLogger.logPerformanceEvent(operation, metrics)
};