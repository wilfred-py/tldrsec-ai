'use server';

import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { auth, currentUser } from '@clerk/nextjs/server';
import type {
  FilingTypePreferences,
  NotificationContentPreferences,
  UIPreferences
} from '@/lib/user/preference-types';
import { 
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_UI_PREFERENCES
} from '@/lib/user/preference-types';
import { NotificationPreference } from '@/lib/email/notification-service';
import { sendWelcomeEmail } from '@/lib/email/welcome-service';

// Environment check for API vs mock mode
const API_ENABLED = process.env.NEXT_PUBLIC_API_ENABLED === 'true';

interface UserPreferencesInput {
  notifications: {
    emailFrequency: NotificationPreference;
    filingTypes: FilingTypePreferences;
    contentPreferences: NotificationContentPreferences;
  };
  ui: UIPreferences;
}

export async function saveUserPreferences(preferences: UserPreferencesInput): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    // Get user details from Clerk
    const user = await currentUser();
    if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
      return { success: false, error: 'User email not available' };
    }

    const primaryEmail = user.emailAddresses[0].emailAddress;

    // Convert preferences to a plain object for JSON storage
    const preferencesJson = JSON.parse(JSON.stringify(preferences));

    // Check if user exists
    const dbUser = await prisma.user.findUnique({
      where: { 
        email: primaryEmail 
      }
    });

    if (!dbUser) {
      // Create new user
      await prisma.user.create({
        data: {
          email: primaryEmail,
          authProvider: 'clerk',
          authProviderId: userId,
          name: user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : undefined,
          preferences: preferencesJson
        }
      });
    } else {
      // Update existing user preferences
      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          preferences: preferencesJson
        }
      });
    }

    revalidatePath('/onboarding');
    return { success: true };
  } catch (error) {
    console.error('Failed to save user preferences:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save preferences' 
    };
  }
}

export async function addTickerSubscription(subscription: { 
  symbol: string; 
  companyName: string; 
  overridePreferences?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    // Get user details from Clerk
    const clerkUser = await currentUser();
    if (!clerkUser || !clerkUser.emailAddresses || clerkUser.emailAddresses.length === 0) {
      return { success: false, error: 'User email not available' };
    }

    const primaryEmail = clerkUser.emailAddresses[0].emailAddress;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: primaryEmail }
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Check if ticker is already tracked by the user
    const existingTicker = await prisma.ticker.findFirst({
      where: {
        userId: user.id,
        symbol: subscription.symbol
      }
    });

    // If ticker already exists, return success
    if (existingTicker) {
      return { success: true };
    }

    // Add ticker to user's tracked list
    await prisma.ticker.create({
      data: {
        symbol: subscription.symbol,
        companyName: subscription.companyName,
        userId: user.id
      }
    });

    // If API_ENABLED is false (using mock data), simulate API update to mock data
    // This is for development purposes only to see the added companies in the dashboard
    if (!API_ENABLED) {
      // Simulate adding to MOCK_COMPANIES - in reality, this doesn't affect the mocked array
      // since it's just for display purposes in the action log
      console.log(`[MOCK] Added ticker ${subscription.symbol} to user's tracked list`);
    }

    revalidatePath('/onboarding');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Failed to add ticker subscription:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add ticker subscription' 
    };
  }
}

/**
 * Complete the onboarding process and send welcome email
 */
export async function completeOnboarding(): Promise<{ success: boolean; error?: string }> {
  try {
    // Get auth user data
    const { userId } = await auth();
    
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }
    
    // Get user details from Clerk
    const user = await currentUser();
    if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
      return { success: false, error: 'User email not available' };
    }
    
    const primaryEmail = user.emailAddresses[0].emailAddress;
    const userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'User';
    
    // Check if user exists in database by both authProviderId and email
    let dbUser = await prisma.user.findFirst({
      where: { 
        OR: [
          { authProviderId: userId },
          { email: primaryEmail }
        ]
      }
    });
    
    // If user doesn't exist yet, create a new user record
    if (!dbUser) {
      console.log(`Creating new user during onboarding for ${primaryEmail}`);
      
      // Convert preferences to plain JSON object for database storage
      const defaultPreferences = {
        notifications: JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES)),
        ui: JSON.parse(JSON.stringify(DEFAULT_UI_PREFERENCES))
      };
      
      try {
        dbUser = await prisma.user.create({
          data: {
            email: primaryEmail,
            authProvider: 'clerk',
            authProviderId: userId,
            name: userName,
            preferences: defaultPreferences
          }
        });
        
        console.log(`Created new user in database during onboarding: ${dbUser.id}`);
      } catch (createError) {
        console.error('Failed to create user in database:', createError);
        return { 
          success: false, 
          error: createError instanceof Error ? createError.message : 'Failed to create user in database' 
        };
      }
    }
    
    // Send welcome email with proper error handling
    try {
      const emailResult = await sendWelcomeEmail();
      
      if (!emailResult.success) {
        console.warn('Failed to send welcome email:', emailResult.error);
        // Continue even if email fails - don't block the user
      } else {
        console.log(`Welcome email sent successfully to ${primaryEmail}`);
      }
    } catch (emailError) {
      console.error('Exception when sending welcome email:', emailError);
      // Continue even if email fails - don't block the user
    }
    
    revalidatePath('/onboarding');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Failed to complete onboarding:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to complete onboarding' 
    };
  }
} 