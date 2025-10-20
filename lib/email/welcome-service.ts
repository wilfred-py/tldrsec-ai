'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';
import { getEmailTemplate } from './templates';
import { EmailType, EmailMessage } from './types';
import { sendEmail } from './index';
import { logger } from '../logging';
import { SecureEmailLogger } from './security-helpers';

// Create secure logger to prevent PII exposure
const secureLogger = new SecureEmailLogger(logger.child('welcome-service'));

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
    const dbUser = await prisma.user.findFirst({
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
    const { html, text } = getEmailTemplate(EmailType.WELCOME, {
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
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { 
        onboardingCompleted: true
      }
    });
    
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