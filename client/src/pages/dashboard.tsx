import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { StatsCard } from "@/components/dashboard/stats-card";
import { StatsCardSkeleton } from "@/components/dashboard/stats-card-skeleton";
import { TickersTable } from "@/components/dashboard/tickers-table";
import { TickersTableSkeleton } from "@/components/dashboard/tickers-table-skeleton";
import { SummaryDialogSkeleton } from "@/components/dashboard/summary-dialog-skeleton";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BarChart, LineChart, FileTextIcon, MailIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SearchResult = {
  ticker: string;
  companyName: string;
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedFiling, setSelectedFiling] = useState<number | null>(null);
  const { toast } = useToast();
  
  // Dashboard data queries
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["/api/stats"],
  });
  
  const { data: tickers, isLoading: isLoadingTickers } = useQuery({
    queryKey: ["/api/tickers"],
  });
  
  const { data: filingSummary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["/api/summaries", selectedFiling],
    enabled: selectedFiling !== null,
  });

  // Add ticker mutation
  const addTickerMutation = useMutation({
    mutationFn: async (ticker: { ticker: string; companyName: string }) => {
      await apiRequest("POST", "/api/tickers", ticker);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      
      // Clear search input and results
      const searchInput = document.querySelector('input[placeholder="Search and add tickers..."]') as HTMLInputElement;
      if (searchInput) {
        searchInput.value = '';
      }
      setSearchResults([]);
      setShowSearchResults(false);
      
      toast({
        title: "Ticker added",
        description: "The ticker has been added to your watchlist.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add ticker. It may already be in your watchlist.",
        variant: "destructive",
      });
    },
  });

  // Update dark mode setting when user changes
  useEffect(() => {
    if (user?.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [user?.darkMode]);

  const handleSearch = async (query: string) => {
    if (query.trim() === '') {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    
    if (query.trim().length < 2) {
      return;
    }
    
    try {
      const response = await apiRequest("GET", `/api/search/tickers?q=${encodeURIComponent(query)}`, undefined);
      const results = await response.json();
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  const handleAddTicker = (ticker: SearchResult) => {
    addTickerMutation.mutate(ticker);
  };

  const handleRemoveTicker = (id: number) => {
    queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
  };

  const handleToggleDarkMode = () => {
    // Client-side immediate toggle
    const isDark = document.documentElement.classList.contains('dark');
    
    if (isDark) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    
    // Asynchronously update the server setting
    apiRequest("POST", "/api/settings/dark-mode", {
      darkMode: !isDark,
    }).catch(error => {
      console.error("Failed to update dark mode setting:", error);
      toast({
        title: "Error",
        description: "Failed to save dark mode preference.",
        variant: "destructive",
      });
    });
  };

  const handleViewSummary = (filingId: number) => {
    setSelectedFiling(filingId);
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar 
        expanded={sidebarExpanded} 
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        user={user}
      />
      
      {/* Mobile sidebar overlay */}
      {sidebarExpanded && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarExpanded(false)}
        />
      )}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
          onDarkModeToggle={handleToggleDarkMode}
          darkMode={!!user?.darkMode}
          user={user}
          onLogout={logout}
        />
        
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
            {/* Title and Search */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h1 className="text-2xl font-bold">Dashboard</h1>
              
              <div className="relative w-full sm:w-auto">
                <SearchInput
                  placeholder="Search and add tickers..."
                  onSearch={handleSearch}
                  className="w-full sm:w-64"
                />
                
                {/* Search results dropdown */}
                {showSearchResults && searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-card shadow-lg rounded-md max-h-60 overflow-auto">
                    <ul className="py-1" id="search-results-list">
                      {searchResults.map((result, index) => (
                        <li
                          key={result.ticker}
                          className="px-3 py-2 hover:bg-muted cursor-pointer flex items-center justify-between"
                          data-index={index}
                          onClick={() => handleAddTicker(result)}
                        >
                          <div className="flex items-center">
                            <span className="font-medium">{result.ticker}</span>
                            <span className="ml-2 text-sm text-muted-foreground">
                              {result.companyName}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-primary hover:text-primary/80"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent double firing when clicking button
                              handleAddTicker(result);
                            }}
                            disabled={addTickerMutation.isPending}
                          >
                            Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {isLoadingStats ? (
                <>
                  <StatsCardSkeleton />
                  <StatsCardSkeleton />
                  <StatsCardSkeleton />
                </>
              ) : (
                <>
                  <StatsCard
                    title="Tracked Tickers"
                    value={stats?.trackedTickers || 0}
                    icon={<BarChart className="h-6 w-6" />}
                  />
                  
                  <StatsCard
                    title="New Summaries"
                    value={stats?.newSummaries || 0}
                    icon={<FileTextIcon className="h-6 w-6" />}
                    iconBgClass="bg-green-100 dark:bg-green-900/30"
                    iconColorClass="text-green-600 dark:text-green-400"
                  />
                  
                  <StatsCard
                    title="Email Digests"
                    value={stats?.emailDigests || "Daily"}
                    icon={<MailIcon className="h-6 w-6" />}
                    iconBgClass="bg-indigo-100 dark:bg-indigo-900/30"
                    iconColorClass="text-indigo-600 dark:text-indigo-400"
                  />
                </>
              )}
            </div>
            
            {/* Recent SEC Filings section removed as requested */}
            
            {/* Tracked Tickers */}
            {isLoadingTickers ? (
              <TickersTableSkeleton />
            ) : (
              <TickersTable 
                tickers={tickers || []} 
                isLoading={false}
                onRemove={handleRemoveTicker}
              />
            )}
          </div>
        </main>
      </div>
      
      {/* Summary Dialog */}
      <Dialog open={selectedFiling !== null} onOpenChange={(open) => !open && setSelectedFiling(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>SEC Filing Summary</DialogTitle>
            <DialogDescription>
              {filingSummary?.ticker} - {new Date(filingSummary?.createdAt).toLocaleDateString()}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto mt-4">
            {isLoadingSummary ? (
              <SummaryDialogSkeleton />
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                <pre className="text-sm whitespace-pre-wrap">{filingSummary?.summary}</pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
