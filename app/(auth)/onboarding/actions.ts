'use server';

import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { auth } from '@clerk/nextjs/server';
import type {
  FilingTypePreferences,
  NotificationContentPreferences,
  UIPreferences
} from '@/lib/user/preference-types';
import { NotificationPreference } from '@/lib/email/notification-service';

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

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { clerkId: userId }
    });

    if (!user) {
      // Create new user
      await prisma.user.create({
        data: {
          clerkId: userId,
          preferences: {
            create: {
              notificationPreferences: {
                emailFrequency: preferences.notifications.emailFrequency,
                filingTypes: preferences.notifications.filingTypes,
                contentPreferences: preferences.notifications.contentPreferences
              },
              uiPreferences: preferences.ui
            }
          }
        }
      });
    } else {
      // Update existing user
      await prisma.userPreferences.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          notificationPreferences: {
            emailFrequency: preferences.notifications.emailFrequency,
            filingTypes: preferences.notifications.filingTypes,
            contentPreferences: preferences.notifications.contentPreferences
          },
          uiPreferences: preferences.ui
        },
        update: {
          notificationPreferences: {
            emailFrequency: preferences.notifications.emailFrequency,
            filingTypes: preferences.notifications.filingTypes,
            contentPreferences: preferences.notifications.contentPreferences
          },
          uiPreferences: preferences.ui
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

    // Get user
    const user = await prisma.user.findUnique({
      where: { clerkId: userId }
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Look up the ticker
    const ticker = await prisma.ticker.findFirst({
      where: {
        OR: [
          { symbol: subscription.symbol },
          { aliases: { has: subscription.symbol } }
        ]
      }
    });

    let tickerId = ticker?.id;

    // If ticker doesn't exist, create it
    if (!ticker) {
      const newTicker = await prisma.ticker.create({
        data: {
          symbol: subscription.symbol,
          companyName: subscription.companyName,
          cik: '', // Will be populated later by background job
          exchangeCodes: [],
          isActive: true
        }
      });
      tickerId = newTicker.id;
    }

    // Create or update subscription
    await prisma.tickerSubscription.upsert({
      where: {
        userId_tickerId: {
          userId: user.id,
          tickerId: tickerId!
        }
      },
      create: {
        userId: user.id,
        tickerId: tickerId!,
        overridePreferences: subscription.overridePreferences || false
      },
      update: {
        overridePreferences: subscription.overridePreferences || false
      }
    });

    revalidatePath('/onboarding');
    return { success: true };
  } catch (error) {
    console.error('Failed to add ticker subscription:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add ticker subscription' 
    };
  }
} 