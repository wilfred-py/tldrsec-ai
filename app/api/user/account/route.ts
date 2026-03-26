import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';

/**
 * DELETE /api/user/account
 * Soft-deletes the user account:
 * 1. Cancels Stripe subscription (if active)
 * 2. Sets deletedAt and deleteScheduledFor (30 days)
 * 3. Emails stop (summarize handler checks deletedAt)
 * 4. Daily cron purges after 30 days
 */
export async function DELETE() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prisma = getPrismaClient();

  // Look up DB user by authProviderId
  const dbUser = await prisma.user.findFirst({
    where: { OR: [{ id: clerkUserId }, { authProviderId: clerkUserId }] },
    include: { userSubscription: true },
  });

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (dbUser.deletedAt) {
    return NextResponse.json({ error: 'Account already scheduled for deletion' }, { status: 400 });
  }

  // Step 1: Cancel Stripe subscription if active
  if (dbUser.userSubscription?.stripeSubscriptionId) {
    try {
      const { isStripeEnabled } = await import('@/lib/stripe');
      if (isStripeEnabled()) {
        const stripe = (await import('stripe')).default;
        const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!);
        await stripeClient.subscriptions.cancel(dbUser.userSubscription.stripeSubscriptionId);
      }
    } catch (error) {
      console.error('[delete-account] Failed to cancel Stripe subscription:', error);
      return NextResponse.json(
        { error: 'Failed to cancel subscription. Please contact support.' },
        { status: 500 }
      );
    }
  }

  // Step 2: Soft delete — set deletion schedule
  const now = new Date();
  const deleteScheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: dbUser.id },
    data: {
      deletedAt: now,
      deleteScheduledFor,
      subscriptionTier: 'FREE',
    },
  });

  // Update UserSubscription if exists
  if (dbUser.userSubscription) {
    await prisma.userSubscription.update({
      where: { userId: dbUser.id },
      data: {
        isActive: false,
        cancelAtPeriodEnd: true,
      },
    });
  }

  return NextResponse.json({
    success: true,
    message: 'Account scheduled for deletion',
    deleteScheduledFor: deleteScheduledFor.toISOString(),
  });
}
