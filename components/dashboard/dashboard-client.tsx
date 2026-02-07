"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard";
import { PlusIcon, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TickerSearchResult } from "@/lib/api/types";
import { Company, FilingPreferences } from "@/lib/api/types";
import {
  getTrackedCompanies,
  addTrackedCompany,
  deleteTrackedCompany,
  updateCompanyPreferences,
} from "@/lib/api/ticker-service";
import { useAsync } from "@/lib/hooks/use-async";
import { TutorialGuide } from "@/components/onboarding/tutorial-guide";
import {
  TickersTable,
  TickersLoadingSkeleton,
} from "@/components/dashboard/tickers-table";

interface DashboardClientProps {
  showWelcome?: boolean;
  shouldMergePending?: boolean;
  subscriptionSuccess?: boolean;
}

export function DashboardClient({ showWelcome = false, shouldMergePending = false, subscriptionSuccess = false }: DashboardClientProps) {
  // State for tracked companies
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [showInlineAdd, setShowInlineAdd] = useState(false);

  // Prefetched company list for search
  const [allCompanies, setAllCompanies] = useState<TickerSearchResult[]>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [emptyStateResults, setEmptyStateResults] = useState<
    TickerSearchResult[]
  >([]);

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialProgress, setTutorialProgress] = useState(0);
  const [hasMergedPending, setHasMergedPending] = useState(false);

  // Async hooks for API calls
  const {
    execute: executeGetCompanies,
    isLoading: isLoadingCompanies,
    error: companiesError,
  } = useAsync([]);
  const { execute: executeAddTicker } = useAsync();
  const { execute: executeDeleteTicker, isLoading: isDeletingTicker } =
    useAsync();
  const { execute: executeUpdatePreferences } = useAsync();

  // Load tracked companies
  const loadCompanies = useCallback(async () => {
    try {
      const response = await executeGetCompanies(() => getTrackedCompanies());
      if (response && "data" in response && Array.isArray(response.data)) {
        setCompanies(response.data);
      } else {
        setCompanies([]);
      }
    } catch (error) {
      console.error("Error loading companies:", error);
      toast.error("Failed to load tracked companies");
    }
  }, [executeGetCompanies, setCompanies]);

  // Merge pending onboarding tickers for existing users
  useEffect(() => {
    if (!shouldMergePending || hasMergedPending) return;

    const mergePending = async () => {
      try {
        const response = await fetch('/api/onboarding/merge-pending', {
          method: 'POST',
        });

        if (response.ok) {
          const result = await response.json();
          if (result.merged && result.tickersCreated?.length > 0) {
            toast.success(`Added ${result.tickersCreated.length} ticker(s) from onboarding`);
            // Reload companies to show the merged tickers
            loadCompanies();
          }
        }
      } catch (error) {
        console.error('Error merging pending tickers:', error);
      } finally {
        setHasMergedPending(true);
      }
    };

    mergePending();
  }, [shouldMergePending, hasMergedPending, loadCompanies]);

  // Load tracked companies on component mount
  useEffect(() => {
    loadCompanies();

    // Check if user is new and should see tutorial (from URL param or localStorage)
    const hasSeenTutorial = localStorage.getItem("hasSeenTutorial");
    if (showWelcome || !hasSeenTutorial) {
      setShowTutorial(true);
      localStorage.setItem("hasSeenTutorial", "true");
    }

    // Load tutorial progress if available
    const savedProgress = localStorage.getItem("tutorialProgress");
    if (savedProgress) {
      setTutorialProgress(parseInt(savedProgress, 10));
    }
  }, [loadCompanies, showWelcome]);

  // Show success toast when subscription is activated
  useEffect(() => {
    if (subscriptionSuccess) {
      toast.success('Welcome to your new plan!', {
        description: 'Your subscription is now active. Start tracking more companies!',
        duration: 5000,
      });
    }
  }, [subscriptionSuccess]);

  // Lazy-load companies for search - only fetch when user clicks Add Ticker
  const loadCompaniesForSearch = useCallback(async () => {
    if (companiesLoaded) return;
    try {
      const response = await fetch("/api/companies/list");
      if (response.ok) {
        const data = (await response.json()) as {
          companies?: Array<{ symbol: string; name: string }>;
        };
        if (data.companies && Array.isArray(data.companies)) {
          setAllCompanies(data.companies);
          setCompaniesLoaded(true);
        }
      }
    } catch (error) {
      console.error("Error loading companies for search:", error);
    }
  }, [companiesLoaded]);

  // Handle adding a ticker
  const handleAddTicker = async (symbol: string, name: string) => {
    setShowInlineAdd(false);

    // Check if this ticker already exists
    const alreadyTracked = companies.some(
      (company) => company.symbol.toUpperCase() === symbol.toUpperCase()
    );
    if (alreadyTracked) {
      toast.info(`${symbol} is already in your tracked companies`);
      return;
    }

    // Create a new company object for optimistic update
    const newCompany: Company = {
      id: `temp-${Date.now()}`,
      symbol,
      name,
      lastFiling: "—",
      lastFilingDate: undefined,
      summaryCount: 0,
      preferences: {
        tenK: true,
        tenQ: true,
        eightK: true,
        form4: false,
        other: false,
      },
    };

    // Optimistic update
    setCompanies((prevCompanies) => [newCompany, ...prevCompanies]);

    try {
      const result = await executeAddTicker(() =>
        addTrackedCompany(symbol, name)
      );

      if (result && result.success && result.data) {
        toast.success(`Added ${symbol} to your tracked companies`);

        // Update with real data from response
        setCompanies((prevCompanies) =>
          prevCompanies.map((c) =>
            c.id === newCompany.id
              ? {
                  ...result.data,
                  name: result.data.name,
                }
              : c
          )
        );

        // Update tutorial progress
        if (showTutorial && tutorialProgress === 0) {
          setTutorialProgress(1);
        }
      } else {
        // Revert optimistic update
        setCompanies((prevCompanies) =>
          prevCompanies.filter((company) => company.id !== newCompany.id)
        );

        let errorMessage = `Failed to add ${symbol}`;
        if (!result.success && result.data === null) {
          errorMessage = `Failed to add ${symbol}: The ticker may already be tracked or not exist`;
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      // Revert on error
      setCompanies((prevCompanies) =>
        prevCompanies.filter((company) => company.id !== newCompany.id)
      );
      console.error("Error adding ticker:", error);
      toast.error(`Failed to add ${symbol}`);
    }
  };

  // Handle deleting a ticker
  const handleDeleteTicker = async () => {
    if (!currentCompany) return;

    try {
      await executeDeleteTicker(() => deleteTrackedCompany(currentCompany.id));
      toast.success(`Removed ${currentCompany.symbol} from tracked companies`);

      setCompanies((prev) => prev.filter((c) => c.id !== currentCompany.id));
      setIsDeleteDialogOpen(false);
      setCurrentCompany(null);
    } catch (error) {
      console.error("Error deleting ticker:", error);
      toast.error(`Failed to remove ${currentCompany.symbol}`);
    }
  };

  // Handle preference change
  const handlePreferenceChange = useCallback(
    async (
      company: Company,
      preferenceKey: keyof FilingPreferences,
      value: boolean
    ) => {
      // Optimistic update
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === company.id
            ? {
                ...c,
                preferences: {
                  ...c.preferences,
                  [preferenceKey]: value,
                } as FilingPreferences,
              }
            : c
        )
      );

      try {
        await executeUpdatePreferences(() =>
          updateCompanyPreferences(company.id, { [preferenceKey]: value })
        );
      } catch (error) {
        // Revert on error
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === company.id
              ? {
                  ...c,
                  preferences: {
                    ...c.preferences,
                    [preferenceKey]: !value,
                  } as FilingPreferences,
                }
              : c
          )
        );
        console.error("Error updating preferences:", error);
        toast.error(`Failed to update preference`);
      }
    },
    [executeUpdatePreferences]
  );


  // Handle delete click from table
  const handleDeleteClick = useCallback((company: Company) => {
    setCurrentCompany(company);
    setIsDeleteDialogOpen(true);
  }, []);

  const showEmptyState =
    (companies?.length === 0 && !isLoadingCompanies) || companiesError;

  return (
    <div className="space-y-6">
      <DashboardHeader heading="Dashboard" />

      {/* Tracked Tickers */}
      <div className="landing-card">
        <div className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-left">
              <h2 className="text-lg font-semibold">Tracked Tickers</h2>
              <p className="text-sm text-muted-foreground">
                Manage your tracked companies.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  loadCompaniesForSearch();
                  setShowInlineAdd(true);
                }}
                className="gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
                data-tutorial="add-ticker"
                disabled={showInlineAdd}
                size="lg"
              >
                <PlusIcon className="h-5 w-5 mr-1" />
                <span className="hidden sm:inline">Add Ticker</span>
                <span className="inline sm:hidden">Add</span>
              </Button>
            </div>
          </div>
        </div>

        {isLoadingCompanies ? (
          <div className="overflow-hidden">
            <TickersLoadingSkeleton />
          </div>
        ) : showEmptyState ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-4 sm:p-8 text-center space-y-4">
            <h3 className="text-base font-medium">No companies tracked yet</h3>
            <p className="text-sm text-muted-foreground">
              Start tracking companies to receive SEC filing summaries.
            </p>
            <Button
              className="mt-2 bg-primary hover:bg-primary/90"
              size="lg"
              onClick={() => {
                loadCompaniesForSearch();
                setShowInlineAdd(true);
              }}
            >
              <PlusIcon className="h-5 w-5 mr-1" />
              Add Your First Company
            </Button>
            {/* Show inline search in empty state */}
            {showInlineAdd && (
              <div className="w-full max-w-md mt-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Type to search ticker or company..."
                    className="pl-8"
                    autoFocus
                    onChange={(e) => {
                      const query = e.target.value.toLowerCase();
                      if (query.length >= 1) {
                        const filtered = allCompanies
                          .filter(
                            (c) =>
                              c.symbol.toLowerCase().includes(query) ||
                              c.name.toLowerCase().includes(query)
                          )
                          .slice(0, 8);
                        setEmptyStateResults(filtered);
                      } else {
                        setEmptyStateResults([]);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setShowInlineAdd(false);
                    }}
                  />
                </div>
                {emptyStateResults.length > 0 && (
                  <div className="mt-2 bg-background border rounded-md shadow-lg">
                    {emptyStateResults.map((result) => (
                      <div
                        key={result.symbol}
                        className="px-3 py-2 cursor-pointer hover:bg-accent/50 flex justify-between items-center"
                        onClick={() =>
                          handleAddTicker(result.symbol, result.name)
                        }
                      >
                        <span className="font-semibold">{result.symbol}</span>
                        <span className="text-muted-foreground text-sm">
                          {result.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInlineAdd(false)}
                  className="mt-2"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ) : (
          <TickersTable
            data={companies}
            showInlineAdd={showInlineAdd}
            allCompanies={allCompanies}
            onAddTicker={handleAddTicker}
            onCancelAdd={() => setShowInlineAdd(false)}
            onPreferenceChange={handlePreferenceChange}
            onDeleteClick={handleDeleteClick}
          />
        )}
      </div>


      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md border border-gray-200 dark:border-zinc-700 shadow-2xl bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Remove Ticker
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {currentCompany?.symbol}
              </span>{" "}
              from your tracked companies? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="sm:order-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteTicker}
              disabled={isDeletingTicker}
              className="bg-red-600 hover:bg-red-700 text-white sm:order-2"
            >
              {isDeletingTicker ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tutorial Guide */}
      <TutorialGuide
        active={showTutorial}
        onComplete={() => setShowTutorial(false)}
        initialProgress={tutorialProgress}
      />
    </div>
  );
}
