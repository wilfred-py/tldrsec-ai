"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  Menu,
  CrownIcon,
} from "lucide-react";
import UserButton from "@/components/auth/user-button";
import { useUser } from "@clerk/nextjs";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  // For demo purposes - in a real app, this would come from user's database record
  const userPlan = "Pro Plan";
  const isProPlan = userPlan === "Pro Plan";

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboardIcon,
    },
  ];

  return (
    <>
      {/* Mobile Sidebar */}
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="md:hidden fixed left-4 top-4 z-40"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <MobileSidebar navItems={navItems} pathname={pathname} />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar - hidden on mobile, visible on md+ */}
      <aside className="hidden md:fixed md:inset-y-0 md:z-30 md:flex md:w-64 md:flex-col border-r border-[var(--landing-border)] bg-background">
        <div className="flex h-full w-full flex-col space-y-2">
          <div className="flex h-14 items-center border-b px-4">
            <Link href="/dashboard" className="flex items-center">
              <Logo variant="full" size={20} />
            </Link>
          </div>
          <ScrollArea className="flex-1 overflow-auto py-2">
            <nav className="grid gap-1 px-2">
              {navItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.href}
                  data-tutorial={item.name === "Summaries" ? "sidebar-summaries" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                    (pathname === item.href ||
                     (item.href !== "/dashboard" && pathname.startsWith(item.href)))
                      ? "bg-[var(--landing-primary-light)] text-[var(--landing-primary)]"
                      : "transparent"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              ))}
            </nav>
          </ScrollArea>
          <div className="border-t p-4">
            <div className="flex items-center space-x-3">
              <UserButton afterSignOutUrl="/sign-in" />
              <div className="flex flex-col text-sm">
                <span className="font-medium">{user?.fullName || "User"}</span>
                <div className="flex items-center text-xs text-muted-foreground">
                  {isProPlan && <CrownIcon className="h-3 w-3 mr-1 text-yellow-500" />}
                  {userPlan}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function MobileSidebar({
  navItems,
  pathname,
}: {
  navItems: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
  pathname: string;
}) {
  const { user } = useUser();

  // For demo purposes - in a real app, this would come from user's database record
  const userPlan = "Pro Plan";
  const isProPlan = userPlan === "Pro Plan";

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center">
          <Logo variant="full" size={20} />
        </Link>
      </div>
      <ScrollArea className="flex-1 overflow-auto py-2">
        <nav className="grid gap-1 px-2">
          {navItems.map((item, index) => (
            <Link
              key={index}
              href={item.href}
              data-tutorial={item.name === "Summaries" ? "sidebar-summaries" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                (pathname === item.href ||
                 (item.href !== "/dashboard" && pathname.startsWith(item.href)))
                  ? "bg-[var(--landing-primary-light)] text-[var(--landing-primary)]"
                  : "transparent"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          ))}
        </nav>
      </ScrollArea>
      <div className="border-t p-4">
        <div className="flex items-center space-x-3">
          <UserButton afterSignOutUrl="/sign-in" />
          <div className="flex flex-col text-sm">
            <span className="font-medium">{user?.fullName || "User"}</span>
            <div className="flex items-center text-xs text-muted-foreground">
              {isProPlan && <CrownIcon className="h-3 w-3 mr-1 text-yellow-500" />}
              {userPlan}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
