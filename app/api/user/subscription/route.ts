/**
 * User Subscription API Routes
 * Addresses UX issue: missing subscription management endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getUserSubscription, 
  updateUserSubscription, 
  canProcessFiling 
} from '../../../../services/filings/enhanced/subscriptionService';
import { 
  validateSubscriptionUpdate,
  type SubscriptionUpdateInput 
} from '../../../../lib/validation/subscription-validation';
import {
  getAuthenticatedUserId,
  verifyUserExists,
  SubscriptionAuthError
} from '../../../../lib/auth/subscription-auth';

/**
 * GET /api/user/subscription
 * Retrieve user's current subscription information
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    await verifyUserExists(userId);

    const subscription = await getUserSubscription(userId);
    if (!subscription) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }

    // Also include usage eligibility information
    const eligibility = await canProcessFiling(userId);

    return NextResponse.json({
      ...subscription,
      eligibility
    });

  } catch (error) {
    if (error instanceof SubscriptionAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }

    console.error('Failed to get subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/user/subscription
 * Update user's subscription information
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    await verifyUserExists(userId);

    const body = await request.json();
    const validation = validateSubscriptionUpdate(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid subscription data',
          details: validation.error.errors 
        },
        { status: 400 }
      );
    }

    const updatedSubscription = await updateUserSubscription(userId, validation.data);

    return NextResponse.json(updatedSubscription);

  } catch (error) {
    if (error instanceof SubscriptionAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }

    console.error('Failed to update subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/subscription
 * Create new subscription (for new users)
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    await verifyUserExists(userId);

    const body = await request.json();
    const validation = validateSubscriptionUpdate({
      ...body,
      planType: body.planType || 'BASIC'
    });
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid subscription data',
          details: validation.error.errors 
        },
        { status: 400 }
      );
    }

    // Check if subscription already exists
    const existingSubscription = await getUserSubscription(userId);
    if (existingSubscription) {
      return NextResponse.json(
        { error: 'Subscription already exists' },
        { status: 409 }
      );
    }

    const newSubscription = await updateUserSubscription(userId, validation.data);

    return NextResponse.json(newSubscription, { status: 201 });

  } catch (error) {
    if (error instanceof SubscriptionAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }

    console.error('Failed to create subscription:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}