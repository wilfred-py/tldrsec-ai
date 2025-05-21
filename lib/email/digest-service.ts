/**
 * Daily Digest Email Service
 * 
 * Handles the compilation and sending of daily digest emails containing
 * filing summaries grouped by ticker for users who prefer digests over
 * immediate notifications.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { ResendClient, sendEmail } from './index';
import { EmailMessage, EmailType } from './types';
import { JobQueueService, JobType } from '../job-queue';
import { NotificationPreference, UserNotificationPreferences } from './notification-service';
import { getEmailTemplate, BaseTemplateData, FilingTemplateData } from './templates';
import { v4 as uuidv4 } from 'uuid';

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Summary item interface for digest emails
 */
export interface DigestSummaryItem {
  id: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  summaryText: string;
  summaryJSON?: any;
  createdAt: Date;
}

/**
 * Interface for ticker grouped summaries in digest
 */
export interface TickerDigestGroup {
  symbol: string;
  companyName: string;
  summaries: DigestSummaryItem[];
}

/**
 * Interface for user digest data
 */
export interface UserDigestData {
  userId: string;
  email: string;
  name?: string;
  tickerGroups: TickerDigestGroup[];
}

// Extend EmailMessage to include metadata
declare module './types' {
  interface EmailMessage {
    metadata?: {
      userId: string;
      type: string;
      summaryCount: number;
      tickerCount: number;
      [key: string]: any;
    };
  }
}

/**
 * Daily Digest Service class
 */
export class DigestService {
  private static instance: DigestService;
  private emailClient: ResendClient;
  
