import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { deliverCachedSummaries } from '@/lib/onboarding/cached-summary-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Get user email from Clerk
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    const primaryEmail = user.emailAddresses[0]?.emailAddress;
    if (!primaryEmail) {
      return NextResponse.json({ error: 'no_email' }, { status: 400 });
    }

    // Find user in database
    const prisma = getPrismaClient();
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { authProviderId: userId },
          { email: primaryEmail },
        ],
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'user_not_in_db' }, { status: 404 });
    }

    const userName = dbUser.name || user.firstName || 'there';

    const result = await deliverCachedSummaries(dbUser.id, primaryEmail, userName);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[deliver-summaries] Error:', error);
    return NextResponse.json(
      { delivered: 0, reason: 'internal_error' },
      { status: 500 }
    );
  }
}
