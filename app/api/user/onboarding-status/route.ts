import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ hasCompletedOnboarding: false });
    }

    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { authProviderId: userId },
      select: { onboardingCompleted: true },
    });

    return NextResponse.json({
      hasCompletedOnboarding: user?.onboardingCompleted ?? false,
    });
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    return NextResponse.json({ hasCompletedOnboarding: false });
  }
}
