import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [darkMode, setDarkMode] = useState(user?.darkMode || false);

  const handleDarkModeToggle = () => {
    setDarkMode(!darkMode);
  };

  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 0
  );
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener("resize", handleResize);
    // Initialize on mount
    handleResize();
    
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Determine sidebar width based on screen size and expanded state
  let sidebarWidth = "0px"; // Default for mobile (< 768px)
  
  if (windowWidth >= 768) {
    if (windowWidth < 1024) {
      // Medium screens: always collapsed sidebar
      sidebarWidth = "56px"; // 3.5rem or w-14
    } else {
      // Large screens: sidebar width based on user preference
      sidebarWidth = sidebarExpanded ? "256px" : "56px"; // 16rem (w-64) or 3.5rem (w-14)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          expanded={sidebarExpanded} 
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          user={user}
        />
        
        <div 
          className="flex-1 flex flex-col transition-all duration-300"
          style={{ 
            marginLeft: sidebarWidth
          }}
        >
          <Header
            onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
            onDarkModeToggle={handleDarkModeToggle}
            darkMode={darkMode}
            user={user}
            onLogout={logout}
          />
          
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      
      {/* Mobile menu (slides in from left) */}
      <MobileNav />
      
      {/* Mobile bottom navigation bar (appears after scrolling) */}
      <MobileBottomNav />
    </div>
  );
}