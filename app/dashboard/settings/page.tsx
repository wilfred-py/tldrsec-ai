import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import SettingsForm from "@/components/settings/SettingsForm";
import UserProfileSection from "@/components/settings/UserProfileSection";
import { getPrismaClient } from "@/lib/db/prisma";

// Calls currentUser() (Clerk server) — needs request-time render. Moved from
// app/dashboard/layout.tsx (streaming-perf-v2 Subtask 2).
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Fetch subscription tier and ticker count for dynamic settings card
  let subscriptionTier = 'FREE';
  let tickerCount = 0;
  const email = user.emailAddresses?.[0]?.emailAddress;
  if (email) {
    try {
      const prisma = getPrismaClient();
      const dbUser = await prisma.user.findUnique({
        where: { email },
        select: {
          subscriptionTier: true,
          _count: { select: { tickers: true } },
        },
      });
      if (dbUser) {
        subscriptionTier = dbUser.subscriptionTier;
        tickerCount = dbUser._count.tickers;
      }
    } catch {
      // Non-fatal, defaults are fine
    }
  }

  return (
    <div className="space-y-8">
      <DashboardHeader heading="Settings" description="Manage your account settings and preferences." />

      {/* User Profile Section */}
      <UserProfileSection user={user} subscriptionTier={subscriptionTier} tickerCount={tickerCount} />

      {/* Notification Preferences */}
      <SettingsForm />
    </div>
  );
}