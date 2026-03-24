import { NextRequest, NextResponse } from 'next/server';
import { validateFeedbackToken } from '@/lib/email/feedback-tokens';
import { getPrismaClient } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const VALID_VOTES = ['up', 'down'] as const;

/**
 * GET /api/feedback?token=...&vote=up|down
 *
 * Validates an HMAC-signed feedback token from an email link,
 * upserts the user's vote on the summary, and redirects to
 * a thank-you or error page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');
  const vote = searchParams.get('vote');
  const baseUrl = request.nextUrl.origin;

  // Validate required parameters
  if (!token || !vote) {
    return NextResponse.redirect(
      new URL('/feedback/error?reason=missing_params', baseUrl)
    );
  }

  // Validate vote value
  if (!VALID_VOTES.includes(vote as typeof VALID_VOTES[number])) {
    return NextResponse.redirect(
      new URL('/feedback/error?reason=invalid_vote', baseUrl)
    );
  }

  // Validate and decode the HMAC token
  const payload = validateFeedbackToken(token);
  if (!payload) {
    return NextResponse.redirect(
      new URL('/feedback/error?reason=invalid_token', baseUrl)
    );
  }

  const { userId, summaryId } = payload;

  try {
    const prisma = getPrismaClient();

    // Upsert feedback — idempotent on userId + summaryId unique constraint
    await prisma.emailFeedback.upsert({
      where: {
        userId_summaryId: { userId, summaryId },
      },
      create: {
        userId,
        summaryId,
        vote,
      },
      update: {
        vote,
      },
    });

    return NextResponse.redirect(
      new URL(`/feedback/thanks?vote=${vote}`, baseUrl)
    );
  } catch (error) {
    console.error('Failed to save email feedback:', error);
    return NextResponse.redirect(
      new URL('/feedback/error?reason=server_error', baseUrl)
    );
  }
}
