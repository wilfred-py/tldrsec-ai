'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';
import { getEmailTemplate } from './templates';
import { EmailType, EmailMessage } from './types';
import { sendEmail } from './index';
import { logger } from '../logging';

/**
 * Get summaries for 10-K and 10-Q filings for a user's tickers
 */
async function getSummariesForUser(userId: string) {
  try {
    // Get user's tickers
    const tickers = await prisma.ticker.findMany({
      where: { userId }
    });

    if (!tickers || tickers.length === 0) {
      return { success: false, error: 'No tickers found for user' };
    }

    // Get the latest 10-K and 10-Q summaries for each ticker
    const summaries = [];
    
    for (const ticker of tickers) {
      // Get the latest 10-K
      const latestTenK = await prisma.summary.findFirst({
        where: {
          tickerId: ticker.id,
          filingType: '10-K'
        },
        orderBy: {
          filingDate: 'desc'
        }
      });

      // Get the latest 10-Q
      const latestTenQ = await prisma.summary.findFirst({
        where: {
          tickerId: ticker.id,
          filingType: '10-Q'
        },
        orderBy: {
          filingDate: 'desc'
        }
      });

      // Add to results if found
      if (latestTenK) {
        summaries.push({
          ...latestTenK,
          ticker: ticker
        });
      }

      if (latestTenQ) {
        summaries.push({
          ...latestTenQ,
          ticker: ticker
        });
      }
    }

    return { success: true, summaries };
  } catch (error) {
    logger.error('Error getting summaries for user', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Error getting summaries' 
    };
  }
}

/**
 * Send summary email to the user with the latest 10-K and 10-Q summaries
 * 
 * @returns Success status and any error information
 */
export async function sendLatestSummariesEmail(): Promise<{ success: boolean; error?: string }> {
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
      }
    });
    
    if (!dbUser) {
      return { success: false, error: 'User not found in database' };
    }
    
    // Get summaries for user
    const { success, summaries, error } = await getSummariesForUser(dbUser.id);
    
    if (!success || !summaries || summaries.length === 0) {
      return { success: false, error: error || 'No summaries found' };
    }
    
    // Create ticker groups for the email template
    const tickerGroups = [];
    const tickerMap = new Map();
    
    for (const summary of summaries) {
      const ticker = summary.ticker;
      
      if (!tickerMap.has(ticker.symbol)) {
        tickerMap.set(ticker.symbol, {
          symbol: ticker.symbol,
          companyName: ticker.companyName,
          filings: []
        });
        tickerGroups.push(tickerMap.get(ticker.symbol));
      }
      
      // Add to filings for this ticker
      tickerMap.get(ticker.symbol).filings.push({
        symbol: ticker.symbol,
        companyName: ticker.companyName,
        filingType: summary.filingType,
        filingDate: summary.filingDate,
        filingUrl: summary.filingUrl,
        summaryId: summary.id,
        summaryUrl: `${process.env.NEXT_PUBLIC_APP_URL}/summary/${summary.id}`,
        summaryText: summary.summaryText,
        summaryData: summary.summaryJSON
      });
    }
    
    // Generate email content
    const { html, text } = getEmailTemplate(EmailType.DIGEST, {
      recipientName: dbUser.name || user.firstName || 'there',
      recipientEmail: primaryEmail,
      tickerGroups: tickerGroups,
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications`,
      preferencesUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings`
    });
    
    // Prepare email message
    const message: EmailMessage = {
      to: primaryEmail,
      subject: 'Your Latest SEC Filing Summaries',
      html,
      text,
      tags: [
        'type:summaries',
        'content:filings'
      ],
      metadata: {
        userId: dbUser.id,
        type: 'summaries-digest',
        summaryCount: summaries.length,
        tickerCount: tickerGroups.length
      }
    };
    
    // Send email
    try {
      const result = await sendEmail(message);
      
      if (!result.success) {
        logger.warn(`Email sending returned failure: ${result.error?.message}`, {
          userId: dbUser.id
        });
        return { success: false, error: result.error?.message || 'Failed to send email' };
      }
      
      // Log success
      logger.info(`Sent summaries email to ${primaryEmail}`, {
        userId: dbUser.id,
        emailId: result.id
      });
      
      return { success: true };
    } catch (emailError) {
      logger.error('Failed to send summaries email', {
        error: emailError instanceof Error ? emailError.message : 'Unknown error',
        userId: dbUser.id
      });
      
      return {
        success: false,
        error: emailError instanceof Error ? emailError.message : 'Failed to send summaries email'
      };
    }
  } catch (error) {
    console.error('Failed to send summaries email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send summaries email' 
    };
  }
} 