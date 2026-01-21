'use server';

import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { getEmailTemplate } from './templates';
import { EmailType, EmailMessage } from './types';
import { sendEmail } from './index';
import { logger } from '../logging';
import { SecureEmailLogger } from './security-helpers';

// Create secure logger to prevent PII exposure
const secureLogger = new SecureEmailLogger(logger.child('welcome-service'));

/**
 * Queue a welcome email to be sent asynchronously (fire-and-forget)
 * This version takes pre-fetched user data to avoid redundant auth/DB calls
 *
 * @param userId - Database user ID (not Clerk ID)
 * @param email - User's email address
 * @param name - User's display name
 * @returns Promise that resolves when email is queued (not sent)
 */
export async function queueWelcomeEmail(
  userId: string,
  email: string,
  name: string
): Promise<void> {
  // Run email sending in background - don't block the caller
  setImmediate(async () => {
    try {
      // Get user's tracked tickers from DB
      const dbUser = await getPrismaClient().user.findUnique({
        where: { id: userId },
        include: { tickers: true }
      });

      if (!dbUser) {
        secureLogger.error('User not found for welcome email', { userId });
        return;
      }

      const selectedTickers = dbUser.tickers.map(ticker => ticker.symbol);

      // Generate welcome email content
      const { html, text } = await getEmailTemplate(EmailType.WELCOME, {
        recipientName: name || 'there',
        recipientEmail: email,
        selectedTickers,
        unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications`,
        preferencesUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings`
      });

      // Prepare email message
      const message: EmailMessage = {
        to: email,
        subject: 'Welcome to tldrSEC!',
        html,
        text,
        tags: ['type:welcome', 'onboarding:complete'],
        metadata: {
          userId,
          type: 'welcome',
          tickerCount: selectedTickers.length,
          summaryCount: 0
        }
      };

      // Send email
      const result = await sendEmail(message);

      if (!result.success) {
        secureLogger.warn('Welcome email failed to send', {
          userId,
          error: result.error?.message
        });
      } else {
        secureLogger.info('Welcome email sent successfully', {
          userId,
          emailId: result.id
        });
      }
    } catch (error) {
      secureLogger.error('Exception in queueWelcomeEmail', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

/**
 * Send welcome email to a user who completed onboarding
 * 
 * @returns Success status and any error information
 */
export async function sendWelcomeEmail(): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }
    
    // Get user details from Clerk
    const user = await currentUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    // Get primary email
    const primaryEmail = user.emailAddresses[0]?.emailAddress;
    if (!primaryEmail) {
      return { success: false, error: 'No primary email found' };
    }
    
    // Get user from database
    const dbUser = await getPrismaClient().user.findFirst({
      where: { 
        authProviderId: userId 
      },
      include: {
        tickers: true
      }
    });
    
    if (!dbUser) {
      return { success: false, error: 'User not found in database' };
    }
    
    // Get user's tracked tickers
    const selectedTickers = dbUser.tickers.map(ticker => ticker.symbol);
    
    // Generate welcome email content
    const { html, text } = await getEmailTemplate(EmailType.WELCOME, {
      recipientName: dbUser.name || user.firstName || 'there',
      recipientEmail: primaryEmail,
      selectedTickers,
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications`,
      preferencesUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings`
    });
    
    // Prepare email message
    const message: EmailMessage = {
      to: primaryEmail,
      subject: 'Welcome to tldrSEC!',
      html,
      text,
      tags: [
        'type:welcome',
        'onboarding:complete'
      ],
      metadata: {
        userId: dbUser.id,
        type: 'welcome',
        tickerCount: selectedTickers.length,
        summaryCount: 0  // No summaries for welcome email
      }
    };
    
    // Update user's onboarding status - do this first to ensure it happens even if email fails
    await getPrismaClient().user.update({
      where: { id: dbUser.id },
      data: {
        onboardingCompleted: true
      }
    });

    // Sync onboarding status to Clerk publicMetadata for client-side access
    try {
      const client = await clerkClient();
      await client.users.updateUserMetadata(userId, {
        publicMetadata: { onboardingCompleted: true }
      });
      secureLogger.info('Synced onboardingCompleted to Clerk publicMetadata', { userId });
    } catch (metadataError) {
      secureLogger.error('Failed to sync publicMetadata to Clerk', {
        error: metadataError instanceof Error ? metadataError.message : 'Unknown error',
        userId
      });
      // Non-critical - user can still use the app
    }
    
    // Try to send email, but don't fail the whole function if this part errors
    try {
      // Send email
      const result = await sendEmail(message);
      
      if (!result.success) {
        logger.warn(`Email sending returned failure: ${result.error?.message}`, {
          userId: dbUser.id
        });
      } else {
        // Log success
        secureLogger.info('Sent welcome email', {
          to: primaryEmail,
          userId: dbUser.id,
          emailId: result.id
        });
      }
    } catch (emailError) {
      // Log the error but continue - user has been marked as onboarded
      secureLogger.error('Failed to send welcome email but continuing', {
        error: emailError instanceof Error ? emailError.message : 'Unknown error',
        userId: dbUser.id
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send welcome email' 
    };
  }
} 