import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getUserByEmail } from '@/lib/api/users';

/**
 * DEBUG ENDPOINT - DO NOT USE IN PRODUCTION
 * This endpoint is for debugging authentication issues only.
 * Remove or disable this in production environments.
 */
export async function GET(req: NextRequest) {
  try {
    // Check environment to prevent exposure in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Debug endpoints are disabled in production' },
        { status: 403 }
      );
    }

    // Get authentication status
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { 
          authenticated: false,
          message: 'User is not authenticated',
          nextSteps: [
            'Sign in with Clerk',
            'Check that cookies are enabled',
            'Verify Clerk environment variables'
          ]
        },
        { status: 401 }
      );
    }
    
    // Get Clerk user details
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { 
          authenticated: true,
          userId,
          error: 'Unable to fetch Clerk user details',
          nextSteps: [
            'Verify Clerk SECRET_KEY is correct',
            'Check Clerk API status'
          ]
        },
        { status: 404 }
      );
    }
    
    // Get primary email
    const primaryEmail = user.emailAddresses.find(
      email => email.id === user.primaryEmailAddressId
    )?.emailAddress;
    
    if (!primaryEmail) {
      return NextResponse.json(
        { 
          authenticated: true,
          userId,
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          error: 'No primary email found',
          nextSteps: [
            'Add an email to the Clerk user',
            'Set a primary email in Clerk' 
          ]
        },
        { status: 400 }
      );
    }
    
    // Check if user exists in database
    const dbUser = await getUserByEmail(primaryEmail);
    
    return NextResponse.json({
      authenticated: true,
      clerkUser: {
        id: user.id,
        email: primaryEmail,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        oauthProviders: user.externalAccounts.map(account => account.provider)
      },
      databaseUser: dbUser ? {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        createdAt: dbUser.createdAt
      } : null,
      syncStatus: dbUser ? 'synchronized' : 'not_synchronized',
      nextSteps: dbUser ? [] : [
        'Trigger sync by visiting /api/auth/sync-user',
        'Verify webhook configuration',
        'Check database connection and permissions'
      ]
    });
  } catch (error) {
    console.error('Error in auth debug endpoint:', error);
    return NextResponse.json(
      { 
        error: 'Failed to debug auth state',
        details: error instanceof Error ? error.message : String(error),
        stack: process.env.NODE_ENV !== 'production' && error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic'; 