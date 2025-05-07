import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getUserByEmail, createUser } from '@/lib/api/users';

/**
 * API route to synchronize a Clerk user with our database
 * This is called by the AuthSyncProvider component when a user signs in
 */
export async function POST(req: NextRequest) {
  try {
    // Check if user is authenticated with Clerk
    const { userId } = await auth();
    if (!userId) {
      console.warn('Sync user attempted without authentication');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get user details from Clerk
    const user = await currentUser();
    if (!user) {
      console.warn(`User not found for userId: ${userId}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Find primary email
    const primaryEmail = user.emailAddresses.find(
      email => email.id === user.primaryEmailAddressId
    )?.emailAddress;
    
    if (!primaryEmail) {
      console.warn(`No primary email found for user: ${userId}`);
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }
    
    // Check if user already exists in our database
    const existingUser = await getUserByEmail(primaryEmail);
    
    // If user doesn't exist in our database, create them
    if (!existingUser) {
      // Handle cases where user may not have firstName/lastName (e.g., from certain OAuth providers)
      const userName = user.firstName || user.lastName 
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : primaryEmail.split('@')[0]; // Use part of email as fallback
      
      await createUser({
        email: primaryEmail,
        name: userName,
        authProvider: 'clerk',
        authProviderId: user.id
      });
      
      console.info(`User created via sync: ${primaryEmail} (${userId})`);
    } else {
      console.debug(`User already exists in database: ${primaryEmail} (${userId})`);
    }
    
    return NextResponse.json({ 
      success: true,
      action: existingUser ? 'exists' : 'created' 
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error syncing user: ${errorMessage}`, error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic'; 