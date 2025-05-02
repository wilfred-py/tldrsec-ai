import { auth } from '@clerk/nextjs';
import { getUserByEmail } from './api/users';

// Type for authenticated requests
export type AuthedRequest = {
  auth: {
    userId: string;
    dbUserId: string;
    userEmail: string;
  };
};

// Type for email address
type ClerkEmailAddress = {
  id: string;
  emailAddress: string;
};

// Check if a user is authenticated and get their information
export async function getAuthenticatedUser() {
  const { userId, sessionId } = auth();
  
  // If no user or session ID, user is not authenticated
  if (!userId || !sessionId) {
    return null;
  }
  
  // Get the user from Clerk
  const user = auth().user;
  if (!user) {
    return null;
  }
  
  // Get primary email
  const primaryEmail = user.emailAddresses.find(
    (email: ClerkEmailAddress) => email.id === user.primaryEmailAddressId
  );
  
  if (!primaryEmail) {
    return null;
  }
  
  // Get user from database
  const dbUser = await getUserByEmail(primaryEmail.emailAddress);
  
  return {
    userId,
    userEmail: primaryEmail.emailAddress,
    dbUserId: dbUser?.id,
    hasDbAccount: !!dbUser,
  };
}

// Middleware to ensure a user is authenticated for API routes
export async function requireAuth() {
  const authInfo = await getAuthenticatedUser();
  
  if (!authInfo) {
    return {
      status: 401,
      data: {
        error: 'Unauthorized',
        message: 'You must be signed in to access this resource',
      },
    };
  }
  
  if (!authInfo.hasDbAccount) {
    return {
      status: 403,
      data: {
        error: 'Not Found',
        message: 'User account not found. Please complete registration',
      },
    };
  }
  
  return {
    status: 200,
    authInfo: {
      userId: authInfo.userId,
      dbUserId: authInfo.dbUserId!,
      userEmail: authInfo.userEmail,
    },
  };
} 