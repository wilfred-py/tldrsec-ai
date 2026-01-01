/**
 * POST /api/onboarding/check-email
 *
 * Checks if an email already exists in the system (user account or pending onboarding).
 * Returns the status to determine how to proceed with onboarding.
 *
 * This endpoint is PUBLIC (no authentication required) to support passwordless onboarding.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { emailSchema } from '@/lib/validation/schemas';

/**
 * Possible states for email check
 */
export type EmailCheckStatus =
  | 'NEW_USER'           // Email not found anywhere - can proceed with onboarding
  | 'EXISTING_USER'      // Email has completed onboarding - redirect to sign in
  | 'INCOMPLETE_USER'    // Email has account but incomplete onboarding - redirect to sign in
  | 'PENDING_ONBOARDING'; // Email has pending onboarding data - can resume

export interface EmailCheckResponse {
  status: EmailCheckStatus;
  canProceed: boolean;
  message?: string;
  existingTickerCount?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse<EmailCheckResponse | { error: string }>> {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate email - returns error if invalid or missing
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const validation = emailSchema.safeParse(email);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = validation.data;
    const prisma = getPrismaClient();

    // Check if user exists with this email
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        onboardingCompleted: true,
        _count: { select: { tickers: true } }
      }
    });

    if (existingUser) {
      if (existingUser.onboardingCompleted) {
        return NextResponse.json({
          status: 'EXISTING_USER',
          canProceed: false,
          message: 'You already have an account. Please sign in to access your dashboard.',
          existingTickerCount: existingUser._count.tickers
        });
      } else {
        return NextResponse.json({
          status: 'INCOMPLETE_USER',
          canProceed: false,
          message: 'You have a pending account. Please sign in to continue.',
          existingTickerCount: existingUser._count.tickers
        });
      }
    }

    // Check for pending onboarding (from a previous attempt that didn't complete)
    const pendingOnboarding = await prisma.pendingOnboarding.findUnique({
      where: { email: normalizedEmail }
    });

    if (pendingOnboarding) {
      return NextResponse.json({
        status: 'PENDING_ONBOARDING',
        canProceed: true,
        message: 'Resuming your previous onboarding...'
      });
    }

    // New user - no existing account or pending onboarding
    return NextResponse.json({
      status: 'NEW_USER',
      canProceed: true
    });

  } catch (error) {
    console.error('Error checking email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
