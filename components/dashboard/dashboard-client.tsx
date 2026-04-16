"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon, Loader2, Search, ArrowUpRight, Clock } from "lucide-react";
import { CounterDisplay } from "@/components/landing/counter";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TickerSearchResult } from "@/lib/api/types";
import { Company, FilingPreferences } from "@/lib/api/types";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import {
  getTrackedCompanies,
  addTrackedCompany,
  deleteTrackedCompany,
  updateCompanyPreferences,
} from "@/lib/api/ticker-service";
import { useAsync } from "@/lib/hooks/use-async";
import { Confetti } from "@/components/ui/confetti";
import { updateTutorialProgress } from "@/components/onboarding/actions";
import {
  TickersTable,
  TickersLoadingSkeleton,
} from "@/components/dashboard/tickers-table";
import type { ActivitySummary } from "@/components/dashboard/activity-feed";

export const MINUTES_SAVED_STORAGE_KEY = 'dashboard-minutes-saved';

/**
 * Animates from the previously stored value to `target` on mount.
 * First ever visit (no stored value) → animates from 0.
 * Subsequent visits → animates only the delta.
 * Uses localStorage so persistence survives tab closures.
 * Skips animation when target is 0.
 * Exported for testing.
 */
export function useAnimatedMinutes(target: number): { displayed: number; isAnimating: boolean } {
  const [displayed, setDisplayed] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip animation if target is 0 (nothing to show).
    if (target === 0) {
      setDisplayed(0);
      return;
    }

    // Read starting value from localStorage. 0 on first visit or incognito.
    let startValue = 0;
    try {
      const stored = localStorage.getItem(MINUTES_SAVED_STORAGE_KEY);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (Number.isFinite(parsed) && parsed >= 0) startValue = parsed;
      }
    } catch {
      // localStorage unavailable (incognito / Safari private). Fall through with startValue=0.
    }

    // Already at target: no animation needed, just persist.
    if (startValue === target) {
      setDisplayed(target);
      try { localStorage.setItem(MINUTES_SAVED_STORAGE_KEY, String(target)); } catch {}
      return;
    }

    // Step-based animation matching DigitRoller's 400ms transition cadence.
    // Each step must be >= 500ms to let exit+enter animations complete.
    const STEP_INTERVAL = 500;
    const delta = target - startValue;
    const totalSteps = Math.max(2, Math.min(Math.abs(delta), 8));
    let currentStep = 0;

    setIsAnimating(true);
    setDisplayed(startValue);

    const runStep = () => {
      currentStep++;
      const progress = Math.min(currentStep / totalSteps, 1);
      // easeOutQuad for natural deceleration.
      const eased = 1 - (1 - progress) * (1 - progress);
      const next = Math.round(startValue + delta * eased);
      setDisplayed(next);

      if (progress < 1) {
        timeoutRef.current = setTimeout(runStep, STEP_INTERVAL);
      } else {
        setDisplayed(target);
        setIsAnimating(false);
        timeoutRef.current = null;
        try { localStorage.setItem(MINUTES_SAVED_STORAGE_KEY, String(target)); } catch {}
      }
    };

    timeoutRef.current = setTimeout(runStep, STEP_INTERVAL);

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [target]);

  return { displayed, isAnimating };
}

interface DashboardClientProps {
  showWelcome?: boolean;
  shouldMergePending?: boolean;
  subscriptionSuccess?: boolean;
  sessionId?: string;
  initialCompanies?: Company[];
  tutorialCompleted?: boolean;
  subscriptionTier?: 'FREE' | 'PRO' | 'MAX';
  tickerLimit?: number;
  summaryCountTotal?: number;
  totalTimeSavedMinutes?: number;
  recentSummaries?: ActivitySummary[];
  featuredSummaries?: ActivitySummary[];
}

