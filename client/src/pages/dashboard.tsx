import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/layout/app-layout";
import { StatsCard } from "@/components/dashboard/stats-card";
import { StatsCardSkeleton } from "@/components/dashboard/stats-card-skeleton";
import { TickersTable } from "@/components/dashboard/tickers-table";
import { TickersTableSkeleton } from "@/components/dashboard/tickers-table-skeleton";
import { SummaryDialogSkeleton } from "@/components/dashboard/summary-dialog-skeleton";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BarChart, LineChart, FileTextIcon, MailIcon } from "lucide-react";
import { format } from "date-fns";
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
    // For free users, check if they've reached the maximum number of tracked tickers
    if (user?.subscriptionStatus !== "premium" && tickers && tickers.length >= 2) {
      toast({
        title: "Free plan limit reached",
        description: "You can track up to 2 tickers in the free plan. Upgrade to Pro for unlimited tracking.",
        variant: "destructive",
        action: (
          <Button 
            onClick={() => window.location.href = '/subscribe'} 
            variant="outline" 
            className="bg-amber-500 hover:bg-amber-600 text-white border-none"
          >
            Upgrade
          </Button>
        )
      });
      return;
    }
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
    <div>
      <AppLayout>
        <div className="p-3 sm:p-4 lg:p-6 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
            {/* Title */}
            <div className="text-center mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">tldrSEC Dashboard</h1>
              <p className="text-sm sm:text-base text-muted-foreground px-2">Track your SEC filings and get AI summaries delivered to your inbox</p>
            </div>
            
            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
                    icon={<BarChart className="h-5 w-5 sm:h-6 sm:w-6" />}
                  />
                  
                  <StatsCard
                    title="New Summaries"
                    value={`${stats?.newSummaries || 0}`}
                    subtitle={user?.lastLoginAt ? `since ${format(new Date(user.lastLoginAt), "dd MMM yyyy")}` : ""}
                    icon={<FileTextIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
                    iconBgClass="bg-green-100 dark:bg-green-900/30"
                    iconColorClass="text-green-600 dark:text-green-400"
                  />
                  
                  <StatsCard
                    title="Email Frequency"
                    value={stats?.emailDigests ? (stats.emailDigests.charAt(0).toUpperCase() + stats.emailDigests.slice(1)) : "Daily"}
                    icon={<MailIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
                    iconBgClass="bg-indigo-100 dark:bg-indigo-900/30"
                    iconColorClass="text-indigo-600 dark:text-indigo-400"
                  />
                </>
              )}
            </div>
            
            {/* Enhanced Search Bar */}
            <div className="w-full mx-auto">
              <div className="bg-card border rounded-lg p-3 sm:p-4 shadow-sm">
                <h2 className="text-lg font-medium mb-2">Add Company Tickers</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                  Search for companies to track their SEC filings
                </p>
                
                <div className="relative">
                  <SearchInput
                    placeholder="Search by ticker or company name..."
                    onSearch={handleSearch}
                    className="w-full"
                  />
                  
                  {/* Search results dropdown */}
                  {showSearchResults && searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-card shadow-lg rounded-md max-h-60 overflow-auto border">
                      <ul className="py-1" id="search-results-list">
                        {searchResults.map((result, index) => (
                          <li
                            key={result.ticker}
                            className="px-2 sm:px-4 py-2 sm:py-3 hover:bg-muted cursor-pointer flex items-center justify-between flex-wrap sm:flex-nowrap"
                            data-index={index}
                            onClick={() => handleAddTicker(result)}
                          >
                            <div className="flex items-center w-full sm:w-auto">
                              <span className="font-medium text-base sm:text-lg">{result.ticker}</span>
                              <span className="ml-2 sm:ml-3 text-xs sm:text-sm text-muted-foreground truncate max-w-[150px] sm:max-w-none">
                                {result.companyName}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-auto mt-2 sm:mt-0 sm:ml-4 bg-primary/10 hover:bg-primary/20 border-primary/20"
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent double firing when clicking button
                                handleAddTicker(result);
                              }}
                              disabled={addTickerMutation.isPending}
                            >
                              <span className="font-medium">Add</span>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Tracked Tickers */}
            {isLoadingTickers ? (
              <TickersTableSkeleton />
            ) : (
              <TickersTable 
                tickers={tickers || []} 
                isLoading={false}
                onRemove={handleRemoveTicker}
                isPremium={user?.subscriptionStatus === "premium"}
                maxFreeTickers={2}
              />
            )}
          </div>
        </div>
      </AppLayout>
      
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
