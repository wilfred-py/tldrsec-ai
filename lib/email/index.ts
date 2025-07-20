/**
 * Email client module
 * 
 * Provides functionality for sending emails
 * Refactored to break circular dependencies
 */

// Import core functionality from email-core.ts
import { emailClient, sendEmail, ResendClient } from './email-core';

// Re-export core functionality
export { emailClient, sendEmail, ResendClient };

// Re-export types
export * from './types';
export { resendConfig } from './config';

// Export notification types to avoid circular dependencies
export type {
  FilingNotificationPayload,
  UserNotificationPreferences
} from './notification-types';

export {
  NotificationEventType,
  NotificationPreference,
  notificationEvents
} from './notification-types';

// Use lazy loading for notification components to break circular dependencies
export const getNotificationService = async () => {
  const { notificationService } = await import('./notification-service');
  return notificationService;
};

export const getNotificationProcessor = async () => {
  const { notificationProcessor } = await import('./notification-processor');
  return notificationProcessor;
};

export const getNotificationIntegration = async () => {
  const { notificationIntegration } = await import('./notification-integration');
  return notificationIntegration;
};