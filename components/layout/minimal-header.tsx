"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreditCard, Activity } from "lucide-react";
import UserButton from "@/components/auth/user-button";
import { useAdminStatus } from "@/lib/hooks/use-admin-status";
import { Badge } from "@/components/ui/badge";

export function MinimalHeader() {
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--landing-border)] bg-[var(--landing-bg)]">
      <div className="container max-w-5xl mx-auto flex h-14 items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center font-semibold">
          <span className="text-[var(--landing-primary)] font-bold text-lg">tldr</span>
          <span className="font-bold text-lg">SEC</span>
        </Link>

        {/* Right side: Admin + Manage Plan + User */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Admin Monitoring Link */}
          {!adminLoading && isAdmin && (
            <>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="hidden sm:flex"
              >
                <Link href="/dashboard/monitoring">
                  <Activity className="h-4 w-4 mr-2" />
                  Monitoring
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Admin
                  </Badge>
                </Link>
              </Button>

              {/* Mobile: icon only */}
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="sm:hidden"
              >
                <Link href="/dashboard/monitoring" aria-label="Monitoring">
                  <Activity className="h-5 w-5" />
                </Link>
              </Button>
            </>
          )}

          {/* Manage Plan Button */}
          <Button
            variant="outline"
            size="sm"
            asChild
            className="hidden sm:flex"
          >
            <Link href="/dashboard/billing">
              <CreditCard className="h-4 w-4 mr-2" />
              Manage Plan
            </Link>
          </Button>

          {/* Mobile: icon only */}
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="sm:hidden"
          >
            <Link href="/dashboard/billing" aria-label="Manage Plan">
              <CreditCard className="h-5 w-5" />
            </Link>
          </Button>

          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </div>
    </header>
  );
}
