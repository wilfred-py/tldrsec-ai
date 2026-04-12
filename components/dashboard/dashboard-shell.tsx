"use client";

import { MinimalHeader } from "@/components/layout/minimal-header";
import { ErrorHandler } from "@/components/ui/error-handler";
import { PlanStatusBanner } from "@/components/dashboard/plan-status-banner";
import { useSubscription } from "@/hooks/use-subscription";
import { Suspense } from "react";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { subscription } = useSubscription();

  return (
    <>
      <Suspense fallback={null}>
        <ErrorHandler />
      </Suspense>
      <div
        className="min-h-screen flex flex-col"
        style={{
          backgroundColor: 'var(--brand-bg)',
          backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0, 121, 242, 0.04) 0%, transparent 100%)',
        }}
      >
        {subscription && (
          <PlanStatusBanner
            planType={subscription.planType as "FREE" | "PRO" | "MAX"}
            daysRemaining={subscription.daysRemaining}
            isTrialing={subscription.isTrialing}
            isGrandfathered={subscription.isGrandfathered}
          />
        )}
        <MinimalHeader />
        <main className="flex-1">
          <div className="container max-w-7xl mx-auto py-4 md:py-6 px-6 md:px-8 space-y-6">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
