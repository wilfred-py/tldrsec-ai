/**
 * User Analytics API Routes
 * Addresses UX issue: missing usage analytics endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getSubscriptionAnalytics 
} from '../../../../services/filings/enhanced/subscriptionService';
import {
  getAuthenticatedUserId,
  verifyUserExists,
  SubscriptionAuthError
} from '../../../../lib/auth/subscription-auth';

/**
 * GET /api/user/analytics
 * Retrieve user's usage analytics
 * Query parameters:
 * - start: ISO date string for start of period
 * - end: ISO date string for end of period
 * - includeDailyBreakdown: boolean to include daily usage data
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    await verifyUserExists(userId);

    const url = new URL(request.url);
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');
    const includeDailyBreakdown = url.searchParams.get('includeDailyBreakdown') === 'true';

    // Default to last 30 days if no dates provided
    const endDate = endParam ? new Date(endParam) : new Date();
    const startDate = startParam ? new Date(startParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    if (startDate >= endDate) {
      return NextResponse.json(
        { error: 'Start date must be before end date' },
        { status: 400 }
      );
    }

    // Limit to 1 year max for performance
    const maxPeriodMs = 365 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > maxPeriodMs) {
      return NextResponse.json(
        { error: 'Date range cannot exceed 1 year' },
        { status: 400 }
      );
    }

    const analytics = await getSubscriptionAnalytics(
      userId, 
      startDate, 
      endDate,
      { includeDailyBreakdown }
    );

    return NextResponse.json(analytics);

  } catch (error) {
    if (error instanceof SubscriptionAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }

    console.error('Failed to get analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}