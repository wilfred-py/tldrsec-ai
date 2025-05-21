/**
 * Email Notification Service
 * 
 * Handles sending notifications for SEC filings based on user preferences.
 * Supports immediate notifications and daily digests.
 */

import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ResendClient, sendEmail } from './index';
import { EmailType, EmailMessage } from './types';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { JobQueueService, JobType } from '../job-queue';
import { 
  getEmailTemplate, 
  FilingTemplateData, 
  BaseTemplateData 
} from './templates';

// Initialize Prisma client
const prisma = new PrismaClient();

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

/**
 * Global notification event emitter
 */
export const notificationEvents = new EventEmitter();

/**
 * Email Notification Service
 * Handles sending notifications about filings to users
 */
export class NotificationService {
  private static instance: NotificationService;
  private emailClient: ResendClient;
  
  constructor(emailClient?: ResendClient) {
    // Use provided client or default
    this.emailClient = emailClient || new ResendClient();
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(emailClient?: ResendClient): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService(emailClient);
    }
    return NotificationService.instance;
  }
  
  /**
   * Set up event listeners for filing notifications
   */
  private setupEventListeners(): void {
    // Listen for new filing events
    notificationEvents.on(
      NotificationEventType.NEW_FILING,
      this.handleNewFilingEvent.bind(this)
    );
    
    // Listen for filing updates
    notificationEvents.on(
      NotificationEventType.FILING_UPDATE,
      this.handleFilingUpdateEvent.bind(this)
    );
    
    // Listen for summary ready events
    notificationEvents.on(
      NotificationEventType.SUMMARY_READY,
      this.handleSummaryReadyEvent.bind(this)
    );
    
    logger.info('Notification service initialized with event listeners');
  }
  
  /**
   * Handle new filing event
   * @param payload Filing notification payload
   */
  private async handleNewFilingEvent(payload: FilingNotificationPayload): Promise<void> {
    try {
      logger.info(`Processing new filing notification for ${payload.ticker} - ${payload.formType}`, { 
        filingId: payload.filingId,
        ticker: payload.ticker
      });
      
      // Add to job queue for processing
      await JobQueueService.addJob({
        jobType: 'SEND_FILING_NOTIFICATION' as JobType,
        payload: {
          notificationType: NotificationEventType.NEW_FILING,
          filing: payload
        },
        priority: this.getNotificationPriority(payload),
        idempotencyKey: `filing-notification-${payload.filingId}`
      });
      
      monitoring.incrementCounter('notification.event.new_filing', 1);
    } catch (error) {
      logger.error('Error handling new filing event', error, { filingId: payload.filingId });
      monitoring.incrementCounter('notification.error.new_filing', 1);
    }
  }
  
  /**
   * Handle filing update event
   * @param payload Filing notification payload
   */
  private async handleFilingUpdateEvent(payload: FilingNotificationPayload): Promise<void> {
    try {
      logger.info(`Processing filing update notification for ${payload.ticker} - ${payload.formType}`, { 
        filingId: payload.filingId,
        ticker: payload.ticker
      });
      
      // Add to job queue for processing
      await JobQueueService.addJob({
        jobType: 'SEND_FILING_NOTIFICATION' as JobType,
        payload: {
          notificationType: NotificationEventType.FILING_UPDATE,
          filing: payload
        },
        priority: this.getNotificationPriority(payload),
        idempotencyKey: `filing-update-${payload.filingId}`
      });
      
      monitoring.incrementCounter('notification.event.filing_update', 1);
    } catch (error) {
      logger.error('Error handling filing update event', error, { filingId: payload.filingId });
      monitoring.incrementCounter('notification.error.filing_update', 1);
    }
  }
  
  /**
   * Handle summary ready event
   * @param payload Filing notification payload with summary
   */
  private async handleSummaryReadyEvent(payload: FilingNotificationPayload): Promise<void> {
    try {
      logger.info(`Processing summary ready notification for ${payload.ticker} - ${payload.formType}`, { 
        filingId: payload.filingId,
        summaryId: payload.summaryId,
        ticker: payload.ticker
      });
      
      // Add to job queue for processing
      await JobQueueService.addJob({
        jobType: 'SEND_FILING_NOTIFICATION' as JobType,
        payload: {
          notificationType: NotificationEventType.SUMMARY_READY,
          filing: payload
        },
        priority: this.getNotificationPriority(payload),
        idempotencyKey: `summary-ready-${payload.summaryId || payload.filingId}`
      });
      
      monitoring.incrementCounter('notification.event.summary_ready', 1);
    } catch (error) {
      logger.error('Error handling summary ready event', error, { 
        filingId: payload.filingId,
        summaryId: payload.summaryId
      });
      monitoring.incrementCounter('notification.error.summary_ready', 1);
    }
  }
  
  /**
   * Determine notification priority based on filing type
   * @param payload Filing notification payload
   * @returns Priority number (higher is more important)
   */
  private getNotificationPriority(payload: FilingNotificationPayload): number {
    // User-defined priority level
    if (payload.priorityLevel) {
      switch (payload.priorityLevel) {
        case 'high': return 10;
        case 'medium': return 5;
        case 'low': return 3;
      }
    }
    
    // Default priority based on form type
    const formType = payload.formType.toUpperCase();
    
    // 8-K is highest priority (material events)
    if (formType.includes('8-K')) return 8;
    
    // 10-Q, 10-K are important but not urgent
    if (formType.includes('10-Q') || formType.includes('10-K')) return 6;
    
    // Form 4 (insider trading) medium priority
    if (formType.includes('FORM 4')) return 5;
    
    // Other forms lower priority
    return 3;
  }
  
  /**
   * Send an immediate notification for a filing
   * @param payload Filing notification payload
   */
  async sendImmediateNotification(payload: FilingNotificationPayload): Promise<void> {
    try {
      // Start timing for metrics
      const startTime = Date.now();
      monitoring.startTimer('notification.immediate.send');
      
      // Get users who should receive this notification
      const recipients = await this.getImmediateNotificationRecipients(payload);
      
      if (recipients.length === 0) {
        logger.info('No recipients for immediate notification', { 
          filingId: payload.filingId, 
          ticker: payload.ticker 
        });
        monitoring.incrementCounter('notification.immediate.no_recipients', 1);
        return;
      }
      
      logger.info(`Sending immediate notifications to ${recipients.length} recipients`, {
        filingId: payload.filingId,
        ticker: payload.ticker,
        recipientCount: recipients.length
      });
      
      // Prepare and send the notification to each recipient
      const notificationPromises = recipients.map(recipient => 
        this.sendSingleImmediateNotification(recipient, payload)
      );
      
      // Wait for all notifications to be sent
      const results = await Promise.allSettled(notificationPromises);
      
      // Count successes and failures
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      // Record metrics
      monitoring.stopTimer('notification.immediate.send');
      monitoring.recordValue('notification.immediate.duration', Date.now() - startTime);
      monitoring.incrementCounter('notification.immediate.sent', successful);
      monitoring.incrementCounter('notification.immediate.failed', failed);
      
      logger.info(`Sent ${successful} immediate notifications (${failed} failed)`, {
        filingId: payload.filingId,
        ticker: payload.ticker,
        successful,
        failed
      });
    } catch (error) {
      logger.error('Error sending immediate notifications', error, { 
        filingId: payload.filingId, 
        ticker: payload.ticker
      });
      monitoring.incrementCounter('notification.immediate.error', 1);
    }
  }
  
  /**
   * Get users who should receive immediate notifications for this filing
   * @param payload Filing notification payload
   * @returns Array of user notification preferences
   */
  private async getImmediateNotificationRecipients(
    payload: FilingNotificationPayload
  ): Promise<UserNotificationPreferences[]> {
    try {
      // Get users who have immediate notification preference
      // AND either watch this ticker or don't have any specific ticker preferences
      const users = await prisma.user.findMany({
        where: {
          emailVerified: true,
          AND: [
            { notificationPreference: 'immediate' },
            {
              OR: [
                // User is watching this specific ticker
                {
                  watchedTickers: {
                    has: payload.ticker.toUpperCase()
                  }
                },
                // User has no watched tickers (watches all)
                {
                  watchedTickers: {
                    isEmpty: true
                  }
                }
              ]
            },
            {
              OR: [
                // User is watching this form type
                {
                  watchedFormTypes: {
                    has: payload.formType.toUpperCase()
                  }
                },
                // User has no watched form types (watches all)
                {
                  watchedFormTypes: {
                    isEmpty: true
                  }
                }
              ]
            }
          ]
        },
        select: {
          id: true,
          email: true,
          notificationPreference: true,
          watchedTickers: true,
          watchedFormTypes: true
        }
      });
      
      // Map to user preferences
      return users.map((user: any) => ({
        userId: user.id,
        email: user.email,
        emailNotificationPreference: user.notificationPreference as NotificationPreference,
        watchedTickers: user.watchedTickers as string[],
        watchedFormTypes: user.watchedFormTypes as string[]
      }));
    } catch (error) {
      logger.error('Error getting notification recipients', error, {
        filingId: payload.filingId,
        ticker: payload.ticker
      });
      return [];
    }
  }
  
  /**
   * Send a single immediate notification to a recipient
   * @param recipient User notification preferences
   * @param payload Filing notification payload
   */
  private async sendSingleImmediateNotification(
    recipient: UserNotificationPreferences,
    payload: FilingNotificationPayload
  ): Promise<void> {
    try {
      // Prepare email content
      const subject = this.getNotificationSubject(payload);
      
      // Get email content
      const { html, text } = this.generateNotificationContent(payload);
      
      // Prepare email message
      const message: EmailMessage = {
        to: recipient.email,
        subject,
        html,
        text,
        tags: [
          'type:immediate',
          `ticker:${payload.ticker}`,
          `form:${payload.formType}`
        ],
        metadata: {
          userId: recipient.userId,
          type: 'immediate',
          summaryCount: 1,
          tickerCount: 1,
          tickerId: payload.ticker,
          filingId: payload.filingId,
          formType: payload.formType
        }
      };
      
      // Send email
      const result = await sendEmail(message);
      
      if (!result.success) {
        throw new Error(`Failed to send notification: ${result.error?.message}`);
      }
      
      // Log success
      logger.info(`Sent immediate notification to ${recipient.email}`, {
        userId: recipient.userId,
        filingId: payload.filingId,
        emailId: result.id
      });
      
      // Record in database that we sent this notification
      await prisma.sentNotification.create({
        data: {
          id: uuidv4(),
          userId: recipient.userId,
          filingId: payload.filingId,
          type: NotificationEventType.NEW_FILING,
          emailId: result.id,
          sentAt: new Date()
        }
      });
    } catch (error) {
      logger.error(`Failed to send notification to ${recipient.email}`, error, {
        userId: recipient.userId,
        filingId: payload.filingId
      });
      throw error; // Rethrow to be caught by Promise.allSettled
    }
  }
  
  /**
   * Get notification subject line
   * @param payload Filing notification payload
   * @returns Email subject
   */
  private getNotificationSubject(payload: FilingNotificationPayload): string {
    const eventType = payload.summaryId 
      ? 'Summary Available'
      : 'New Filing';
    
    return `${payload.ticker}: ${payload.formType} ${eventType} - ${payload.companyName}`;
  }
  
  /**
   * Generate notification content for email
   * @param payload Filing notification payload
   * @returns HTML and text content
   */
  private generateNotificationContent(
    payload: FilingNotificationPayload
  ): { html: string, text: string } {
    try {
      // Log that we're using the template system
      logger.debug('Generating email content using template system', {
        ticker: payload.ticker,
        formType: payload.formType,
        hasDetails: !!payload.summaryId
      });
      
      // Get the site URL from env or use default
      const baseUrl = process.env.SITE_URL || 'https://tldrsec.com';
      
      // Prepare template data for the filing
      const filingData: FilingTemplateData = {
        symbol: payload.ticker,
        companyName: payload.companyName,
        filingType: payload.formType,
        filingDate: payload.filingDate,
        filingUrl: payload.url || `https://www.sec.gov/edgar/search/#/entityName=${encodeURIComponent(payload.companyName)}`,
        summaryId: payload.summaryId || payload.filingId,
        summaryUrl: `${baseUrl}/summary/${payload.summaryId || payload.filingId}`,
        summaryText: payload.summaryText,
        summaryData: payload.summaryData || null
      };
      
      // Prepare base template data
      const baseData: BaseTemplateData = {
        recipientEmail: 'user@example.com', // Will be replaced in sendSingleImmediateNotification
        preferencesUrl: `${baseUrl}/settings`,
        unsubscribeUrl: `${baseUrl}/unsubscribe`,
      };
      
      // Generate email content using the template system
      return getEmailTemplate(EmailType.IMMEDIATE, {
        ...baseData,
        filing: filingData
      });
    } catch (error) {
      logger.error('Error generating notification content using templates', error);
      
      // Fallback to simple content if template generation fails
      return this.generateSimpleNotificationContent(payload);
    }
  }
  
  /**
   * Generate simple notification content as fallback
   * @param payload Filing notification payload
   */
  private generateSimpleNotificationContent(
    payload: FilingNotificationPayload
  ): { html: string, text: string } {
    // Generate text version
    const textContent = [
      `${payload.companyName} (${payload.ticker})`,
      `Filing Type: ${payload.formType}`,
      `Date: ${payload.filingDate.toLocaleDateString()}`,
      '',
      payload.description || `A new ${payload.formType} filing has been submitted.`,
      '',
      payload.summaryText ? 'Summary:\n' + payload.summaryText + '\n' : '',
      payload.url ? `View filing: ${payload.url}` : ''
    ].join('\n');
    
    // Generate HTML version
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${payload.companyName} (${payload.ticker})</h2>
        <p><strong>Filing Type:</strong> ${payload.formType}</p>
        <p><strong>Date:</strong> ${payload.filingDate.toLocaleDateString()}</p>
        
        <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #2c7be5;">
          <p>${payload.description || `A new ${payload.formType} filing has been submitted.`}</p>
        </div>
        
        ${payload.summaryText ? `
          <h3>Summary</h3>
          <div style="padding: 10px; background-color: #f9f9f9; border: 1px solid #ddd; margin-bottom: 20px;">
            <p>${payload.summaryText.replace(/\n/g, '<br>')}</p>
          </div>
        ` : ''}
        
        ${payload.url ? `
          <p style="margin-top: 20px;">
            <a href="${payload.url}" 
               style="background-color: #2c7be5; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Filing
            </a>
          </p>
        ` : ''}
        
        <p style="margin-top: 30px; font-size: 12px; color: #666;">
          You're receiving this because you subscribed to immediate notifications for ${payload.ticker} filings.
          <br>
          <a href="https://tldrsec.ai/settings" style="color: #2c7be5;">Manage notification preferences</a>
        </p>
      </div>
    `;
    
    return {
      html: htmlContent,
      text: textContent
    };
  }
}

// Export the singleton instance
export const notificationService = NotificationService.getInstance();