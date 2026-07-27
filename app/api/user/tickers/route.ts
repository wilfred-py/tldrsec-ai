import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { dbRetry } from '@/lib/db/retry-wrapper';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { THREE_TIER_LIMITS } from '@/lib/subscription/three-tier-limits';
import { convertUserPrefsToTickerPrefs, getDefaultTickerPreferences } from '@/lib/user/preference-sync';
import { UserPreferences } from '@/lib/user/preference-types';
import { sendQuarterlyEarningsEmail } from '@/lib/email/quarterly-earnings-service';
import { logger } from '@/lib/logging';
import { resolveTicker } from '@/lib/sec-edgar/cik-resolver';

// Input validation schema for ticker creation
const createTickerSchema = z.object({
  symbol: z.string().min(1).max(10).regex(/^[A-Z0-9.-]+$/i, 'Invalid ticker symbol format'),
  companyName: z.string().min(1).max(200).trim()
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Get default preferences from the centralized source (form4: true by default)
const DEFAULT_PREFERENCES = getDefaultTickerPreferences();

/**
 * GET /api/user/tickers
 * Retrieves the current user's tracked tickers
 */
export async function GET() {
  try {
    const prisma = getPrismaClient();
    
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user details from Clerk
    const user = await currentUser();
    if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
      return NextResponse.json({ error: 'User email not available' }, { status: 400 });
    }

    const primaryEmail = user.emailAddresses[0].emailAddress;

    // Find user in database with retry logic for cold start issues
    const dbUser = await dbRetry.query(() =>
      prisma.user.findUnique({
        where: { email: primaryEmail },
        include: {
          tickers: {
            include: {
              _count: { select: { summaries: true } },
              summaries: {
                take: 1,
                select: {
                  id: true,
                  filingDate: true,
                },
                orderBy: {
                  filingDate: 'desc',
                },
              },
            },
          },
        },
      })
    );

    if (!dbUser) {
      // Auto-create user if they don't exist in database
      console.log(`User not found. Creating new user for ${primaryEmail} with auth ID ${userId}`);

      try {
        const newUser = await dbRetry.mutation(() =>
          prisma.user.create({
            data: {
              id: userId, // Use Clerk user ID as primary key for consistency
              email: primaryEmail,
              authProvider: 'clerk',
              authProviderId: userId,
              name: user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : undefined,
              subscriptionTier: 'FREE', // Default tier
            },
            include: {
              tickers: {
                include: {
                  _count: { select: { summaries: true } },
                  summaries: {
                    take: 1,
                    select: {
                      id: true,
                      filingDate: true,
                    },
                    orderBy: {
                      filingDate: 'desc',
                    },
                  },
                },
              },
            },
          })
        );

        console.log('User created successfully:', newUser.id);
        return NextResponse.json({
          tickers: newUser.tickers.map(ticker => {
            const latestSummary = ticker.summaries?.[0];
            return {
              ...ticker,
              summaryCount: ticker._count.summaries,
              lastFilingDate: latestSummary?.filingDate?.toISOString() || null,
              preferences: ticker.preferences || DEFAULT_PREFERENCES,
            };
          }),
          message: 'User created and initialized'
        });
      } catch (createError) {
        console.error('Failed to create user:', createError);
        return NextResponse.json({ error: 'Failed to initialize user account' }, { status: 500 });
      }
    }

    // Return user tickers with summary count, latest filing date, and preferences
    return NextResponse.json({
      tickers: dbUser.tickers.map(ticker => {
        // Get the latest filing date from summaries (already sorted desc)
        const latestSummary = ticker.summaries?.[0];
        return {
          ...ticker,
          summaryCount: ticker._count.summaries,
          lastFilingDate: latestSummary?.filingDate?.toISOString() || null,
          preferences: ticker.preferences || DEFAULT_PREFERENCES,
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching user tickers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user tickers' }, 
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/tickers
 * - body {action: 'confirm'} → confirm portfolio and trigger quarterly emails
 * - body {symbol, companyName} → add a new ticker
 */
export async function POST(request: Request) {
  try {
    const prisma = getPrismaClient();

    // Parse request body
    const body = await request.json();

    // Route to confirm handler if action is 'confirm'
    if (body?.action === 'confirm') {
      return handleConfirm(prisma);
    }
    
    // Validate input data
    const validationResult = createTickerSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({
        error: 'Invalid ticker data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }, { status: 400 });
    }
    
    const { symbol, companyName } = validationResult.data;
    
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user details from Clerk
    const user = await currentUser();
    if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
      return NextResponse.json({ error: 'User email not available' }, { status: 400 });
    }

    const primaryEmail = user.emailAddresses[0].emailAddress;

    // Find user in database - use findFirst with multiple conditions to be more flexible
    // Include preferences to derive ticker preferences from user settings
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: primaryEmail },
          { authProviderId: userId }
        ]
      },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        preferences: true,
        tickers: true
      }
    });

    if (!dbUser) {
      // If no user found, create one
      console.log(`User not found. Creating new user for ${primaryEmail} with auth ID ${userId}`);
      
      // Create new user with consistent schema
      const newUser = await prisma.user.create({
        data: {
          id: userId, // Use Clerk user ID as primary key for consistency
          email: primaryEmail,
          authProvider: 'clerk',
          authProviderId: userId,
          name: user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : undefined,
          subscriptionTier: 'FREE', // Default tier
        }
      });
      
      // Create the ticker for the new user with default preferences
      const newTicker = await prisma.ticker.create({
        data: {
          symbol,
          companyName,
          userId: newUser.id,
          preferences: DEFAULT_PREFERENCES,
        }
      });

      // Without a CikMapping row, fast-poll filters this symbol out and never creates
      // a TickerMonitoring record. Fire-and-forget so the response stays fast even if
      // SEC EDGAR is slow or unreachable.
      void resolveTicker(symbol).catch(err => {
        logger.warn(`Background CIK resolution failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      });

      // Return the new ticker
      return NextResponse.json({
        id: newTicker.id,
        symbol: newTicker.symbol,
        companyName: newTicker.companyName,
        name: newTicker.companyName,
        userId: newTicker.userId,
        addedAt: newTicker.addedAt,
        lastFiling: "—",
        summaryCount: 0,
        preferences: DEFAULT_PREFERENCES,
      });
    }

    // Check if ticker already exists for this user (case-insensitive)
    const existingTicker = dbUser.tickers.find(ticker => 
      ticker.symbol.toLowerCase() === symbol.toLowerCase()
    );

    if (existingTicker) {
      console.log(`Ticker ${symbol} is already being tracked by user ${dbUser.id}`);
      return NextResponse.json({
        id: existingTicker.id,
        symbol: existingTicker.symbol,
        companyName: existingTicker.companyName,
        name: existingTicker.companyName,
        userId: existingTicker.userId,
        addedAt: existingTicker.addedAt,
        lastFiling: "—",
        summaryCount: 0,
        preferences: existingTicker.preferences || DEFAULT_PREFERENCES,
      });
    }

    // 3-tier limit check. THREE_TIER_LIMITS values of -1 mean unlimited
    // (FREE and MAX today); PRO caps at 25. See lib/subscription/three-tier-limits.ts.
    const currentCount = dbUser.tickers.length;
    const tier = dbUser.subscriptionTier as 'FREE' | 'PRO' | 'MAX';
    const tickerLimit = THREE_TIER_LIMITS[tier];

    if (tickerLimit !== -1 && currentCount >= tickerLimit) {
      return NextResponse.json({
        error: `You've reached your ${currentCount} ticker limit for the ${tier} tier`,
        limitReached: true,
        currentTier: tier,
        maxTickers: tickerLimit,
        currentCount,
        upgradeRequired: tier !== 'MAX' // FREE can upgrade to PRO, PRO can upgrade to MAX
      }, { status: 403 });
    }

    // Derive ticker preferences from user's preferences (or use defaults)
    const userPrefs = dbUser.preferences as unknown as UserPreferences | null;
    const tickerPrefs = userPrefs?.notifications?.filingTypes
      ? convertUserPrefsToTickerPrefs(userPrefs.notifications.filingTypes)
      : DEFAULT_PREFERENCES;

    // Add ticker to user's tracked list with user-derived preferences
    console.log(`Adding ticker ${symbol} for user ${dbUser.id} with preferences from user settings`);
    const newTicker = await prisma.ticker.create({
      data: {
        symbol,
        companyName,
        userId: dbUser.id,
        preferences: tickerPrefs,
      }
    });

    void resolveTicker(symbol).catch(err => {
      logger.warn(`Background CIK resolution failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    });

    // Make sure cache is refreshed
    revalidatePath('/dashboard');

    // Return the new ticker
    return NextResponse.json({
      id: newTicker.id,
      symbol: newTicker.symbol,
      companyName: newTicker.companyName,
      name: newTicker.companyName,
      userId: newTicker.userId,
      addedAt: newTicker.addedAt,
      lastFiling: "—",
      summaryCount: 0,
      preferences: tickerPrefs,
    });
  } catch (error) {
    console.error('Error adding ticker:', error);
    return NextResponse.json(
      { error: 'Failed to add ticker' },
      { status: 500 }
    );
  }
}

// Grace period in milliseconds (1 minute)
const GRACE_PERIOD_MS = 60 * 1000;

/**
 * Confirm portfolio and trigger quarterly earnings emails.
 * Implements a 1-minute grace period to prevent duplicate emails.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleConfirm(prisma: any) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: { authProviderId: clerkUserId },
      include: {
        tickers: {
          select: { symbol: true, companyName: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentTickers = user.tickers.map((t: { symbol: string }) => t.symbol);
    const previousTickers = user.tickersAtLastConfirmation || [];
    const now = new Date();

    const lastConfirmation = user.tickersConfirmedAt;
    const isWithinGracePeriod =
      lastConfirmation && now.getTime() - lastConfirmation.getTime() < GRACE_PERIOD_MS;

    let emailSent = false;
    let newTickersEmailed: string[] = [];
    let reason = '';
    let emailError: string | undefined;

    if (currentTickers.length === 0) {
      reason = 'no_tickers';
    } else if (isWithinGracePeriod) {
      const newTickers = currentTickers.filter((t: string) => !previousTickers.includes(t));

      if (newTickers.length === 0) {
        reason = 'within_grace_period';
      } else {
        const emailResult = await sendQuarterlyEarningsEmail({
          userId: user.id,
          tickerSymbols: newTickers,
          email: user.email,
          recipientName: user.name || undefined,
        });

        if (emailResult.success) {
          emailSent = true;
          newTickersEmailed = newTickers;
        } else {
          emailError = emailResult.error;
        }
      }
    } else {
      const emailResult = await sendQuarterlyEarningsEmail({
        userId: user.id,
        tickerSymbols: currentTickers,
        email: user.email,
        recipientName: user.name || undefined,
      });

      if (emailResult.success) {
        emailSent = true;
        newTickersEmailed = currentTickers;
      } else {
        emailError = emailResult.error;
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        tickersConfirmedAt: now,
        lastConfirmationEmailSentAt: emailSent ? now : user.lastConfirmationEmailSentAt,
        tickersAtLastConfirmation: currentTickers,
      },
    });

    logger.info('Ticker confirmation processed', {
      userId: user.id,
      tickerCount: currentTickers.length,
      emailSent,
      newTickersEmailed: newTickersEmailed.length,
      reason: reason || undefined,
    });

    return NextResponse.json({
      tickersConfirmed: true,
      tickerCount: currentTickers.length,
      emailSent,
      newTickersEmailed,
      reason: reason || undefined,
      emailError,
    });
  } catch (error) {
    logger.error('Error confirming tickers', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Failed to confirm tickers' },
      { status: 500 }
    );
  }
}