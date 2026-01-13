'use server';

import { getPrismaClient } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
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
import { queueWelcomeEmail } from '@/lib/email/welcome-service';

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
    const dbUser = await getPrismaClient().user.findUnique({
      where: { 
        email: primaryEmail 
      }
    });

    if (!dbUser) {
      // Create new user
      await getPrismaClient().user.create({
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
      await getPrismaClient().user.update({
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
    const user = await getPrismaClient().user.findUnique({
      where: { email: primaryEmail }
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Check if ticker is already tracked by the user
    const existingTicker = await getPrismaClient().ticker.findFirst({
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
    await getPrismaClient().ticker.create({
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
    let dbUser = await getPrismaClient().user.findFirst({
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
        dbUser = await getPrismaClient().user.create({
          data: {
            email: primaryEmail,
            authProvider: 'clerk',
            authProviderId: userId,
            name: userName,
            preferences: defaultPreferences,
            onboardingCompleted: true
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

    // Ensure onboardingCompleted is set to true in the database
    if (dbUser && !dbUser.onboardingCompleted) {
      await getPrismaClient().user.update({
        where: { id: dbUser.id },
        data: { onboardingCompleted: true }
      });
      console.log(`Set onboardingCompleted=true for user ${dbUser.id}`);
    }

    // Sync onboardingCompleted to Clerk publicMetadata
    try {
      const client = await clerkClient();
      await client.users.updateUserMetadata(userId, {
        publicMetadata: { onboardingCompleted: true }
      });
      console.log(`Synced onboardingCompleted=true to Clerk metadata for user ${userId}`);
    } catch (metadataError) {
      console.error('Failed to sync onboardingCompleted to Clerk:', metadataError);
      // Continue even if Clerk sync fails - the database is the source of truth
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

/**
 * OPTIMIZED: Complete onboarding in a single batched operation
 *
 * This replaces the sequential calls to:
 * - saveUserPreferences()
 * - addTickerSubscription() x N
 * - completeOnboarding()
 *
 * With a single server action that:
 * 1. Gets auth once
 * 2. Batches all DB operations
 * 3. Updates Clerk metadata once
 * 4. Queues welcome email async (doesn't block)
 */
export async function completeOnboardingBatched(input: {
  preferences: UserPreferencesInput;
  tickers: { symbol: string; companyName: string }[];
}): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();

  try {
    // Single auth call for entire operation
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    // Single Clerk user fetch
    const clerkUser = await currentUser();
    if (!clerkUser || !clerkUser.emailAddresses || clerkUser.emailAddresses.length === 0) {
      return { success: false, error: 'User email not available' };
    }

    const primaryEmail = clerkUser.emailAddresses[0].emailAddress;
    const userName = clerkUser.firstName
      ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim()
      : 'User';

    console.log(`[Onboarding] Starting batched completion for ${primaryEmail}`);

    // Convert preferences to plain JSON object
    const preferencesJson = JSON.parse(JSON.stringify(input.preferences));

    // Use Prisma transaction for atomicity
    const result = await getPrismaClient().$transaction(async (tx) => {
      // Find or create user
      let dbUser = await tx.user.findFirst({
        where: {
          OR: [{ authProviderId: userId }, { email: primaryEmail }]
        }
      });

      if (!dbUser) {
        // Create new user with all data at once
        dbUser = await tx.user.create({
          data: {
            email: primaryEmail,
            authProvider: 'clerk',
            authProviderId: userId,
            name: userName,
            preferences: preferencesJson,
            onboardingCompleted: true
          }
        });
        console.log(`[Onboarding] Created new user: ${dbUser.id}`);
      } else {
        // Update existing user
        dbUser = await tx.user.update({
          where: { id: dbUser.id },
          data: {
            preferences: preferencesJson,
            onboardingCompleted: true,
            name: dbUser.name || userName
          }
        });
        console.log(`[Onboarding] Updated user: ${dbUser.id}`);
      }

      // Batch create tickers (skip duplicates)
      if (input.tickers.length > 0) {
        // Get existing tickers for this user
        const existingTickers = await tx.ticker.findMany({
          where: {
            userId: dbUser.id,
            symbol: { in: input.tickers.map((t) => t.symbol) }
          },
          select: { symbol: true }
        });

        const existingSymbols = new Set(existingTickers.map((t) => t.symbol));
        const newTickers = input.tickers.filter((t) => !existingSymbols.has(t.symbol));

        if (newTickers.length > 0) {
          await tx.ticker.createMany({
            data: newTickers.map((ticker) => ({
              symbol: ticker.symbol,
              companyName: ticker.companyName,
              userId: dbUser.id
            })),
            skipDuplicates: true
          });
          console.log(`[Onboarding] Created ${newTickers.length} tickers`);
        }
      }

      return dbUser;
    });

    const dbTime = Date.now() - startTime;
    console.log(`[Onboarding] DB operations completed in ${dbTime}ms`);

    // Update Clerk metadata (non-blocking - don't await in critical path)
    // Fire and forget, but log errors
    clerkClient()
      .then((client) =>
        client.users.updateUserMetadata(userId, {
          publicMetadata: { onboardingCompleted: true }
        })
      )
      .then(() => {
        console.log(`[Onboarding] Clerk metadata synced for ${userId}`);
      })
      .catch((err) => {
        console.error('[Onboarding] Failed to sync Clerk metadata:', err);
      });

    // Queue welcome email async (doesn't block user)
    queueWelcomeEmail(result.id, primaryEmail, userName).catch((err) => {
      console.error('[Onboarding] Failed to queue welcome email:', err);
    });

    const totalTime = Date.now() - startTime;
    console.log(`[Onboarding] Completed in ${totalTime}ms`);

    revalidatePath('/onboarding');
    revalidatePath('/dashboard');

    return { success: true };
  } catch (error) {
    console.error('[Onboarding] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete onboarding'
    };
  }
} 