/**
 * Notification Integration
 * 
 * Connects the SEC Edgar filing system with the notification system,
 * triggering events when new filings are created or updated.
 * 
 * Refactored to break circular dependencies
 */

import { ParsedFiling } from '../sec-edgar/types';
import { 
  notificationEvents, 
  NotificationEventType,
  FilingNotificationPayload,
  NotificationIntegrationInterface
} from './notification-types';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

// Use lazy loading for notification processor to break circular dependency
let notificationProcessorInstance: Record<string, unknown> | null = null;

const getNotificationProcessor = async () => {
  if (!notificationProcessorInstance) {
    const { notificationProcessor } = await import('./notification-processor');
    notificationProcessorInstance = notificationProcessor;
  }
  return notificationProcessorInstance;
};

/**
 * Initialize notification integration with the filing system
 */
export async function initNotificationIntegration(): Promise<void> {
  // Start the notification processor using lazy loading
  const processor = await getNotificationProcessor();
  processor.start();
  
  logger.info('Notification integration initialized');
}

/**
 * Trigger a notification for a new filing
 * @param filing The newly parsed filing
 */
export function notifyNewFiling(filing: ParsedFiling): void {
  try {
    monitoring.incrementCounter('notification.trigger.new_filing', 1);
    logger.info(`Triggering notification for new filing: ${filing.ticker} - ${filing.filingType}`, {
      filingId: filing.id,
      ticker: filing.ticker,
      formType: filing.filingType
    });
    
    // Convert filing to notification payload
    const payload = convertFilingToPayload(filing);
    
    // Emit event
    notificationEvents.emit(NotificationEventType.NEW_FILING, payload);
  } catch (error) {
    logger.error('Error triggering new filing notification', {
      error: error instanceof Error ? error.message : String(error),
      filingId: filing.id,
      ticker: filing.ticker
    });
    monitoring.incrementCounter('notification.error.trigger_new', 1);
  }
}

/**
 * Trigger a notification for a filing update
 * @param filing The updated filing
 */
export function notifyFilingUpdate(filing: ParsedFiling): void {
  try {
    monitoring.incrementCounter('notification.trigger.filing_update', 1);
    logger.info(`Triggering notification for filing update: ${filing.ticker} - ${filing.filingType}`, {
      filingId: filing.id,
      ticker: filing.ticker,
      formType: filing.filingType
    });
    
    // Convert filing to notification payload
    const payload = convertFilingToPayload(filing);
    
    // Emit event
    notificationEvents.emit(NotificationEventType.FILING_UPDATE, payload);
  } catch (error) {
    logger.error('Error triggering filing update notification', {
      error: error instanceof Error ? error.message : String(error),
      filingId: filing.id,
      ticker: filing.ticker
    });
    monitoring.incrementCounter('notification.error.trigger_update', 1);
  }
}

/**
 * Trigger a notification when a summary is ready
 * @param filing The filing with summary
 * @param summaryId ID of the summary
 * @param summaryText Text of the summary
 */
export function notifySummaryReady(
  filing: ParsedFiling, 
  summaryId: string, 
  summaryText: string
): void {
  try {
    monitoring.incrementCounter('notification.trigger.summary_ready', 1);
    logger.info(`Triggering notification for summary ready: ${filing.ticker} - ${filing.filingType}`, {
      filingId: filing.id,
      summaryId,
      ticker: filing.ticker,
      formType: filing.filingType
    });
    
    // Convert filing to notification payload and add summary
    const payload = convertFilingToPayload(filing);
    payload.summaryId = summaryId;
    payload.summaryText = summaryText;
    
    // Emit event
    notificationEvents.emit(NotificationEventType.SUMMARY_READY, payload);
  } catch (error) {
    logger.error('Error triggering summary ready notification', {
      error: error instanceof Error ? error.message : String(error),
      filingId: filing.id,
      summaryId,
      ticker: filing.ticker
    });
    monitoring.incrementCounter('notification.error.trigger_summary', 1);
  }
}

/**
 * Convert a ParsedFiling to a FilingNotificationPayload
 * @param filing The parsed filing to convert
 * @returns Notification payload
 */
function convertFilingToPayload(filing: ParsedFiling): FilingNotificationPayload {
  return {
    filingId: filing.id || `filing-${filing.ticker}-${filing.filingType}-${Date.now()}`,
    ticker: filing.ticker,
    companyName: filing.companyName,
    formType: filing.filingType,
    filingDate: filing.filingDate,
    description: filing.description,
    url: filing.url || filing.filingUrl
  };
}

/**
 * Stop the notification integration
 */
export async function stopNotificationIntegration(): Promise<void> {
  // Stop the notification processor using lazy loading
  const processor = await getNotificationProcessor();
  processor.stop();
  
  logger.info('Notification integration stopped');
}

// Create and export the notification integration singleton
class NotificationIntegration implements NotificationIntegrationInterface {
  async sendNotification(payload: Record<string, unknown>): Promise<void> {
    const processor = await getNotificationProcessor();
    return processor.processNotification(payload);
  }
  
  registerHandler(handler: (payload: Record<string, unknown>) => Promise<void>): void {
    // Implementation for registering custom handlers
    notificationEvents.on('custom_notification', handler);
  }
}

export const notificationIntegration = new NotificationIntegration();

// Export notification events
export { notificationEvents };