import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FileText, 
  Settings,
  ChevronRight,
  ChevronLeft,
  Crown
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AuthUser } from "@/lib/auth";
import { useEffect, useState } from "react";

interface SidebarProps {
  expanded: boolean;
  onToggle: () => void;
  user: AuthUser | null;
}

export function Sidebar({ expanded, onToggle, user }: SidebarProps) {
  const [location] = useLocation();
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 0);
  const [shouldAutoCollapse, setShouldAutoCollapse] = useState(false);

  useEffect(() => {
    // Handle window resize
    const handleResize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      
      // Auto-collapse sidebar between 768px and 1024px
      if (width >= 768 && width < 1024) {
        setShouldAutoCollapse(true);
      } else {
        setShouldAutoCollapse(false);
      }
    };

    window.addEventListener("resize", handleResize);
    // Initialize on mount
    handleResize();
    
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Completely hide the sidebar on mobile screens (<768px)
  if (windowWidth > 0 && windowWidth < 768) {
    return null;
  }

  const NavItem = ({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) => {
    const isActive = location === href;
    
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={href}>
              <Button
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  expanded ? "px-3" : "px-2 justify-center"
                )}
              >
                <div className="flex items-center">
                  <div className={expanded ? "mr-2" : ""}>
                    {icon}
                  </div>
                  {expanded && <span>{label}</span>}
                </div>
              </Button>
            </Link>
          </TooltipTrigger>
          {!expanded && <TooltipContent side="right">{label}</TooltipContent>}
        </Tooltip>
      </TooltipProvider>
    );
  };
  
  // When in auto-collapse mode (mid-sized screens), force the sidebar to be collapsed
  const isCollapsed = shouldAutoCollapse ? false : expanded;

  return (
    <aside 
      className={cn(
        "border-r bg-card h-screen z-30 transition-all duration-300",
        // Fixed position with different widths based on state
        "fixed",
        // Width control based on expanded state and viewport
        isCollapsed ? "w-64" : "w-14",
        // When auto-collapsed on medium screens, show only icons
        shouldAutoCollapse ? "w-14" : "",
      )}
    >
      <div className="h-full flex flex-col">
        <div className="flex items-center h-16 px-4 border-b">
          <h1 className="text-xl font-bold text-primary whitespace-nowrap">
            {isCollapsed && !shouldAutoCollapse ? "tldrSEC" : "tS"}
          </h1>
          
          {!shouldAutoCollapse && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="ml-auto"
              onClick={onToggle}
            >
              {isCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
        </div>
        
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          <NavItem 
            href="/dashboard" 
            icon={<LayoutDashboard className="h-5 w-5" />} 
            label="Dashboard" 
          />
          
          <NavItem 
            href="/summaries" 
            icon={<FileText className="h-5 w-5" />} 
            label="Summaries" 
          />
          
          <NavItem 
            href="/settings" 
            icon={<Settings className="h-5 w-5" />} 
            label="Settings" 
          />
        </nav>
        
        {/* Subscription status indicator at bottom of sidebar */}
        <div className={cn(
          "p-3 m-2 rounded-lg border",
          user?.subscriptionStatus === 'premium' 
            ? "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700" 
            : "bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
        )}>
          {isCollapsed && !shouldAutoCollapse ? (
            <div className="text-center">
              <h4 className={cn(
                "font-bold mb-1",
                user?.subscriptionStatus === 'premium' 
                  ? "text-green-700 dark:text-green-400" 
                  : "text-gray-700 dark:text-gray-300"
              )}>
                {user?.subscriptionStatus === 'premium' ? 'Pro Plan' : 'Free Plan'}
              </h4>
              
              {user?.subscriptionStatus !== 'premium' && (
                <div className="mt-2">
                  <Link href="/subscribe">
                    <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white border-none">
                      Upgrade Now
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-center">
              {user?.subscriptionStatus === 'premium' ? (
                <Crown className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <Link href="/subscribe">
                  <Button className="w-full h-8 p-0 bg-amber-500 hover:bg-amber-600 text-white border-none">
                    <span className="sr-only">Upgrade to Pro</span>
                    <span className="text-base font-bold">⭐</span>
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
        
        {/* Upgrade promotion for free users */}
        {user && !user.subscriptionStatus && (
          <div className={cn(
            "p-3 m-2 mt-0 rounded-lg transition-all bg-gradient-to-r from-amber-100 to-amber-200 dark:from-amber-900/50 dark:to-amber-800/50 border border-amber-300 dark:border-amber-700",
          )}>
            {isCollapsed && !shouldAutoCollapse ? (
              <div className="text-center">
                <h4 className="font-bold mb-1 text-amber-800 dark:text-amber-300">Upgrade to Pro</h4>
                <p className="text-xs mb-2 text-amber-700 dark:text-amber-400">Track unlimited tickers and get premium features</p>
                <Link href="/subscribe">
                  <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white border-none">
                    Upgrade Now
                  </Button>
                </Link>
              </div>
            ) : (
              <Link href="/subscribe">
                <Button className="w-full p-0 h-10 bg-amber-500 hover:bg-amber-600 text-white border-none">
                  <span className="sr-only">Upgrade to Pro</span>
                  <span className="text-lg font-bold">⭐</span>
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
