/**
 * Production Alerting Service
 * 
 * Provides comprehensive alerting for all critical system failures
 * including AI service failures, cost validation issues, and cron system failures.
 */

import { logger } from '../../lib/logging';
import { ProductionAlert, AlertSeverity, ErrorCategory } from './types';
import { emailClient } from '../../lib/email';
import { v4 as uuidv4 } from 'uuid';

// Environment configuration for alerting
const ALERT_EMAIL = process.env.ALERT_EMAIL || process.env.TEST_EMAIL || 'alerts@tldrsec.app';
const ENABLE_EMAIL_ALERTS = process.env.ENABLE_EMAIL_ALERTS === 'true' || process.env.NODE_ENV === 'production';
const ALERT_THROTTLE_MINUTES = parseInt(process.env.ALERT_THROTTLE_MINUTES || '15');

// In-memory alert throttling cache (in production, use Redis or database)
const alertThrottleCache = new Map<string, Date>();

/**
 * Alert severity configuration for different error categories
 */
const SEVERITY_MAP: Record<ErrorCategory, AlertSeverity> = {
  AI_SERVICE_ERROR: 'HIGH',
  RATE_LIMIT_ERROR: 'MEDIUM',
  AUTHENTICATION_ERROR: 'CRITICAL',
  TIMEOUT_ERROR: 'MEDIUM',
  PARSING_ERROR: 'LOW',
  COST_VALIDATION_ERROR: 'CRITICAL',
  NETWORK_ERROR: 'MEDIUM',
  UNKNOWN_ERROR: 'HIGH'
};

/**
 * Generate a unique throttle key for alert deduplication
 */
function generateThrottleKey(category: ErrorCategory, service: string, contextHash?: string): string {
  return `${category}:${service}${contextHash ? `:${contextHash}` : ''}`;
}

/**
 * Check if an alert should be throttled based on recent sends
 */
function shouldThrottleAlert(throttleKey: string): boolean {
  const lastSent = alertThrottleCache.get(throttleKey);
  if (!lastSent) {
    return false;
  }
  
  const timeSinceLastAlert = Date.now() - lastSent.getTime();
  const throttleWindowMs = ALERT_THROTTLE_MINUTES * 60 * 1000;
  
  return timeSinceLastAlert < throttleWindowMs;
}

/**
 * Update the throttle cache for an alert
 */
function updateThrottleCache(throttleKey: string): void {
  alertThrottleCache.set(throttleKey, new Date());
  
  // Clean up old entries to prevent memory leaks
  const cutoffTime = Date.now() - (ALERT_THROTTLE_MINUTES * 60 * 1000 * 2);
  for (const [key, timestamp] of alertThrottleCache.entries()) {
    if (timestamp.getTime() < cutoffTime) {
      alertThrottleCache.delete(key);
    }
  }
}

/**
 * Create and send a production alert
 */
export async function sendProductionAlert(
  category: ErrorCategory,
  service: string,
  message: string,
  context: Record<string, any> = {},
  options: {
    userId?: string;
    actionRequired?: boolean;
    skipThrottling?: boolean;
    customSeverity?: AlertSeverity;
  } = {}
): Promise<{ success: boolean; alertId: string; throttled?: boolean }> {
  
  const alertId = uuidv4();
  const severity = options.customSeverity || SEVERITY_MAP[category];
  
  // Create alert object
  const alert: ProductionAlert = {
    id: alertId,
    severity,
    category,
    message,
    context: {
      ...context,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      service
    },
    timestamp: new Date(),
    service,
    userId: options.userId,
    actionRequired: options.actionRequired ?? severity === 'CRITICAL'
  };
  
  // Log the alert locally
  logger.error('PRODUCTION ALERT', {
    alertId,
    severity,
    category,
    service,
    message,
    context: alert.context,
    actionRequired: alert.actionRequired
  });
  
  // Check throttling unless explicitly skipped
  const contextHash = JSON.stringify(context).substring(0, 50);
  const throttleKey = generateThrottleKey(category, service, contextHash);
  
  if (!options.skipThrottling && shouldThrottleAlert(throttleKey)) {
    logger.info('Alert throttled due to recent similar alert', { 
      alertId, 
      throttleKey,
      category,
      service 
    });
    return { success: true, alertId, throttled: true };
  }
  
  // Send email alert if enabled
  if (ENABLE_EMAIL_ALERTS && ALERT_EMAIL) {
    try {
      await sendAlertEmail(alert);
      updateThrottleCache(throttleKey);
      logger.info('Production alert email sent successfully', { alertId, severity, category });
    } catch (emailError) {
      logger.error('Failed to send production alert email', { 
        alertId, 
        error: emailError instanceof Error ? emailError.message : String(emailError) 
      });
      // Don't fail the alert system if email fails
    }
  }
  
  // TODO: In production, also store alerts in database for tracking and analytics
  // await storeAlertInDatabase(alert);
  
  return { success: true, alertId, throttled: false };
}

/**
 * Send alert email notification
 */
