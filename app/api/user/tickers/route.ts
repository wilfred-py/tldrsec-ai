import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/user/tickers
 * Retrieves the current user's tracked tickers
 */
export async function GET() {
  try {
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

    // Find user in database
    const dbUser = await prisma.user.findUnique({
      where: { email: primaryEmail },
      include: {
        tickers: true
      }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
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

    // Find user in database
    const dbUser = await prisma.user.findUnique({
      where: { email: primaryEmail }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    // Check if ticker already exists for this user
    const existingTicker = await prisma.ticker.findFirst({
      where: {
        userId: dbUser.id,
        symbol: symbol
      }
    });

    if (existingTicker) {
      return NextResponse.json(
        { error: `Ticker ${symbol} is already being tracked` }, 
        { status: 409 }
      );
    }

    // Add ticker to user's tracked list
    const newTicker = await prisma.ticker.create({
      data: {
        symbol,
        companyName,
        userId: dbUser.id
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
  } catch (error) {
    console.error('Error adding ticker:', error);
    return NextResponse.json(
      { error: 'Failed to add ticker' }, 
      { status: 500 }
    );
  }
} 