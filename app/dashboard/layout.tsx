"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { ProtectedRoute } from "@/components/auth";
import { ErrorHandler } from "@/components/ui/error-handler";
import { Suspense } from "react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <ErrorHandler />
      </Suspense>
      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1">
          <Sidebar className="fixed inset-y-0 z-30 w-64 border-r" />
<main className="flex-1 md:pl-64">
  <div className="container max-w-7xl mx-auto py-8 md:py-10 px-6 md:px-8 space-y-8">
    {children}
  </div>
</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
