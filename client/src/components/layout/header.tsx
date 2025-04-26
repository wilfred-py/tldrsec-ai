import { Button } from "@/components/ui/button";
import { 
  MenuIcon,
  BellIcon,
  SunIcon,
  MoonIcon,
  User2Icon,
  LogOutIcon,
  SettingsIcon,
  ChevronDownIcon,
  FileTextIcon
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, formatDistanceToNow } from "date-fns";
import { AuthUser } from "@/lib/auth";
import { Link } from "wouter";
import { getQueryFn } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

// Type definition for filing summary to fix type issues
interface FilingSummary {
  id: number;
  filingId: number;
  ticker: string;
  formType: string;
  summary: string;
  createdAt: string;
}

interface HeaderProps {
  onMenuClick: () => void;
  onDarkModeToggle: () => void;
  darkMode: boolean;
  user: AuthUser | null;
  onLogout: () => void;
}

export function Header({ 
  onMenuClick, 
  onDarkModeToggle, 
  darkMode, 
  user,
  onLogout
}: HeaderProps) {
  // Fetch new summaries since last login
  const { data: newSummaries = [] as FilingSummary[] } = useQuery<FilingSummary[]>({
    queryKey: ['/api/summaries/new'],
    queryFn: getQueryFn<FilingSummary[]>({
      on401: 'returnNull',
      endpoint: '/api/summaries/new',
      method: 'GET'
    }),
    enabled: !!user
  });

  const formattedLastLogin = user?.lastLoginAt 
    ? format(new Date(user.lastLoginAt), "MMM d, yyyy 'at' h:mm a")
    : 'Never';

  return (
    <header className="h-16 flex items-center justify-between border-b bg-card px-4">
      <div className="flex items-center">
        <Button 
          variant="ghost" 
          size="icon"
          className="lg:hidden" 
          onClick={onMenuClick}
        >
          <MenuIcon className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onDarkModeToggle}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {darkMode ? (
            <SunIcon className="h-5 w-5" />
          ) : (
            <MoonIcon className="h-5 w-5" />
          )}
        </Button>
        
        <DropdownMenu>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Notifications">
                    <div className="relative">
                      <BellIcon className="h-5 w-5" />
                      {newSummaries.length > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                          {newSummaries.length > 9 ? '9+' : newSummaries.length}
                        </span>
                      )}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                View new summaries since your last login
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>
              New Summaries
              <div className="text-xs text-muted-foreground mt-1">
                Since your last login: {formattedLastLogin}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {newSummaries.length === 0 ? (
              <div className="py-3 px-2 text-center text-sm text-muted-foreground">
                No new summaries available
              </div>
            ) : (
              <>
                {newSummaries.slice(0, 5).map((summary: FilingSummary) => (
                  <DropdownMenuItem key={summary.id} asChild>
                    <Link href={`/summaries/${summary.filingId}`}>
                      <div className="flex gap-2 w-full py-1">
                        <FileTextIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 overflow-hidden">
                          <div className="font-medium truncate">{summary.ticker} - {summary.formType}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(summary.createdAt))} ago
                          </div>
                        </div>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                ))}
                
                {newSummaries.length > 5 && (
                  <DropdownMenuItem asChild>
                    <Link href="/summaries">
                      <div className="w-full text-center text-sm font-medium text-primary">
                        View all {newSummaries.length} summaries
                      </div>
                    </Link>
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                {user?.username?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="hidden sm:block min-w-[80px] text-sm font-medium">
                {user?.username || "User"}
              </div>
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <div className="flex items-center gap-2 w-full">
                  <SettingsIcon className="h-4 w-4" />
                  <span>Settings</span>
                </div>
              </Link>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={onLogout}>
              <LogOutIcon className="h-4 w-4 mr-2" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
