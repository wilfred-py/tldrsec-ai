"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import UserButton from "@/components/auth/user-button";
import { useUser } from "@clerk/nextjs";

export function MinimalHeader() {
  const { user } = useUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--landing-border)] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl mx-auto flex h-14 items-center justify-between px-6 md:px-8">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center">
          <Logo variant="full" size={20} />
        </Link>

        {/* Right side: Manage Subscription + User */}
        <div className="flex items-center gap-4">
          {/* Manage Subscription Button */}
          <Button
            variant="ghost"
            size="sm"
            asChild
          >
            <Link href="/dashboard/billing">
              <CreditCard className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Manage Subscription</span>
              <span className="inline sm:hidden">Billing</span>
            </Link>
          </Button>

          {/* User Profile */}
          <div className="flex items-center gap-3">
            <UserButton afterSignOutUrl="/sign-in" />
            <div className="hidden sm:flex flex-col text-sm">
              <span className="font-medium">{user?.fullName || "User"}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
