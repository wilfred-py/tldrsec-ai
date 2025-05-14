"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton } from "@/components/auth";
import { useAuth } from "@clerk/nextjs";

export function Navbar() {
  const { isSignedIn } = useAuth();

  return (
    <nav className="border-b bg-background">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="text-lg font-bold">tldrSEC</span>
          </Link>
          <div className="hidden gap-6 md:flex">
            {isSignedIn && (
              <>
                <Link href="/dashboard" className="text-sm font-medium">
                  Dashboard
                </Link>
                <Link href="/settings" className="text-sm font-medium">
                  Settings
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isSignedIn ? (
            <UserButton />
          ) : (
            <>
              <SignInButton className="hidden sm:flex" />
              <SignUpButton />
            </>
          )}
        </div>
      </div>
    </nav>
  );
} 