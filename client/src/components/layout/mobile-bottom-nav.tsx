import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Settings, LayoutDashboard, FileText, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";

export function MobileBottomNav() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [visible, setVisible] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [fadeTimer, setFadeTimer] = useState<NodeJS.Timeout | null>(null);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 0
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Don't show on larger screens
  if (windowWidth > 425) {
    return null;
  }

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      setScrolling(true);
      
      // Clear previous timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      
      // Set new timeout to detect when scrolling stops
      scrollTimeout = setTimeout(() => {
        setScrolling(false);
        setVisible(true);
        
        // Auto-hide after 3 seconds
        if (fadeTimer) {
          clearTimeout(fadeTimer);
        }
        
        const timer = setTimeout(() => {
          setVisible(false);
        }, 3000);
        
        setFadeTimer(timer);
      }, 150);
    };
    
    window.addEventListener("scroll", handleScroll);
    
    // Show initially
    setVisible(true);
    const initialTimer = setTimeout(() => {
      setVisible(false);
    }, 3000);
    setFadeTimer(initialTimer);
    
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [fadeTimer]);

  return (
    <div 
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background/90 backdrop-blur-sm border rounded-full shadow-lg px-4 py-2 transition-all duration-300 flex items-center justify-center gap-8",
        visible && !scrolling ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
      )}
    >
      <Link href="/dashboard">
        <button 
          className={cn(
            "flex flex-col items-center justify-center p-2",
            location === "/dashboard" ? "text-primary" : "text-muted-foreground"
          )}
        >
          <LayoutDashboard size={20} />
          <span className="text-xs mt-1">Dashboard</span>
        </button>
      </Link>
      
      <Link href="/summaries">
        <button 
          className={cn(
            "flex flex-col items-center justify-center p-2",
            location === "/summaries" ? "text-primary" : "text-muted-foreground"
          )}
        >
          <FileText size={20} />
          <span className="text-xs mt-1">Summaries</span>
        </button>
      </Link>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            className={cn(
              "flex flex-col items-center justify-center p-2",
              location === "/settings" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <User size={20} />
            <span className="text-xs mt-1">Account</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <div className="flex items-center">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </div>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={logout} className="text-destructive">
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}