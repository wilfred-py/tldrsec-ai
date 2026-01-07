import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { dbRetry } from '@/lib/db/retry-wrapper';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { checkTierLimit, getTierLimitInfo } from '@/lib/subscription/three-tier-limits';

// Input validation schema for ticker creation
const createTickerSchema = z.object({
  symbol: z.string().min(1).max(10).regex(/^[A-Z0-9.-]+$/i, 'Invalid ticker symbol format'),
  companyName: z.string().min(1).max(200).trim()
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default filing preferences
const DEFAULT_PREFERENCES = {
  tenK: true,
  tenQ: true,
  eightK: true,
  form4: false,
  form3: false,
  form5: false,
  form144: false,
  twentyF: false,
  fortyF: false,
  sixK: false,
  sc13D: false,
  sc13G: false,
  thirteenF: false,
  def14A: false,
  pre14A: false,
  sOne: false,
  sThree: false,
  other: false,
};

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
              summaries: {
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
                  summaries: {
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
              summaryCount: ticker.summaries?.length || 0,
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
          summaryCount: ticker.summaries?.length || 0,
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
 * Add a new ticker to the user's tracked list
 */
export async function POST(request: Request) {
  try {
    const prisma = getPrismaClient();
    
    // Parse and validate request body
    const body = await request.json();
    
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
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: primaryEmail },
          { authProviderId: userId }
        ]
      },
      include: {
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

    // 3-tier limit check with MAX unlimited
    const currentCount = dbUser.tickers.length;
    const tier = dbUser.subscriptionTier as 'FREE' | 'PRO' | 'MAX';
    
    if (checkTierLimit(currentCount, tier)) {
      const limitInfo = getTierLimitInfo(tier);
      return NextResponse.json({
        error: `You've reached your ${currentCount} ticker limit for the ${tier} tier`,
        limitReached: true,
        currentTier: tier,
        maxTickers: limitInfo.limit,
        currentCount,
        upgradeRequired: tier !== 'MAX' // FREE can upgrade to PRO, PRO can upgrade to MAX
      }, { status: 403 });
    }

    // Add ticker to user's tracked list with default preferences
    console.log(`Adding ticker ${symbol} for user ${dbUser.id}`);
    const newTicker = await prisma.ticker.create({
      data: {
        symbol,
        companyName,
        userId: dbUser.id,
        preferences: DEFAULT_PREFERENCES,
      }
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
      preferences: DEFAULT_PREFERENCES,
    });
  } catch (error) {
    console.error('Error adding ticker:', error);
    return NextResponse.json(
      { error: 'Failed to add ticker' }, 
      { status: 500 }
    );
  }
} 