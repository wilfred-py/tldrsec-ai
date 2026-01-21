import { NextResponse } from 'next/server';

/**
 * @deprecated This endpoint is deprecated as of auth-first onboarding flow.
 * Users now sign up first via Clerk, then complete onboarding directly.
 * Pending onboarding merge is no longer needed.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Please complete onboarding directly after signing up.',
      redirectUrl: '/onboarding'
    },
    { status: 410 } // 410 Gone - resource no longer available
  );
}
