import { NextRequest, NextResponse } from 'next/server';
import { validateFeedbackToken } from '@/lib/email/email-link-tokens';
import { getPrismaClient } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const VALID_VOTES = ['up', 'down'] as const;

// Shared headers for 410 responses: tell crawlers not to cache, and indicate HTML body.
const GONE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
} as const;

function goneResponse(message: string): NextResponse {
  const body = `<!doctype html><meta charset="utf-8"><title>Link expired</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#111}</style><h1>${message}</h1><p>This feedback link is no longer valid. Visit <a href="https://tldrsec.app/">tldrsec.app</a> for the latest.</p>`;
  return new NextResponse(body, { status: 410, headers: GONE_HEADERS });
}

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
    // 410 Gone (not 302 to a noindex page) so Google drops stale bot hits
    // from the index immediately instead of seeing a redirect-to-noindex chain.
    return goneResponse('Invalid feedback link.');
  }

  // Validate vote value
  if (!VALID_VOTES.includes(vote as typeof VALID_VOTES[number])) {
    return goneResponse('Invalid feedback link.');
  }

  // Validate and decode the HMAC token
  const payload = validateFeedbackToken(token);
  if (!payload) {
    return goneResponse('Feedback link expired.');
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
    return new NextResponse('Unable to save feedback. Please try again later.', {
      status: 500,
    });
  }
}