export function DashboardClient({ showWelcome: _showWelcome = false, shouldMergePending: _shouldMergePending = false, subscriptionSuccess = false, sessionId, initialCompanies = [], tutorialCompleted = false, subscriptionTier = 'FREE', tickerLimit = 3, summaryCountTotal = 0, totalTimeSavedMinutes = 0, recentSummaries = [], featuredSummaries = [] }: DashboardClientProps) {
  // Minutes-saved counter: guard against NaN/undefined before rendering.
  const safeMinutes = Number.isFinite(totalTimeSavedMinutes) ? Math.round(totalTimeSavedMinutes as number) : 0;
  const { displayed: displayedMinutes, isAnimating: minutesAnimating } = useAnimatedMinutes(safeMinutes);

  // State for tracked companies
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [showInlineAdd, setShowInlineAdd] = useState(false);

  // Prefetched company list for search
  const [allCompanies, setAllCompanies] = useState<TickerSearchResult[]>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [emptyStateResults, setEmptyStateResults] = useState<
    TickerSearchResult[]
  >([]);

  // First-visit confetti (replaces tutorial overlay)
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFiredRef = useRef(false);
  const isFirstVisit = !tutorialCompleted && typeof window !== 'undefined' && localStorage.getItem('tutorialCompleted') !== 'true';

  // Async hooks for API calls
  const {
    execute: executeGetCompanies,
    isLoading: isLoadingCompanies,
    error: companiesError,
  } = useAsync([]);
  // Note: addTrackedCompany is called directly (not via useAsync) to preserve
  // tier limit error details for user-friendly messaging
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

  // Legacy merge-pending removed (endpoint deprecated)

  // Load tracked companies on component mount (skip if server-provided data exists)
  useEffect(() => {
    if (initialCompanies.length === 0) {
      loadCompanies();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire confetti on first visit (replaces tutorial overlay)
  useEffect(() => {
    if (!isFirstVisit || confettiFiredRef.current) return;
    confettiFiredRef.current = true;

    // Short delay so dashboard content renders first
    const timer = setTimeout(() => {
      setShowConfetti(true);

      // Mark tutorial complete in DB
      updateTutorialProgress(100, { currentStep: 0, currentSubstep: 0, completed: true })
        .catch((err) => console.error('Failed to mark tutorial complete:', err));

      // Client-side guard in case DB write fails
      localStorage.setItem('tutorialCompleted', 'true');

      // Deliver cached summaries (was previously in tutorial completion)
      fetch('/api/onboarding?action=deliver-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch((err) => console.error('Failed to deliver cached summaries:', err));

      // Hide confetti after animation
      setTimeout(() => setShowConfetti(false), 4000);
    }, 500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show success toast when subscription is activated
  // R14: If subscription_success=true but tier is still FREE, the webhook/reconciliation
  // hasn't synced yet. Auto-refresh after 3s to pick up the updated tier.
  useEffect(() => {
    if (subscriptionSuccess) {
      if (subscriptionTier === 'FREE') {
        toast.loading('Verifying subscription...', {
          description: 'Your payment was received. Activating your plan now.',
          duration: 4000,
        });
        const timer = setTimeout(() => window.location.reload(), 3000);
        return () => clearTimeout(timer);
      } else {
        toast.success('Welcome to your new plan!', {
          description: 'Your subscription is now active. Start tracking more companies!',
          duration: 5000,
        });
      }
    }
  }, [subscriptionSuccess, subscriptionTier]);

  // Background Stripe reconciliation: verify subscription status without blocking render
  // Checkout verification always fires (one-time URL param); general reconcile throttled to once per 5 min
  useEffect(() => {
    if (subscriptionTier !== 'FREE') return;

    const reconcileInBackground = async () => {
      try {
        if (subscriptionSuccess && sessionId) {
          const res = await fetch('/api/user?type=verify-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          if (res?.ok) {
            const data = await res.json();
            if (data?.reconciled) window.location.reload();
          }
        } else {
          // Throttle general reconcile to avoid Stripe API abuse
          const lastReconcile = sessionStorage.getItem('lastReconcile');
          if (lastReconcile && Date.now() - Number(lastReconcile) < 5 * 60 * 1000) return;
          sessionStorage.setItem('lastReconcile', String(Date.now()));

          const res = await fetch('/api/user?type=reconcile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (res?.ok) {
            const data = await res.json();
            if (data?.reconciled) window.location.reload();
          }
        }
      } catch {
        // Non-fatal: webhook will eventually sync
      }
    };

    reconcileInBackground();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load companies for search - only fetch when user clicks Add Ticker
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
      // Call directly (not via useAsync) so we can handle tier limit errors with full detail
      const result = await addTrackedCompany(symbol, name);

      // Check for tier limit error
      if (result.error) {
        // Revert optimistic update
        setCompanies((prevCompanies) =>
          prevCompanies.filter((company) => company.id !== newCompany.id)
        );

        const err = result.error as { limitReached?: boolean; currentTier?: string; maxTickers?: number; upgradeRequired?: boolean; message?: string };
        if (err.limitReached) {
          toast.error(
            `You've reached your ${err.maxTickers}-ticker limit on the ${err.currentTier} plan.`,
            {
              description: err.upgradeRequired
                ? "Upgrade your plan to track more companies."
                : undefined,
              action: err.upgradeRequired
                ? { label: "Upgrade", onClick: () => window.location.href = "/subscribe" }
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

        // Update with real data from response
        setCompanies((prevCompanies) =>
          prevCompanies.map((c) =>
            c.id === newCompany.id
              ? {
                  ...result.data!,
                  name: result.data!.name,
                }
              : c
          )
        );

      } else {
        // Revert optimistic update
        setCompanies((prevCompanies) =>
          prevCompanies.filter((company) => company.id !== newCompany.id)
        );
        toast.error(`Failed to add ${symbol}`);
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

  // Ticker limit: -1 means unlimited (MAX tier)
  const isUnlimited = tickerLimit === -1;
  const isAtLimit = !isUnlimited && companies.length >= tickerLimit;
  const canUpgrade = subscriptionTier !== 'MAX';

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="sr-only">Dashboard</h1>
      {/* Time Saved Counter */}
      {(safeMinutes >= 1 || summaryCountTotal > 0) && (
        <div className="flex items-center gap-2 text-sm text-[var(--brand-text-muted)]" role="status" aria-label={`${safeMinutes >= 1 ? `${safeMinutes} minutes saved` : ""}${safeMinutes >= 1 && summaryCountTotal > 0 ? ", " : ""}${summaryCountTotal > 0 ? `${summaryCountTotal} filings summarized` : ""}`}>
          <Clock className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
          {safeMinutes >= 1 && (
            <span className="flex items-center gap-1" aria-hidden="true">
              <CounterDisplay
                count={displayedMinutes}
                isAnimating={minutesAnimating}
                className="text-lg font-bold text-[var(--brand-secondary)]"
                srLabel=""
                suppressLiveRegion
              />
              <span>minutes saved</span>
            </span>
          )}
          {summaryCountTotal > 0 && (
            <span aria-hidden="true">&middot; {summaryCountTotal} filing{summaryCountTotal !== 1 ? "s" : ""} summarized</span>
          )}
        </div>
      )}

      {/* Tabs: Emails / Tickers */}
      <Tabs defaultValue={isFirstVisit ? "tickers" : "activity"} className="w-full">
        <TabsList className="mb-4 bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-1">
          <TabsTrigger value="activity" className="data-[state=active]:bg-[var(--brand-bg-subtle)] data-[state=active]:shadow-sm data-[state=inactive]:text-[var(--brand-text-muted)] px-4 py-1.5 text-sm font-medium rounded-md">Emails</TabsTrigger>
          <TabsTrigger value="tickers" className="data-[state=active]:bg-[var(--brand-bg-subtle)] data-[state=active]:shadow-sm data-[state=inactive]:text-[var(--brand-text-muted)] px-4 py-1.5 text-sm font-medium rounded-md">Tickers</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <ActivityFeed summaries={recentSummaries} featuredSummaries={featuredSummaries} />
        </TabsContent>

        <TabsContent value="tickers">
      <div>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-[var(--brand-secondary)]">Tracked Tickers</h3>
            <p className="text-sm text-muted-foreground">
              {!isUnlimited
                ? `${companies.length} / ${tickerLimit} tickers used on ${subscriptionTier === 'FREE' ? 'Free' : subscriptionTier} plan`
                : "Manage your tracked companies."}
            </p>
          </div>
          <div>
            {isAtLimit && canUpgrade ? (
              <Button
                onClick={() => window.location.href = "/subscribe"}
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
          </div>
        </div>
        <div className="pb-2">

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
                        onClick={() =>
                          handleAddTicker(result.symbol, result.name)
                        }
                      >
                        <span className="font-semibold text-[var(--brand-secondary)]">{result.symbol}</span>
                        <span className="text-[var(--brand-text-muted)] text-sm">
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
      </div>
        </TabsContent>
      </Tabs>

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

      {/* First-visit celebration */}
      <Confetti active={showConfetti} duration={3000} />
    </div>
  );
}
