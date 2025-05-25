"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  Menu,
  FileTextIcon,
  SettingsIcon,
  CrownIcon,
} from "lucide-react";
import UserButton from "@/components/auth/user-button";
import { useUser } from "@clerk/nextjs";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
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
    {
      name: "Summaries",
      href: "/dashboard/summaries",
      icon: FileTextIcon,
    },
    {
      name: "Logs",
      href: "/dashboard/logs",
      icon: FileTextIcon,
    },
    {
      name: "Settings",
      href: "/dashboard/settings",
      icon: SettingsIcon,
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

      {/* Desktop Sidebar */}
      <div className={cn("hidden md:flex", className)}>
        <div className="flex h-full w-full flex-col space-y-2 bg-background">
          <div className="flex h-14 items-center border-b px-4">
            <Link
              href="/dashboard"
              className="flex items-center font-semibold"
            >
              <span className="text-blue-600 font-bold">tldr</span>
              <span className="font-bold">SEC</span>
            </Link>
          </div>
          <ScrollArea className="flex-1 overflow-auto py-2">
            <nav className="grid gap-1 px-2">
              {navItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                    (pathname === item.href || 
                     (item.href !== "/dashboard" && pathname.startsWith(item.href)))
                      ? "bg-blue-100 text-blue-800"
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
      </div>
    </>
  );
}

function MobileSidebar({
  navItems,
  pathname,
}: {
  navItems: { name: string; href: string; icon: any }[];
  pathname: string;
}) {
  const { user } = useUser();
  
  // For demo purposes - in a real app, this would come from user's database record
  const userPlan = "Pro Plan";
  const isProPlan = userPlan === "Pro Plan";

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center font-semibold">
          <span className="text-blue-600 font-bold">tldr</span>
          <span className="font-bold">SEC</span>
        </Link>
      </div>
      <ScrollArea className="flex-1 overflow-auto py-2">
        <nav className="grid gap-1 px-2">
          {navItems.map((item, index) => (
            <Link
              key={index}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                (pathname === item.href || 
                 (item.href !== "/dashboard" && pathname.startsWith(item.href)))
                  ? "bg-blue-100 text-blue-800"
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