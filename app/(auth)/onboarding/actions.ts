'use server';

import { getPrismaClient } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import type {
  FilingTypePreferences,
  NotificationContentPreferences,
  UIPreferences
} from '@/lib/user/preference-types';
import { NotificationPreference } from '@/lib/email/notification-types';
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
 * Complete onboarding in a single batched operation.
 *
 * Replaces the sequential calls to:
 * - saveUserPreferences()
 * - addTickerSubscription() x N
 *
 * With a single server action that:
 * 1. Gets auth once
 * 2. Batches all DB operations
 * 3. Updates Clerk metadata once
 * 4. Queues welcome email async (doesn't block)
 */
// Server-side validation constants
const MAX_TICKERS_SERVER = 50;
const TICKER_SYMBOL_REGEX = /^[A-Z0-9\-.]{1,10}$/;
const MAX_PREFERENCES_SIZE = 10_000; // 10KB max for preferences JSON

export async function completeOnboardingBatched(input: {
  preferences: UserPreferencesInput;
  tickers: { symbol: string; companyName: string }[];
}): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();

  try {
    // --- Server-side input validation ---
    if (!input.tickers || !Array.isArray(input.tickers)) {
      return { success: false, error: 'Invalid tickers input' };
    }
    if (input.tickers.length > MAX_TICKERS_SERVER) {
      return { success: false, error: `Too many tickers (max ${MAX_TICKERS_SERVER})` };
    }
    for (const ticker of input.tickers) {
      if (!ticker.symbol || !TICKER_SYMBOL_REGEX.test(ticker.symbol)) {
        return { success: false, error: `Invalid ticker symbol: ${ticker.symbol}` };
      }
      if (ticker.companyName && ticker.companyName.length > 200) {
        return { success: false, error: `Company name too long for ${ticker.symbol}` };
      }
    }
    // Validate preferences size to prevent payload abuse
    const prefsString = JSON.stringify(input.preferences);
    if (prefsString.length > MAX_PREFERENCES_SIZE) {
      return { success: false, error: 'Preferences data too large' };
    }

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

    // CRITICAL: Update Clerk metadata BEFORE returning
    // This prevents the middleware from redirecting authenticated users back to onboarding.
    // Retry up to 3 times since failure here causes redirect issues until the 60s cookie expires.
    let clerkSynced = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const client = await clerkClient();
        await client.users.updateUserMetadata(userId, {
          publicMetadata: { onboardingCompleted: true }
        });
        console.log(`[Onboarding] Clerk metadata synced for ${userId} (attempt ${attempt})`);
        clerkSynced = true;
        break;
      } catch (err) {
        console.error(`[Onboarding] Clerk metadata sync attempt ${attempt}/3 failed:`, err);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
    if (!clerkSynced) {
      console.error('[Onboarding] All Clerk metadata sync attempts failed. User may see redirect loop after cookie expires.');
    }

    // Queue welcome email async (doesn't block user)
    queueWelcomeEmail(result.id, primaryEmail, userName).catch((err) => {
      console.error('[Onboarding] Failed to queue welcome email:', err);
    });

    // Deliver the post-onboarding "first filing email" via Next.js after().
    // Runs after the response is sent — onboarding action returns fast,
    // email send happens in the same invocation. Idempotent on
    // User.onboardingFirstEmailSentAt.
    after(async () => {
      try {
        const { deliverFirstOnboardingEmail } = await import(
          '@/lib/onboarding/cached-summary-delivery'
        );
        const deliveryResult = await deliverFirstOnboardingEmail(
          result.id,
          primaryEmail
        );
        console.log(
          '[Onboarding] Cached-summary delivery:',
          JSON.stringify({
            userId: result.id,
            delivered: deliveryResult.delivered,
            reason: deliveryResult.reason,
            summaryId: deliveryResult.summaryId,
            score: deliveryResult.score,
          })
        );

        // Long-tail fallback: no cached summaries available across the user's
        // tickers (unique-ticker case). Send the dedicated fallback notice so
        // the "you'll receive an email shortly" promise isn't broken silently.
        if (
          !deliveryResult.delivered &&
          (deliveryResult.reason === 'no_cached_summaries' ||
            deliveryResult.reason === 'no_tickers')
        ) {
          const { sendOnboardingFallbackNotice } = await import(
            '@/lib/email/onboarding-fallback-service'
          );
          await sendOnboardingFallbackNotice({
            userId: result.id,
            email: primaryEmail,
            recipientName: userName,
            trackedTickers: input.tickers.map((t) => t.symbol),
          });
        }

        // TODO: if reason === 'no_cached_summaries', enqueue
        // ASYNC_DISCOVER_FILINGS for the user's tickers to shorten the wait
        // for their first real filing email. Requires understanding cron auth
        // + idempotency-key pattern. Deferred to follow-up — see TODOS.md.
      } catch (err) {
        console.error('[Onboarding] Cached-summary delivery threw:', err);
      }
    });

    // Reconcile Stripe subscription (fire-and-forget)
    // Always attempt — handles re-onboarded users whose Stripe sub still exists
    import('@/lib/stripe/reconcile')
      .then(({ reconcileStripeSubscription }) =>
        reconcileStripeSubscription(result.id, primaryEmail)
      )
      .then((reconcileResult) => {
        if (reconcileResult.reconciled) {
          console.log(`[Onboarding] Reconciled Stripe subscription: ${reconcileResult.planType}`);
        }
      })
      .catch((reconcileError) => {
        console.error('[Onboarding] Stripe reconciliation failed:', reconcileError);
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