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