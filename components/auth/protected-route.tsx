"use client";

import { useAuthContext } from "@/lib/context/auth-context";
import { useEffect } from "react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

/**
 * A component that protects routes by requiring authentication
 * Shows a loading state while checking auth, redirects if not authenticated
 */
export function ProtectedRoute({
  children,
  fallback,
  redirectTo = "/sign-in"
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthContext();

  useEffect(() => {
    // If done loading and not authenticated, redirect
    if (!isLoading && !isAuthenticated) {
      redirect(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo]);

  // While checking auth status, show loading state
  if (isLoading) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-[250px]" />
        <Skeleton className="h-[125px] w-full" />
        <Skeleton className="h-[125px] w-full" />
        <Skeleton className="h-[125px] w-full" />
      </div>
    );
  }

  // User is authenticated, show protected content
  return <>{children}</>;
}

export default ProtectedRoute; 