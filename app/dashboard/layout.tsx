import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// REQUIRED: DashboardShell renders <MinimalHeader> which calls Clerk's
// useUser() hook. Without ClerkProvider at build time (env vars missing in CI),
// static prerendering of any /dashboard/** page fails with:
//   "useUser can only be used within the <ClerkProvider /> component"
//
// We tried removing this to "restore Router Cache" but that was wrong: the
// Router Cache fix is `experimental.staleTimes` in next.config.js (sets
// dynamic-route TTL to 10s), which works regardless of whether the layout is
// build-time-static or request-time-rendered. force-dynamic on the layout
// just shifts rendering from build to request — it does NOT bypass the
// client-side Router Cache. Back-nav within 10s still hits the cache.
//
// See: streaming-perf-v2 Subtask 2 + CLAUDE.md item #18.
export const dynamic = "force-dynamic";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <DashboardShell>{children}</DashboardShell>;
}
