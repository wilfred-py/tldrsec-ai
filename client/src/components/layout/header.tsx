import { Button } from "@/components/ui/button";
import { 
  MenuIcon,
  BellIcon,
  SunIcon,
  MoonIcon,
  User2Icon,
  LogOutIcon,
  SettingsIcon,
  ChevronDownIcon
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AuthUser } from "@/lib/auth";
import { Link } from "wouter";

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
        
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <div className="relative">
            <BellIcon className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              3
            </span>
          </div>
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                {user?.username.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline text-sm font-medium">
                {user?.username || "User"}
              </span>
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <div className="flex items-center gap-2 w-full">
                  <User2Icon className="h-4 w-4" />
                  <span>Your Profile</span>
                </div>
              </Link>
            </DropdownMenuItem>
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
