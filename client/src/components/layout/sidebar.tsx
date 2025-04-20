import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FileText, 
  Settings,
  ChevronRight,
  ChevronLeft
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AuthUser } from "@/lib/auth";

interface SidebarProps {
  expanded: boolean;
  onToggle: () => void;
  user: AuthUser | null;
}

export function Sidebar({ expanded, onToggle, user }: SidebarProps) {
  const [location] = useLocation();

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

  return (
    <aside 
      className={cn(
        "border-r bg-card h-screen z-30 transition-all fixed lg:relative",
        expanded ? "w-64" : "w-14"
      )}
    >
      <div className="h-full flex flex-col">
        <div className="flex items-center h-16 px-4 border-b">
          <h1 className="text-xl font-bold text-primary whitespace-nowrap">
            {expanded ? "tldrSEC" : "tS"}
          </h1>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="ml-auto hidden lg:flex"
            onClick={onToggle}
          >
            {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
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
        
        <div className="p-3 border-t">
          {user && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                {user.username.charAt(0).toUpperCase()}
              </div>
              {expanded && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
