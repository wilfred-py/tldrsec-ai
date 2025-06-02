'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging';

/**
 * Send a welcome email to the user
 * This function is called during the onboarding process
 * 
 * @returns Success status and any error information
 */
export async function sendWelcomeEmail(): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the authenticated user
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
    
    // Send the welcome email via our API endpoint
    const response = await fetch('/api/email/welcome', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: {
          email: primaryEmail
        }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Failed to send welcome email', {
        userId: dbUser.id,
        error: errorData.error
      });
      
      return { 
        success: false, 
        error: errorData.error || `API error: ${response.status}` 
      };
    }
    
    const data = await response.json();
    
    logger.info('Welcome email sent', {
      userId: dbUser.id
    });
    
    return { success: true };
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send welcome email' 
    };
  }
}
