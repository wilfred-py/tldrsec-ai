import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logging';

/**
 * GET /api/settings
 * Returns the current user's settings and account information
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    const user = await currentUser();
    
    if (!userId || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }
    
    // Get user from database
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        preferences: true,
        createdAt: true,
        onboardingCompleted: true
      }
    });
    
    if (!dbUser) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }
    
    // Parse preferences with defaults
    const preferences = (dbUser.preferences as Record<string, unknown>) || {};
    const defaultPreferences = {
      notifications: {
        emailFrequency: 'immediate',
        filingTypes: {
          form10K: true,
          form10Q: true,
          form8K: true,
          form4: true,
          otherFilings: false
        }
      },
      theme: 'light'
    };
    
    const mergedPreferences = {
      ...defaultPreferences,
      ...preferences,
      notifications: {
        ...defaultPreferences.notifications,
        ...(preferences.notifications || {}),
        filingTypes: {
          ...defaultPreferences.notifications.filingTypes,
          ...(preferences.notifications?.filingTypes || {})
        }
      }
    };
    
    return NextResponse.json({
      success: true,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        createdAt: dbUser.createdAt,
        onboardingCompleted: dbUser.onboardingCompleted
      },
      preferences: mergedPreferences
    });
  } catch (error) {
    logger.error('Error retrieving user settings', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve settings'
    }, { status: 500 });
  }
}

/**
 * PUT /api/settings
 * Updates the current user's settings and preferences
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }
    
    const body = await request.json();
    const { preferences } = body;
    
    if (!preferences) {
      return NextResponse.json({
        success: false,
        error: 'Preferences are required'
      }, { status: 400 });
    }
    
    // Validate preferences structure
    if (preferences.notifications) {
      const validFrequencies = ['immediate', 'digest', 'none'];
      if (preferences.notifications.emailFrequency && 
          !validFrequencies.includes(preferences.notifications.emailFrequency)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid email frequency'
        }, { status: 400 });
      }
    }
    
    if (preferences.theme) {
      const validThemes = ['light', 'dark'];
      if (!validThemes.includes(preferences.theme)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid theme'
        }, { status: 400 });
      }
    }
    
    // Update user preferences
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { preferences },
      select: {
        id: true,
        email: true,
        name: true,
        preferences: true
      }
    });
    
    logger.info('User settings updated', {
      userId,
      preferences: JSON.stringify(preferences)
    });
    
    return NextResponse.json({
      success: true,
      user: updatedUser,
      preferences: updatedUser.preferences
    });
  } catch (error) {
    logger.error('Error updating user settings', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to update settings'
    }, { status: 500 });
  }
}