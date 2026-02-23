import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getPrismaClient } from "@/lib/db/prisma";
import { Company } from "@/lib/api/types";
import { THREE_TIER_LIMITS } from "@/lib/subscription/three-tier-limits";

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const params = await searchParams;
  const showWelcome = params.welcome === 'true';
  const shouldMergePending = params.merge === 'pending' || showWelcome;
  const subscriptionSuccess = params.subscription_success === 'true';
  const sessionId = typeof params.session_id === 'string' ? params.session_id : undefined;

  // Fetch tickers server-side to eliminate client-side waterfall
  let initialCompanies: Company[] = [];
  let tutorialCompleted = false;
  let subscriptionTier: 'FREE' | 'PRO' | 'MAX' = 'FREE';
  const email = user.emailAddresses?.[0]?.emailAddress;
  if (email) {
    try {
      const prisma = getPrismaClient();
      const dbUser = await prisma.user.findUnique({
        where: { email },
        include: {
          tickers: {
            include: {
              _count: { select: { summaries: true } },
              summaries: {
                take: 1,
                select: { id: true, filingDate: true },
                orderBy: { filingDate: 'desc' },
              },
            },
          },
        },
      });
      if (dbUser) {
        tutorialCompleted = dbUser.tutorialCompletedAt != null;
        subscriptionTier = (dbUser.subscriptionTier as 'FREE' | 'PRO' | 'MAX') || 'FREE';
        initialCompanies = dbUser.tickers.map(ticker => ({
          id: ticker.id,
          symbol: ticker.symbol,
          name: ticker.companyName,
          lastFiling: "—",
          lastFilingDate: ticker.summaries[0]?.filingDate?.toISOString() ?? undefined,
          summaryCount: ticker._count.summaries,
          preferences: (ticker.preferences as Company['preferences']) || { tenK: true, tenQ: true, eightK: true, form4: true, other: false },
        }));

        // Checkout session verification fallback:
        // If user just returned from Stripe checkout but webhook hasn't fired yet,
        // verify the session directly with Stripe and update the tier.
        if (subscriptionSuccess && sessionId && subscriptionTier === 'FREE') {
          try {
            const { retrieveCheckoutSession, isStripeEnabled } = await import('@/lib/stripe');
            if (isStripeEnabled()) {
              const session = await retrieveCheckoutSession(sessionId);
              if (session && session.payment_status === 'paid' && session.metadata?.planType) {
                const paidPlan = session.metadata.planType as 'PRO' | 'MAX';
                // Update User.subscriptionTier
                await prisma.user.update({
                  where: { id: dbUser.id },
                  data: { subscriptionTier: paidPlan },
                });
                // Also ensure UserSubscription record matches
                await prisma.userSubscription.upsert({
                  where: { userId: user.id },
                  update: {
                    planType: paidPlan,
                    stripeSubscriptionId: session.subscription as string || undefined,
                    isActive: true,
                    updatedAt: new Date(),
                  },
                  create: {
                    userId: user.id,
                    planType: paidPlan,
                    stripeSubscriptionId: session.subscription as string || undefined,
                    stripeCustomerId: session.customer as string || undefined,
                    isActive: true,
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                  },
                });
                subscriptionTier = paidPlan;
                console.log(`[dashboard] Verified checkout session ${sessionId}, set tier to ${paidPlan}`);
              }
            }
          } catch (stripeError) {
            console.error('[dashboard] Checkout session verification failed:', stripeError);
            // Non-fatal - webhook will eventually sync
          }
        }
      }
    } catch (error) {
      console.error('Failed to prefetch tickers:', error);
      // DashboardClient will fall back to client-side fetch
    }
  }

  const tickerLimit = THREE_TIER_LIMITS[subscriptionTier];

  return (
    <DashboardClient
      showWelcome={showWelcome}
      shouldMergePending={shouldMergePending}
      subscriptionSuccess={subscriptionSuccess}
      initialCompanies={initialCompanies}
      tutorialCompleted={tutorialCompleted}
      subscriptionTier={subscriptionTier}
      tickerLimit={tickerLimit}
    />
  );
}
