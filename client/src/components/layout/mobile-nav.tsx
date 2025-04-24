import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileText, User, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MobileNav() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [visible, setVisible] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [hideTimer, setHideTimer] = useState<NodeJS.Timeout | null>(null);

  // Handle scroll events
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      if (!isScrolling) {
        setIsScrolling(true);
      }
      
      // Clear previous timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      
      // Set new timeout for when scrolling stops
      scrollTimeout = setTimeout(() => {
        setIsScrolling(false);
        setVisible(true);
        
        // Auto-hide after 3 seconds
        if (hideTimer) {
          clearTimeout(hideTimer);
        }
        
        const timer = setTimeout(() => {
          setVisible(false);
        }, 3000);
        
        setHideTimer(timer);
      }, 150);
    };
    
    window.addEventListener("scroll", handleScroll);
    
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [isScrolling, hideTimer]);

  // Don't render for large screens
  if (typeof window !== "undefined" && window.innerWidth >= 1024) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm border rounded-full shadow-lg px-4 py-2 z-50 transition-all duration-300 flex items-center justify-around gap-8",
        visible && !isScrolling ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
      )}
    >
      <Link href="/dashboard">
        <button
          className={cn(
            "p-2 rounded-full transition-colors",
            location === "/dashboard" ? "bg-primary/10 text-primary" : "text-muted-foreground"
          )}
        >
          <LayoutDashboard className="w-5 h-5" />
        </button>
      </Link>
      
      <Link href="/summaries">
        <button
          className={cn(
            "p-2 rounded-full transition-colors",
            location === "/summaries" ? "bg-primary/10 text-primary" : "text-muted-foreground"
          )}
        >
          <FileText className="w-5 h-5" />
        </button>
      </Link>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "p-2 rounded-full transition-colors",
              location === "/settings" ? "bg-primary/10 text-primary" : "text-muted-foreground"
            )}
          >
            <User className="w-5 h-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/settings">Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => logout()}
            className="text-destructive"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}