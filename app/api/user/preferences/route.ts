import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { PreferenceService } from '@/lib/user/preference-service';
import { logger } from '@/lib/logging';
import { PreferenceUpdateResponse, UserPreferences } from '@/lib/user/preference-types';

/**
 * GET /api/user/preferences
 * Returns the current user's preferences
 */
export async function GET(request: NextRequest) {
  try {
    // Get current user
    const user = await currentUser();
    
    // If no user, return unauthorized
    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }
    
    // Get user preferences
    const preferences = await PreferenceService.getUserPreferences(user.id);
    
    // Return preferences
    return NextResponse.json({
      success: true,
      preferences
    });
  } catch (error) {
    // Log error
    logger.error('Error retrieving user preferences', error);
    
    // Return error response
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error retrieving preferences'
    }, { status: 500 });
  }
}

/**
 * PATCH /api/user/preferences
 * Updates the current user's preferences
 */
export async function PATCH(request: NextRequest) {
  try {
    // Get current user
    const user = await currentUser();
    
    // If no user, return unauthorized
    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }
    
    // Get request body
    let updates;
    try {
      updates = await request.json();
    } catch (error) {
      return NextResponse.json({
        success: false,
        message: 'Invalid JSON in request body'
      }, { status: 400 });
    }
    
    // Update preferences
    const result = await PreferenceService.updateUserPreferences(user.id, updates);
    
    // Return result
    return NextResponse.json(result, {
      status: result.success ? 200 : 400
    });
  } catch (error) {
    // Log error
    logger.error('Error updating user preferences', error);
    
    // Return error response
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error updating preferences'
    }, { status: 500 });
  }
} 