async function sendAlertEmail(alert: ProductionAlert): Promise<void> {
  const severityEmoji = {
    LOW: '🟡',
    MEDIUM: '🟠', 
    HIGH: '🔴',
    CRITICAL: '🚨'
  };
  
  const categoryEmoji = {
    AI_SERVICE_ERROR: '🤖',
    RATE_LIMIT_ERROR: '⏱️',
    AUTHENTICATION_ERROR: '🔐',
    TIMEOUT_ERROR: '⏰',
    PARSING_ERROR: '📝',
    COST_VALIDATION_ERROR: '💰',
    NETWORK_ERROR: '🌐',
    UNKNOWN_ERROR: '❓'
  };
  
  const subject = `${severityEmoji[alert.severity]} Production Alert: ${alert.category} in ${alert.service}`;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${alert.severity === 'CRITICAL' ? '#fee2e2' : alert.severity === 'HIGH' ? '#fef3c7' : '#f3f4f6'}; 
                  border-left: 4px solid ${alert.severity === 'CRITICAL' ? '#ef4444' : alert.severity === 'HIGH' ? '#f59e0b' : '#6b7280'}; 
                  padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 20px; margin-right: 8px;">
            ${severityEmoji[alert.severity]} ${categoryEmoji[alert.category]}
          </div>
          <h2 style="margin: 0; color: ${alert.severity === 'CRITICAL' ? '#991b1b' : '#374151'}; font-size: 18px;">
            ${alert.severity} Alert: ${alert.category}
          </h2>
        </div>
        
        <p style="color: ${alert.severity === 'CRITICAL' ? '#991b1b' : '#374151'}; margin: 8px 0; font-size: 16px; font-weight: bold;">
          ${alert.message}
        </p>
        
        <div style="background-color: rgba(0,0,0,0.1); padding: 12px; border-radius: 4px; margin: 12px 0;">
          <p style="margin: 0; font-size: 14px;"><strong>Service:</strong> ${alert.service}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px;"><strong>Time:</strong> ${alert.timestamp.toLocaleString()}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px;"><strong>Alert ID:</strong> ${alert.id}</p>
          ${alert.userId ? `<p style="margin: 4px 0 0 0; font-size: 14px;"><strong>User ID:</strong> ${alert.userId}</p>` : ''}
        </div>
        
        ${alert.actionRequired ? `
        <div style="background-color: #fee2e2; border: 1px solid #fca5a5; padding: 12px; border-radius: 6px; margin: 12px 0;">
          <p style="color: #991b1b; margin: 0; font-size: 14px; font-weight: bold;">⚠️ ACTION REQUIRED</p>
          <p style="color: #7f1d1d; margin: 4px 0 0 0; font-size: 12px;">This alert requires immediate attention from the operations team.</p>
        </div>
        ` : ''}
      </div>
      
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px;">
        <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 16px;">Context Details:</h3>
        <pre style="background-color: #ffffff; padding: 12px; border-radius: 4px; border: 1px solid #d1d5db; 
                    font-family: monospace; font-size: 12px; overflow-x: auto; margin: 0;">${JSON.stringify(alert.context, null, 2)}</pre>
      </div>
      
      <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px; margin: 0;">
          tldrsec.app Production Monitoring System
        </p>
      </div>
    </div>
  `;

  const textContent = `
PRODUCTION ALERT: ${alert.severity}

Category: ${alert.category}
Service: ${alert.service}
Time: ${alert.timestamp.toLocaleString()}
Alert ID: ${alert.id}

Message: ${alert.message}

${alert.actionRequired ? 'ACTION REQUIRED: This alert needs immediate attention.\n' : ''}

Context:
${JSON.stringify(alert.context, null, 2)}
  `;

  await emailClient.sendEmail({
    to: ALERT_EMAIL,
    subject,
    html: htmlContent,
    text: textContent,
    tags: ['type:alert', `severity:${alert.severity.toLowerCase()}`, `category:${alert.category.toLowerCase()}`]
  });
}

/**
 * Specific alert functions for common scenarios
 */

export async function alertAIServiceFailure(
  service: string,
  error: Error | string,
  context: { userId?: string; ticker?: string; filingType?: string; attempt?: number } = {}
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  await sendProductionAlert(
    'AI_SERVICE_ERROR',
    service,
    `AI summarization service failure: ${errorMessage}`,
    {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : 'StringError',
      stack: error instanceof Error ? error.stack : undefined,
      ...context
    },
    { 
      actionRequired: true,
      userId: context.userId 
    }
  );
}

export async function alertCostValidationFailure(
  service: string,
  cost: number,
  tier: string,
  context: { userId?: string; operation?: string } = {}
): Promise<void> {
  await sendProductionAlert(
    'COST_VALIDATION_ERROR',
    service,
    `Cost validation failed: ${cost} for tier ${tier}`,
    {
      invalidCost: cost,
      tier,
      ...context
    },
    {
      actionRequired: true,
      userId: context.userId
    }
  );
}

export async function alertCronSystemFailure(
  cronJob: string,
  error: Error | string,
  context: { executionId?: string; duration?: number } = {}
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  await sendProductionAlert(
    'UNKNOWN_ERROR',
    `cron-${cronJob}`,
    `Cron job failure: ${errorMessage}`,
    {
      cronJob,
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : 'StringError',
      stack: error instanceof Error ? error.stack : undefined,
      ...context
    },
    {
      actionRequired: true,
      customSeverity: 'HIGH'
    }
  );
}

export async function alertDatabaseFailure(
  operation: string,
  error: Error | string,
  context: { userId?: string; query?: string; table?: string } = {}
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  await sendProductionAlert(
    'UNKNOWN_ERROR',
    'database',
    `Database operation failure: ${operation} - ${errorMessage}`,
    {
      operation,
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : 'StringError',
      ...context
    },
    {
      actionRequired: true,
      userId: context.userId,
      customSeverity: 'CRITICAL'
    }
  );
}

export async function alertRateLimitExceeded(
  service: string,
  limit: number,
  current: number,
  context: { userId?: string; timeWindow?: string } = {}
): Promise<void> {
  await sendProductionAlert(
    'RATE_LIMIT_ERROR',
    service,
    `Rate limit exceeded: ${current}/${limit} requests`,
    {
      limit,
      current,
      utilizationPercent: Math.round((current / limit) * 100),
      ...context
    },
    {
      userId: context.userId
    }
  );
}