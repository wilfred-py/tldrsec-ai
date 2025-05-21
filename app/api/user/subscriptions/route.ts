import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { PreferenceService } from '@/lib/user/preference-service';
import { logger } from '@/lib/logging';
import { NotificationPreferences } from '@/lib/user/preference-types';

/**
 * GET /api/user/subscriptions
 * Returns the current user's ticker subscriptions
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
    
    // Get user subscriptions
    const subscriptions = await PreferenceService.getUserSubscriptions(user.id);
    
    // Return subscriptions
    return NextResponse.json({
      success: true,
      subscriptions
    });
  } catch (error) {
    // Log error
    logger.error('Error retrieving user subscriptions', error);
    
    // Return error response
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error retrieving subscriptions'
    }, { status: 500 });
  }
}

/**
 * POST /api/user/subscriptions
 * Adds a new ticker subscription for the current user
 */
export async function POST(request: NextRequest) {
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
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json({
        success: false,
        message: 'Invalid JSON in request body'
      }, { status: 400 });
    }
    
    // Validate required fields
    if (!body.symbol || !body.companyName) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: symbol and companyName are required'
      }, { status: 400 });
    }
    
    // Add subscription
    const result = await PreferenceService.addSubscription(
      user.id,
      body.symbol,
      body.companyName,
      body.overridePreferences || false,
      body.notificationPreferences
    );
    
    // Return result
    return NextResponse.json(result, {
      status: result.success ? 201 : 400
    });
  } catch (error) {
    // Log error
    logger.error('Error adding subscription', error);
    
    // Return error response
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error adding subscription'
    }, { status: 500 });
  }
}

/**
 * PATCH /api/user/subscriptions
 * Updates an existing ticker subscription for the current user
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
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json({
        success: false,
        message: 'Invalid JSON in request body'
      }, { status: 400 });
    }
    
    // Validate required fields
    if (!body.symbol || typeof body.overridePreferences !== 'boolean') {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: symbol and overridePreferences are required'
      }, { status: 400 });
    }
    
    // Update subscription
    const result = await PreferenceService.updateSubscription(
      user.id,
      body.symbol,
      body.overridePreferences,
      body.notificationPreferences
    );
    
    // Return result
    return NextResponse.json(result, {
      status: result.success ? 200 : 400
    });
  } catch (error) {
    // Log error
    logger.error('Error updating subscription', error);
    
    // Return error response
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error updating subscription'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/user/subscriptions?symbol=AAPL
 * Removes a ticker subscription for the current user
 */
export async function DELETE(request: NextRequest) {
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
    
    // Get symbol from query parameter
    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol');
    
    // Validate symbol
    if (!symbol) {
      return NextResponse.json({
        success: false,
        message: 'Missing required parameter: symbol'
      }, { status: 400 });
    }
    
    // Remove subscription
    const result = await PreferenceService.removeSubscription(user.id, symbol);
    
    // Return result, with 404 status if subscription not found
    if (!result.success && result.message?.includes('not found')) {
      return NextResponse.json(result, { status: 404 });
    }
    
    return NextResponse.json(result, {
      status: result.success ? 200 : 400
    });
  } catch (error) {
    // Log error
    logger.error('Error removing subscription', error);
    
    // Return error response
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error removing subscription'
    }, { status: 500 });
  }
} 