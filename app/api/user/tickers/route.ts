import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { dbRetry } from '@/lib/db/retry-wrapper';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
          tickers: true
        }
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
              tickers: true
            }
          })
        );
        
        console.log('User created successfully:', newUser.id);
        return NextResponse.json({ 
          tickers: newUser.tickers,
          message: 'User created and initialized'
        });
      } catch (createError) {
        console.error('Failed to create user:', createError);
        return NextResponse.json({ error: 'Failed to initialize user account' }, { status: 500 });
      }
    }

    // Return user tickers
    return NextResponse.json({ 
      tickers: dbUser.tickers 
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
    
    // Parse request body
    const body = await request.json();
    const { symbol, companyName } = body;
    
    if (!symbol || !companyName) {
      return NextResponse.json(
        { error: 'Symbol and company name are required' }, 
        { status: 400 }
      );
    }
    
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
      
      // Create the ticker for the new user
      const newTicker = await prisma.ticker.create({
        data: {
          symbol,
          companyName,
          userId: newUser.id
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
        preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
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
        preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
      });
    }

    // Add ticker to user's tracked list
    console.log(`Adding ticker ${symbol} for user ${dbUser.id}`);
    const newTicker = await prisma.ticker.create({
      data: {
        symbol,
        companyName,
        userId: dbUser.id
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
      preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
    });
  } catch (error) {
    console.error('Error adding ticker:', error);
    return NextResponse.json(
      { error: 'Failed to add ticker' }, 
      { status: 500 }
    );
  }
} 