  constructor(emailClient?: ResendClient) {
    this.emailClient = emailClient || new ResendClient();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(emailClient?: ResendClient): DigestService {
    if (!DigestService.instance) {
      DigestService.instance = new DigestService(emailClient);
    }
    return DigestService.instance;
  }
  
  /**
   * Schedule a digest compilation for all users with DAILY preference
   * @param runImmediately Whether to run the compilation immediately after scheduling
   */
  async scheduleDigestCompilation(runImmediately: boolean = false): Promise<void> {
    try {
      logger.info('Scheduling digest compilation job');
      
      // Add to job queue for processing
      const job = await JobQueueService.addJob({
        jobType: 'COMPILE_DAILY_DIGEST' as JobType,
        payload: {
          scheduledAt: new Date().toISOString(),
        },
        priority: 7, // Higher priority than regular notifications
        idempotencyKey: `daily-digest-${new Date().toISOString().split('T')[0]}` // One per day
      });
      
      logger.info('Digest compilation job scheduled', { jobId: job.id });
      monitoring.incrementCounter('digest.job.scheduled', 1);
      
      if (runImmediately) {
        await this.compileAndSendDigests();
      }
    } catch (error) {
      logger.error('Error scheduling digest compilation', error);
      monitoring.incrementCounter('digest.job.schedule_error', 1);
      throw error;
    }
  }
  
  /**
   * Compile and send digests for all eligible users
   */
  async compileAndSendDigests(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting daily digest compilation');
    monitoring.startTimer('digest.compilation');
    
    try {
      // Get all users who prefer digest emails
      const users = await this.getUsersWithDigestPreference();
      
      logger.info(`Found ${users.length} users with digest preference`);
      
      let successCount = 0;
      let emptyCount = 0;
      let errorCount = 0;
      
      // Process each user's digest
      for (const user of users) {
        try {
          // Get unsent summaries for this user from the last 24 hours
          const digestData = await this.compileUserDigest(user.userId);
          
          // Skip if no summaries
          if (digestData.tickerGroups.length === 0 || 
              digestData.tickerGroups.every(g => g.summaries.length === 0)) {
            logger.debug(`No summaries for digest for user ${user.userId}`);
            emptyCount++;
            continue;
          }
          
          // Send the digest email
          await this.sendDigestEmail(digestData);
          
          // Mark all summaries as sent
          await this.markSummariesAsSent(digestData);
          
          successCount++;
        } catch (error) {
          logger.error(`Error processing digest for user ${user.userId}`, error);
          monitoring.incrementCounter('digest.user.error', 1);
          errorCount++;
        }
      }
      
      const totalTime = Date.now() - startTime;
      monitoring.stopTimer('digest.compilation');
      
      logger.info('Daily digest compilation completed', { 
        totalUsers: users.length,
        successCount,
        emptyCount,
        errorCount,
        processingTimeMs: totalTime
      });
      
      // Track success and failure metrics
      monitoring.incrementCounter('digest.compilation.success', 1);
      monitoring.incrementCounter('digest.email.success', successCount);
      monitoring.incrementCounter('digest.email.empty', emptyCount);
      monitoring.incrementCounter('digest.email.error', errorCount);
      monitoring.recordValue('digest.compilation.time_ms', totalTime);
    } catch (error) {
      monitoring.stopTimer('digest.compilation');
      logger.error('Error in digest compilation process', error);
      monitoring.incrementCounter('digest.compilation.error', 1);
      throw error;
    }
  }
  
  /**
   * Get all users with daily digest preference
   */
  private async getUsersWithDigestPreference(): Promise<UserNotificationPreferences[]> {
    try {
      // Query users with digest preference
      const users = await prisma.user.findMany({
        where: {
          // Match JSON field preference
          preferences: {
            path: ['emailNotificationPreference'],
            equals: NotificationPreference.DAILY
          }
        },
        select: {
          id: true,
          email: true,
          name: true,
          preferences: true
        }
      });
      
      // Format to UserNotificationPreferences
      return users.map((user: {
        id: string;
        email: string;
        name?: string;
        preferences: any;
      }) => {
        const preferences = user.preferences as any || {};
        
        return {
          userId: user.id,
          email: user.email,
          name: user.name,
          emailNotificationPreference: NotificationPreference.DAILY,
          watchedTickers: preferences.watchedTickers || [],
          watchedFormTypes: preferences.watchedFormTypes || []
        };
      });
    } catch (error) {
      logger.error('Error getting users with digest preference', error);
      throw error;
    }
  }
  
  /**
   * Compile digest data for a specific user
   * @param userId User ID
   * @param timeframeHours Hours to look back for summaries (default: 24)
   */
  private async compileUserDigest(
    userId: string, 
    timeframeHours: number = 24
  ): Promise<UserDigestData> {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - timeframeHours);
      
      // Get user data first
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true
        }
      });
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Get all tickers followed by this user with their unsent summaries
      const tickers = await prisma.ticker.findMany({
        where: {
          userId: userId
        },
        select: {
          id: true,
          symbol: true,
          companyName: true,
          summaries: {
            where: {
              sentToUser: false,
              createdAt: {
                gte: startTime
              }
            },
            orderBy: [
              { filingDate: 'desc' }
            ]
          }
        }
      });
      
      // Format the data into ticker groups
      const tickerGroups: TickerDigestGroup[] = tickers
        .filter((ticker: { summaries: any[] }) => ticker.summaries.length > 0)
        .map((ticker: { 
          symbol: string; 
          companyName: string; 
          summaries: any[] 
        }) => ({
          symbol: ticker.symbol,
          companyName: ticker.companyName,
          summaries: ticker.summaries.map((summary: {
            id: string;
            filingType: string;
            filingDate: Date;
            filingUrl: string;
            summaryText: string;
            summaryJSON: any;
            createdAt: Date;
          }) => ({
            id: summary.id,
            filingType: summary.filingType,
            filingDate: summary.filingDate,
            filingUrl: summary.filingUrl,
            summaryText: summary.summaryText,
            summaryJSON: summary.summaryJSON,
            createdAt: summary.createdAt
          }))
        }));
      
      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        tickerGroups
      };
    } catch (error) {
      logger.error(`Error compiling digest for user ${userId}`, error);
      throw error;
    }
  }
  
  /**
   * Send digest email to a user
   * @param digestData User digest data
   */
  private async sendDigestEmail(digestData: UserDigestData): Promise<void> {
    try {
      // Start timing the email sending process
      const timer = monitoring.startTimer('digest.email.sendTime');
      
      // Generate email content from digest data
      const emailContent = this.formatDigestEmail(digestData);
      
      // Create email message with tags for tracking
      const message: EmailMessage = {
        to: {
          email: digestData.email,
          name: digestData.name || undefined
        },
        from: 'digest@tldrsec.com',
        subject: `Your Daily SEC Filings Digest - ${new Date().toLocaleDateString()}`,
        html: emailContent.html,
        text: emailContent.text,
        tags: [
          'type:digest',
          'frequency:daily',
          `summaries:${this.countSummaries(digestData)}`,
          `tickers:${digestData.tickerGroups.length}`
        ],
        metadata: {
          userId: digestData.userId,
          type: 'daily-digest',
          summaryCount: this.countSummaries(digestData),
          tickerCount: digestData.tickerGroups.length
        }
      };
      
      // Send the email
      const result = await sendEmail(message);
      
      // Stop timer
      monitoring.stopTimer(timer);
      
      if (!result.success) {
        throw new Error(`Failed to send digest email: ${result.error?.message}`);
      }
      
      logger.info(`Digest email sent to ${digestData.email}`, {
        userId: digestData.userId,
        summaryCount: this.countSummaries(digestData),
        emailId: result.id
      });
      
      // Record metrics
      monitoring.incrementCounter('digest.email.sent', 1);
      monitoring.recordValue('digest.email.summaryCount', this.countSummaries(digestData));
      monitoring.recordValue('digest.email.tickerCount', digestData.tickerGroups.length);
      
      // Record in database that we sent this digest notification
      try {
        await prisma.sentDigest.create({
          data: {
            id: uuidv4(),
            userId: digestData.userId,
            emailId: result.id,
            summaryCount: this.countSummaries(digestData),
            tickerCount: digestData.tickerGroups.length,
            sentAt: new Date()
          }
        });
      } catch (dbError) {
        // Log but don't fail if we can't record the sent digest
        logger.error('Error recording sent digest in database', dbError, {
          userId: digestData.userId
        });
      }
    } catch (error) {
      logger.error(`Error sending digest email to ${digestData.email}`, error);
      monitoring.incrementCounter('digest.email.error', 1);
      throw error;
    }
  }
  
  /**
   * Mark all summaries in a digest as sent
   * @param digestData User digest data
   */
  private async markSummariesAsSent(digestData: UserDigestData): Promise<void> {
    try {
      // Collect all summary IDs
      const summaryIds = digestData.tickerGroups.flatMap(group => 
        group.summaries.map(summary => summary.id)
      );
      
      if (summaryIds.length === 0) {
        return;
      }
      
      // Update all summaries at once
      await prisma.summary.updateMany({
        where: {
          id: {
            in: summaryIds
          }
        },
        data: {
          sentToUser: true
        }
      });
      
      logger.info(`Marked ${summaryIds.length} summaries as sent`, {
        userId: digestData.userId
      });
    } catch (error) {
      logger.error(`Error marking summaries as sent for user ${digestData.userId}`, error);
      throw error;
    }
  }
  
  /**
   * Format digest email content
   * @param digestData User digest data
   */
  private formatDigestEmail(digestData: UserDigestData): { html: string, text: string } {
    try {
      // Get base URL for links
      const baseUrl = process.env.SITE_URL || 'https://tldrsec.com';
      
      // Prepare base template data
      const baseTemplateData: BaseTemplateData = {
        recipientName: digestData.name,
        recipientEmail: digestData.email,
        preferencesUrl: `${baseUrl}/settings`,
        unsubscribeUrl: `${baseUrl}/unsubscribe?email=${encodeURIComponent(digestData.email)}&type=digest`
      };
      
      // Convert our digest format to template format
      const templateData = {
        ...baseTemplateData,
        tickerGroups: digestData.tickerGroups.map(group => ({
          symbol: group.symbol,
          companyName: group.companyName,
          filings: group.summaries.map(summary => ({
            symbol: group.symbol,
            companyName: group.companyName,
            filingType: summary.filingType,
            filingDate: summary.filingDate,
            filingUrl: summary.filingUrl,
            summaryUrl: `${baseUrl}/summary/${summary.id}`,
            summaryId: summary.id,
            summaryText: summary.summaryText,
            summaryData: summary.summaryJSON
          } as FilingTemplateData))
        }))
      };
      
      // Use template system to generate email
      return getEmailTemplate(EmailType.DIGEST, templateData);
    } catch (error) {
      logger.error('Error using template system for digest email, falling back to default', error);
      
      // If template generation fails, fall back to the original implementation
      return this.formatDigestEmailFallback(digestData);
    }
  }
  
  /**
   * Fallback for digest email formatting if template system fails
   * @param digestData User digest data
   */
  private formatDigestEmailFallback(digestData: UserDigestData): { html: string, text: string } {
    // Count total summaries for display
    const totalSummaries = this.countSummaries(digestData);
    
    // Generate HTML version
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Daily SEC Filings Digest</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            color: #2c3e50;
            margin-bottom: 20px;
          }
          h2 {
            color: #3498db;
            margin-top: 30px;
            padding-bottom: 5px;
            border-bottom: 1px solid #eee;
          }
          h3 {
            margin-top: 20px;
            color: #2c3e50;
          }
          .filing-card {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid #eee;
            border-radius: 5px;
            background-color: #fafafa;
          }
          .filing-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
          }
          .filing-type {
            font-weight: bold;
            color: #3498db;
          }
          .filing-date {
            color: #7f8c8d;
            font-size: 0.9em;
          }
          .key-insight {
            margin-top: 10px;
            font-style: italic;
          }
          a {
            color: #2980b9;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #eee;
            font-size: 0.8em;
            color: #7f8c8d;
          }
        </style>
      </head>
      <body>
        <h1>Your Daily SEC Filings Digest</h1>
        <p>Hello ${digestData.name || ''}${digestData.name ? ',' : ''}</p>
        <p>Here's a summary of the latest ${totalSummaries} SEC filing${totalSummaries !== 1 ? 's' : ''} for your tracked companies:</p>
    `;
    
    // Add ticker sections
    for (const tickerGroup of digestData.tickerGroups) {
      html += `
        <h2>${tickerGroup.symbol} - ${tickerGroup.companyName}</h2>
      `;
      
      // Add summaries for this ticker
      for (const summary of tickerGroup.summaries) {
        const formattedDate = new Date(summary.filingDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        
        html += `
          <div class="filing-card">
            <div class="filing-header">
              <span class="filing-type">${summary.filingType}</span>
              <span class="filing-date">${formattedDate}</span>
            </div>
            <p><a href="${summary.filingUrl}" target="_blank">View Original Filing</a></p>
        `;
        
        // Add summary content based on filing type and available data
        if (summary.summaryJSON) {
          const json = summary.summaryJSON;
          
          if (summary.filingType === '10-K' || summary.filingType === '10-Q') {
            html += `
              <p><strong>Period:</strong> ${json.period || 'N/A'}</p>
            `;
            
            if (json.insights && json.insights.length > 0) {
              html += `
                <p class="key-insight"><strong>Key Insight:</strong> ${json.insights[0]}</p>
              `;
            }
          } else if (summary.filingType === '8-K') {
            html += `
              <p><strong>Event:</strong> ${json.eventType || 'N/A'}</p>
              <p>${json.summary || ''}</p>
            `;
          } else if (summary.filingType === 'Form4') {
            html += `
              <p><strong>Insider:</strong> ${json.filerName || 'N/A'}</p>
              <p>${json.summary || ''}</p>
            `;
          }
        } else {
          // Fallback to plain text summary (truncated)
          const snippet = summary.summaryText.substring(0, 150) + 
            (summary.summaryText.length > 150 ? '...' : '');
          html += `<p>${snippet}</p>`;
        }
        
        // Add link to view full summary
        html += `
            <p><a href="https://tldrsec.com/summary/${summary.id}" target="_blank">View Full Summary</a></p>
          </div>
        `;
      }
    }
    
    // Add footer
    html += `
        <div class="footer">
          <p>You received this digest because you're subscribed to daily updates on tldrSEC.</p>
          <p><a href="https://tldrsec.com/settings">Manage your notification preferences</a> | <a href="https://tldrsec.com/unsubscribe?email=${encodeURIComponent(digestData.email)}&type=digest">Unsubscribe</a></p>
        </div>
      </body>
      </html>
    `;
    
    // Generate plain text version
    let text = `Your Daily SEC Filings Digest\n\n`;
    text += `Hello ${digestData.name || ''}\n\n`;
    text += `Here's a summary of the latest ${totalSummaries} SEC filing${totalSummaries !== 1 ? 's' : ''} for your tracked companies:\n\n`;
    
    // Add ticker sections
    for (const tickerGroup of digestData.tickerGroups) {
      text += `${tickerGroup.symbol} - ${tickerGroup.companyName}\n`;
      text += `${'='.repeat(tickerGroup.symbol.length + tickerGroup.companyName.length + 3)}\n\n`;
      
      // Add summaries for this ticker
      for (const summary of tickerGroup.summaries) {
        const formattedDate = new Date(summary.filingDate).toLocaleDateString();
        
        text += `${summary.filingType} - ${formattedDate}\n`;
        text += `Original Filing: ${summary.filingUrl}\n`;
        
        // Add summary content based on filing type and available data
        if (summary.summaryJSON) {
          const json = summary.summaryJSON;
          
          if (summary.filingType === '10-K' || summary.filingType === '10-Q') {
            text += `Period: ${json.period || 'N/A'}\n`;
            
            if (json.insights && json.insights.length > 0) {
              text += `Key Insight: ${json.insights[0]}\n`;
            }
          } else if (summary.filingType === '8-K') {
            text += `Event: ${json.eventType || 'N/A'}\n`;
            text += `${json.summary || ''}\n`;
          } else if (summary.filingType === 'Form4') {
            text += `Insider: ${json.filerName || 'N/A'}\n`;
            text += `${json.summary || ''}\n`;
          }
        } else {
          // Fallback to plain text summary (truncated)
          const snippet = summary.summaryText.substring(0, 150) + 
            (summary.summaryText.length > 150 ? '...' : '');
          text += `${snippet}\n`;
        }
        
        text += `View Full Summary: https://tldrsec.com/summary/${summary.id}\n\n`;
      }
      
      text += '\n';
    }
    
    // Add footer
    text += `\n---------------------------------\n`;
    text += `You received this digest because you're subscribed to daily updates on tldrSEC.\n`;
    text += `Manage your preferences: https://tldrsec.com/settings\n`;
    text += `Unsubscribe: https://tldrsec.com/unsubscribe?email=${encodeURIComponent(digestData.email)}&type=digest\n`;
    
    return { html, text };
  }
  
  /**
   * Count total summaries in a digest
   * @param digestData User digest data
   */
  private countSummaries(digestData: UserDigestData): number {
    return digestData.tickerGroups.reduce(
      (total, group) => total + group.summaries.length, 
      0
    );
  }
}

// Create singleton instance for easy import
export const digestService = DigestService.getInstance(); 