import { NextResponse } from 'next/server';

/**
 * @deprecated This endpoint is deprecated as of auth-first onboarding flow.
 * Users now sign up first via Clerk, then complete onboarding.
 * Email checking before authentication is no longer needed.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Please sign up first, then complete onboarding.',
      redirectUrl: '/sign-up'
    },
    { status: 410 } // 410 Gone - resource no longer available
  );
}
