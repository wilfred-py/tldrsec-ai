/**
 * Notification Integration
 * 
 * Connects the SEC Edgar filing system with the notification system,
 * triggering events when new filings are created or updated.
 */

import { ParsedFiling } from '../sec-edgar/types';
import { 
  notificationEvents, 
  NotificationEventType,
  FilingNotificationPayload
} from './notification-service';
import { notificationProcessor } from './notification-processor';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

/**
 * Initialize notification integration with the filing system
 */
export function initNotificationIntegration(): void {
  // Start the notification processor
  notificationProcessor.start();
  
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
    logger.error('Error triggering new filing notification', error, {
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
    logger.error('Error triggering filing update notification', error, {
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
    logger.error('Error triggering summary ready notification', error, {
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
export function stopNotificationIntegration(): void {
  // Stop the notification processor
  notificationProcessor.stop();
  
  logger.info('Notification integration stopped');
}

// Export integration components
export {
  notificationEvents,
  notificationProcessor
}; 