import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@clerk/nextjs/server';
import { getUserByEmail, getUserById, updateUser } from '@/lib/api/users';
import type { User } from '@/generated/prisma';

// Validation schema for user profile updates
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  notificationPreference: z.enum(['immediate', 'digest', 'none']).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

// Type for authentication result
type AuthResult = {
  authenticated: true;
  userId: string;
  userEmail: string;
  dbUser: User;
} | {
  authenticated: false;
  status: number;
  message: string;
};

// Helper function to authenticate and get user details
async function authenticateAndGetUser(): Promise<AuthResult> {
  try {
    // Get user from Clerk
    const user = await currentUser();
    
    if (!user) {
      console.log('No authenticated user found');
      return { 
        authenticated: false,
        status: 401,
        message: 'Unauthorized' 
      };
    }
    
    // Get primary email
    const primaryEmail = user.emailAddresses.find(
      (email: any) => email.id === user.primaryEmailAddressId
    );
    
    if (!primaryEmail) {
      console.log('User has no primary email');
      return { 
        authenticated: false,
        status: 404,
        message: 'User email not found' 
      };
    }
    
    console.log(`Attempting to find user with email: ${primaryEmail.emailAddress}`);
    
    try {
      // Get user from our database
      const dbUser = await getUserByEmail(primaryEmail.emailAddress);
      
      if (!dbUser) {
        console.log('User not found in database');
        
        // Check if table exists by trying to get any user
        try {
          console.log('Checking if users table exists...');
          return { 
            authenticated: false,
            status: 404,
            message: 'User not registered in database. Please ensure the database is properly set up.' 
          };
        } catch (tableError) {
          console.error('Error checking users table:', tableError);
          return { 
            authenticated: false,
            status: 500,
            message: 'Database table error: users table may not exist' 
          };
        }
      }
      
      return {
        authenticated: true,
        userId: user.id,
        userEmail: primaryEmail.emailAddress,
        dbUser
      };
    } catch (dbError) {
      console.error('Database error when looking up user:', dbError);
      return { 
        authenticated: false,
        status: 500,
        message: 'Database error: ' + (dbError instanceof Error ? dbError.message : String(dbError))
      };
    }
  } catch (error) {
    console.error('Error in authentication:', error);
    return { 
      authenticated: false,
      status: 500,
      message: 'Authentication error: ' + (error instanceof Error ? error.message : String(error))
    };
  }
}

// GET /api/user/profile - Get user profile information
export async function GET() {
  try {
    console.log('GET /api/user/profile - Starting authentication');
    const authResult = await authenticateAndGetUser();
    
    if (!authResult.authenticated) {
      console.log(`Authentication failed: ${authResult.message}`);
      return NextResponse.json(
        { error: authResult.message },
        { status: authResult.status }
      );
    }
    
    // At this point TypeScript knows that authResult has the dbUser property
    const { dbUser } = authResult;
    console.log('Authentication successful, returning user profile data');
    
    // Return user profile data
    return NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      notificationPreference: dbUser.notificationPreference,
      theme: dbUser.theme,
      createdAt: dbUser.createdAt,
      updatedAt: dbUser.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: 'Failed to fetch user profile',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// PATCH /api/user/profile - Update user profile information
export async function PATCH(req: NextRequest) {
  try {
    console.log('PATCH /api/user/profile - Starting authentication');
    const authResult = await authenticateAndGetUser();
    
    if (!authResult.authenticated) {
      console.log(`Authentication failed: ${authResult.message}`);
      return NextResponse.json(
        { error: authResult.message },
        { status: authResult.status }
      );
    }
    
    // Parse and validate request body
    const requestBody = await req.json();
    const validationResult = updateProfileSchema.safeParse(requestBody);
    
    if (!validationResult.success) {
      console.log('Invalid request body:', validationResult.error.format());
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          message: 'Invalid input data', 
          details: validationResult.error.format() 
        },
        { status: 400 }
      );
    }
    
    // Validate that there's at least one field to update
    const dataToUpdate = validationResult.data;
    if (Object.keys(dataToUpdate).length === 0) {
      console.log('No fields to update provided');
      return NextResponse.json(
        { error: 'Bad Request', message: 'No fields to update provided' },
        { status: 400 }
      );
    }
    
    // At this point TypeScript knows that authResult has the dbUser property
    const { dbUser } = authResult;
    console.log(`Updating user profile for user ID: ${dbUser.id}`);
    
    try {
      // Update the user profile
      const updatedUser = await updateUser(dbUser.id, dataToUpdate);
      console.log('User profile updated successfully');
      
      // Return updated user profile data
      return NextResponse.json({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        notificationPreference: updatedUser.notificationPreference,
        theme: updatedUser.theme,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (updateError) {
      console.error('Error updating user profile in database:', updateError);
      return NextResponse.json(
        { 
          error: 'Database Error', 
          message: 'Failed to update user profile in database',
          details: updateError instanceof Error ? updateError.message : String(updateError)
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: 'Failed to update user profile',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 