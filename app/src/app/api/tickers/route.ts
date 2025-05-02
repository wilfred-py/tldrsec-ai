import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { getUserByEmail } from '@/lib/api/users';
import { getUserTickers } from '@/lib/api/tickers';

// GET /api/tickers - Get all tickers for the authenticated user
export async function GET(req: NextRequest) {
  // Authenticate the user
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Get user from Clerk
    const authUser = auth().user;
    if (!authUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get primary email
    const primaryEmail = authUser.emailAddresses.find(
      (email) => email.id === authUser.primaryEmailAddressId
    );

    if (!primaryEmail) {
      return NextResponse.json(
        { error: 'User email not found' },
        { status: 404 }
      );
    }

    // Get user from our database
    const dbUser = await getUserByEmail(primaryEmail.emailAddress);
    if (!dbUser) {
      return NextResponse.json(
        { error: 'User not registered in database' },
        { status: 404 }
      );
    }

    // Get all tickers for the user
    const tickers = await getUserTickers(dbUser.id);

    return NextResponse.json({ tickers });
  } catch (error) {
    console.error('Error fetching tickers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tickers' },
      { status: 500 }
    );
  }
}

// POST /api/tickers - Create a new ticker for the authenticated user
export async function POST(req: NextRequest) {
  // This would be implemented similarly to the GET handler
  // but would create a new ticker based on the request body
  return NextResponse.json(
    { error: 'Not implemented' },
    { status: 501 }
  );
} 