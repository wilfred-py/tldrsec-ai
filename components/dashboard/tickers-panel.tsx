"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from "@/components/ui/card";
import { PlusIcon, Loader2, Search, ArrowUpRight } from "lucide-react";
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
  addTrackedCompany,
  deleteTrackedCompany,
  updateCompanyPreferences,
} from "@/lib/api/ticker-service";
import { useAsync } from "@/lib/hooks/use-async";
import {
  TickersTable,
  TickersLoadingSkeleton,
} from "@/components/dashboard/tickers-table";

interface TickersPanelProps {
  initialCompanies: Company[];
  subscriptionTier: "FREE" | "PRO" | "MAX";
  tickerLimit: number;
}

/**
 * Client component managing all ticker CRUD operations.
 * Extracted from DashboardClient to enable Suspense streaming on the dashboard.
 */
export function TickersPanel({
  initialCompanies,
  subscriptionTier,
  tickerLimit,
}: TickersPanelProps) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [showInlineAdd, setShowInlineAdd] = useState(false);

  const [allCompanies, setAllCompanies] = useState<TickerSearchResult[]>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [emptyStateResults, setEmptyStateResults] = useState<TickerSearchResult[]>([]);

  const { isLoading: isLoadingCompanies, error: companiesError } = useAsync([]);
  const { execute: executeDeleteTicker, isLoading: isDeletingTicker } = useAsync();
  const { execute: executeUpdatePreferences } = useAsync();

  const loadCompaniesForSearch = useCallback(async () => {
    if (companiesLoaded) return;
    try {
      const response = await fetch("/api/companies?list=true");
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

  const handleAddTicker = async (symbol: string, name: string) => {
    setShowInlineAdd(false);

    const alreadyTracked = companies.some(
      (company) => company.symbol.toUpperCase() === symbol.toUpperCase()
    );
    if (alreadyTracked) {
      toast.info(`${symbol} is already in your tracked companies`);
      return;
    }

    const newCompany: Company = {
      id: `temp-${Date.now()}`,
      symbol,
      name,
      lastFiling: "—",
      lastFilingDate: undefined,
      summaryCount: 0,
      preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false },
    };

    setCompanies((prev) => [newCompany, ...prev]);

    try {
      const result = await addTrackedCompany(symbol, name);

      if (result.error) {
        setCompanies((prev) => prev.filter((c) => c.id !== newCompany.id));

        const err = result.error as {
          limitReached?: boolean;
          currentTier?: string;
          maxTickers?: number;
          upgradeRequired?: boolean;
          message?: string;
        };
        if (err.limitReached) {
          toast.error(
            `You've reached your ${err.maxTickers}-ticker limit on the ${err.currentTier} plan.`,
            {
              description: err.upgradeRequired
                ? "Upgrade your plan to track more companies."
                : undefined,
              action: err.upgradeRequired
                ? { label: "Upgrade", onClick: () => (window.location.href = "/subscribe") }
                : undefined,
              duration: 8000,
            }
          );
          return;
        }
        toast.error(err.message || `Failed to add ${symbol}`);
        return;
      }

      if (result.data) {
        toast.success(`Added ${symbol} to your tracked companies`);
        setCompanies((prev) =>
          prev.map((c) => (c.id === newCompany.id ? { ...result.data!, name: result.data!.name } : c))
        );
        // Re-stream server data so stats reflect new ticker
        router.refresh();
      } else {
        setCompanies((prev) => prev.filter((c) => c.id !== newCompany.id));
        toast.error(`Failed to add ${symbol}`);
      }
    } catch (error) {
      setCompanies((prev) => prev.filter((c) => c.id !== newCompany.id));
      console.error("Error adding ticker:", error);
      toast.error(`Failed to add ${symbol}`);
    }
  };

  const handleDeleteTicker = async () => {
    if (!currentCompany) return;
    try {
      await executeDeleteTicker(() => deleteTrackedCompany(currentCompany.id));
      toast.success(`Removed ${currentCompany.symbol} from tracked companies`);
      setCompanies((prev) => prev.filter((c) => c.id !== currentCompany.id));
      setIsDeleteDialogOpen(false);
      setCurrentCompany(null);
      // Re-stream server data so stats reflect removed ticker
      router.refresh();
    } catch (error) {
      console.error("Error deleting ticker:", error);
      toast.error(`Failed to remove ${currentCompany.symbol}`);
    }
  };

  const handlePreferenceChange = useCallback(
    async (company: Company, preferenceKey: keyof FilingPreferences, value: boolean) => {
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === company.id
            ? { ...c, preferences: { ...c.preferences, [preferenceKey]: value } as FilingPreferences }
            : c
        )
      );
      try {
        await executeUpdatePreferences(() =>
          updateCompanyPreferences(company.id, { [preferenceKey]: value })
        );
      } catch (error) {
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === company.id
              ? { ...c, preferences: { ...c.preferences, [preferenceKey]: !value } as FilingPreferences }
              : c
          )
        );
        console.error("Error updating preferences:", error);
        toast.error("Failed to update preference");
      }
    },
    [executeUpdatePreferences]
  );

  const handleDeleteClick = useCallback((company: Company) => {
    setCurrentCompany(company);
    setIsDeleteDialogOpen(true);
  }, []);

  const showEmptyState = (companies?.length === 0 && !isLoadingCompanies) || companiesError;
  const isUnlimited = tickerLimit === -1;
  const isAtLimit = !isUnlimited && companies.length >= tickerLimit;
  const canUpgrade = subscriptionTier !== "MAX";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-[var(--brand-secondary)]">Tracked Tickers</CardTitle>
          <CardDescription>
            {!isUnlimited
              ? `${companies.length} / ${tickerLimit} tickers used on ${subscriptionTier === "FREE" ? "Free" : subscriptionTier} plan`
              : "Manage your tracked companies."}
          </CardDescription>
          <CardAction>
            {isAtLimit && canUpgrade ? (
              <Button
                onClick={() => (window.location.href = "/subscribe")}
                className="gap-1 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white font-medium shadow-sm"
                size="lg"
              >
                <ArrowUpRight className="h-4 w-4" />
                <span className="hidden sm:inline">Upgrade to add more</span>
                <span className="inline sm:hidden">Upgrade</span>
              </Button>
            ) : (
              <Button
                onClick={() => {
                  loadCompaniesForSearch();
                  setShowInlineAdd(true);
                }}
                className="gap-1 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white font-medium shadow-sm"
                disabled={showInlineAdd || isAtLimit}
                size="lg"
              >
                <PlusIcon className="h-5 w-5 mr-1" />
                <span className="hidden sm:inline">Add Ticker</span>
                <span className="inline sm:hidden">Add</span>
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          {isLoadingCompanies ? (
            <div className="overflow-hidden">
              <TickersLoadingSkeleton />
            </div>
          ) : showEmptyState ? (
            <div className="rounded-2xl border border-dashed border-[var(--brand-border)] flex min-h-[200px] flex-col items-center justify-center p-4 sm:p-8 text-center space-y-4">
              <h3 className="text-base font-medium text-[var(--brand-secondary)]">No companies tracked yet</h3>
              <p className="text-sm text-[var(--brand-text-muted)]">
                Start tracking companies to receive SEC filing summaries via email.
              </p>
              <Button
                className="mt-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white"
                size="lg"
                onClick={() => {
                  loadCompaniesForSearch();
                  setShowInlineAdd(true);
                }}
              >
                <PlusIcon className="h-5 w-5 mr-1" />
                Add Your First Company
              </Button>
              {showInlineAdd && (
                <div className="w-full max-w-md mt-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--brand-text-muted)]" />
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
                    <div className="mt-2 bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-md shadow-lg">
                      {emptyStateResults.map((result) => (
                        <div
                          key={result.symbol}
                          className="px-3 py-2 cursor-pointer hover:bg-[var(--brand-bg-subtle)] flex justify-between items-center"
                          onClick={() => handleAddTicker(result.symbol, result.name)}
                        >
                          <span className="font-semibold text-[var(--brand-secondary)]">{result.symbol}</span>
                          <span className="text-[var(--brand-text-muted)] text-sm">{result.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setShowInlineAdd(false)} className="mt-2">
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
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md border border-gray-200 dark:border-zinc-700 shadow-2xl bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Remove Ticker</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">{currentCompany?.symbol}</span> from your
              tracked companies? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="sm:order-1">
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
    </>
  );
}
