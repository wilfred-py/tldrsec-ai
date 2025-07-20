/**
 * Email Notification Types
 * 
 * Shared types and interfaces for the notification system
 * Extracted to break circular dependencies
 */

import { EventEmitter } from 'events';

// Notification events
export enum NotificationEventType {
  NEW_FILING = 'new_filing',
  FILING_UPDATE = 'filing_update',
  SUMMARY_READY = 'summary_ready'
}

// Email notification preferences
export enum NotificationPreference {
  IMMEDIATE = 'immediate',
  DAILY = 'daily',
  NONE = 'none'
}

// Filing notification payload
export interface FilingNotificationPayload {
  filingId: string;
  ticker: string;
  companyName: string;
  formType: string;
  filingDate: Date;
  description?: string;
  summaryId?: string;
  summaryText?: string;
  summaryData?: any; // JSON data from the summary
  priorityLevel?: 'high' | 'medium' | 'low';
  url?: string;
}

// User notification preferences type
export interface UserNotificationPreferences {
  userId: string;
  email: string;
  emailNotificationPreference: NotificationPreference;
  watchedTickers?: string[]; // Tickers the user is specifically watching
  watchedFormTypes?: string[]; // Form types the user wants to be notified about
}

// Email sender interface for dependency injection
export interface EmailSender {
  sendEmail(message: any, options?: any): Promise<any>;
}

// Notification service interface
export interface NotificationServiceInterface {
  sendImmediateNotification(payload: FilingNotificationPayload): Promise<void>;
  handleNewFilingEvent(payload: FilingNotificationPayload): Promise<void>;
  handleFilingUpdateEvent(payload: FilingNotificationPayload): Promise<void>;
  handleSummaryReadyEvent(payload: FilingNotificationPayload): Promise<void>;
}

// Notification processor interface
export interface NotificationProcessorInterface {
  processNotification(payload: any): Promise<void>;
  queueNotification(payload: any): Promise<void>;
}

// Notification integration interface
export interface NotificationIntegrationInterface {
  sendNotification(payload: any): Promise<void>;
  registerHandler(handler: (payload: any) => Promise<void>): void;
}

/**
 * Global notification event emitter
 */
export const notificationEvents = new EventEmitter();
