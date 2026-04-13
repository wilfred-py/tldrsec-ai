import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// Required: prevents Next.js from statically prerendering dashboard sub-pages
// at build time. Sub-pages like /dashboard/billing use Clerk's useUser() hook
// which fails without ClerkProvider during static builds.
// This does NOT disable the client-side Router Cache for navigations.
export const dynamic = "force-dynamic";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <DashboardShell>{children}</DashboardShell>;
}
