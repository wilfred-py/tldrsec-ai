"use client";

import { MinimalHeader } from "@/components/layout/minimal-header";
import { ProtectedRoute } from "@/components/auth";
import { ErrorHandler } from "@/components/ui/error-handler";
import { PlanStatusBanner } from "@/components/dashboard/plan-status-banner";
import { useSubscription } from "@/hooks/use-subscription";
import { Suspense } from "react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { subscription } = useSubscription();

  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <ErrorHandler />
      </Suspense>
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--landing-bg)' }}>
        <MinimalHeader />
        {subscription && (
          <PlanStatusBanner planType={subscription.planType as "FREE" | "PRO" | "MAX"} />
        )}
        <main className="flex-1" style={{ backgroundColor: 'var(--landing-bg)' }}>
          <div className="container max-w-7xl mx-auto py-8 md:py-10 px-6 md:px-8 space-y-8">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
