"use client";

import { usePathname } from "next/navigation";
import { Navigation } from "@/components/navigation";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isOnboarding = pathname === "/onboarding";

  return (
    <>
      {!isOnboarding && <Navigation />}
      <div className="min-h-screen">
        {children}
      </div>
    </>
  );
} 