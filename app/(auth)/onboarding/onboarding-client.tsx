"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "@clerk/nextjs";
import { useAuthContext } from "@/lib/context/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  CheckCircle, ArrowRight, Cpu, Heart, ShoppingCart,
  Zap, Home, Banknote, Search, Loader2, ArrowLeft,
  Lightbulb, Layers, Factory, Megaphone, ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { NotificationPreference } from "@/lib/email/notification-types";
import {
  FilingTypePreferences,
  NotificationContentPreferences,
  UIPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_UI_PREFERENCES,
} from "@/lib/user/preference-types";
import { completeOnboardingBatched } from "./actions";
import { THREE_TIER_LIMITS } from "@/lib/subscription/three-tier-limits";
import { CompanyLogo, getLogoUrl } from "@/components/ui/company-logo";
import { OnboardingTransition } from "@/components/onboarding/onboarding-transition";

const TIER_LIMIT = THREE_TIER_LIMITS.FREE;
const isUnlimited = TIER_LIMIT === -1;
const ONBOARDING_SOFT_CAP = 15; // Soft cap for onboarding picker UI only
const MAX_TICKERS = isUnlimited ? ONBOARDING_SOFT_CAP : TIER_LIMIT;

// ---------------------------------------------------------------------------
// GICS Sector definitions (step 1) — 11 standard GICS sectors
// ---------------------------------------------------------------------------
const sectors = [
  {
    id: "information-technology",
    name: "Information Technology",
    icon: Cpu,
    description: "Software, hardware, semiconductors, and IT services",
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  {
    id: "health-care",
    name: "Health Care",
    icon: Heart,
    description: "Pharma, biotech, medical devices, and providers",
    color: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  },
  {
    id: "financials",
    name: "Financials",
    icon: Banknote,
    description: "Banks, insurance, and capital markets",
    color: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  },
  {
    id: "consumer-discretionary",
    name: "Consumer Discretionary",
    icon: ShoppingCart,
    description: "Retail, autos, apparel, hotels, and entertainment",
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  },
  {
    id: "consumer-staples",
    name: "Consumer Staples",
    icon: ShoppingBag,
    description: "Food, beverages, tobacco, and household products",
    color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  },
  {
    id: "energy",
    name: "Energy",
    icon: Zap,
    description: "Oil, gas, and energy equipment and services",
    color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  },
  {
    id: "industrials",
    name: "Industrials",
    icon: Factory,
    description: "Aerospace, defense, machinery, and transportation",
    color: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800",
  },
  {
    id: "communication-services",
    name: "Communication Services",
    icon: Megaphone,
    description: "Telecom, media, and interactive entertainment",
    color: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  },
  {
    id: "materials",
    name: "Materials",
    icon: Layers,
    description: "Chemicals, metals, mining, and construction materials",
    color: "bg-stone-50 text-stone-700 border-stone-200 dark:bg-stone-950 dark:text-stone-300 dark:border-stone-800",
  },
  {
    id: "utilities",
    name: "Utilities",
    icon: Lightbulb,
    description: "Electric, gas, water, and renewable utilities",
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  },
  {
    id: "real-estate",
    name: "Real Estate",
    icon: Home,
    description: "REITs and real estate management",
    color: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CompanyItem {
  symbol: string;
  name: string;
  sector?: string | null;
}

interface BySectorResponse {
  companies: CompanyItem[];
  total: number;
  page: number;
  totalPages: number;
  sectorCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function OnboardingPage() {
  const { isLoading, userName } = useAuthContext();
  const { session } = useSession();
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTransition, setShowTransition] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedEquities, setSelectedEquities] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Step 2 API state — paginated browse
  const [browseCompanies, setBrowseCompanies] = useState<CompanyItem[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotalPages, setBrowseTotalPages] = useState(0);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [sectorCounts, setSectorCounts] = useState<Record<string, number>>({});
  const [isBrowseLoading, setIsBrowseLoading] = useState(false);
  const [activeSectorFilter, setActiveSectorFilter] = useState<string | null>(null);

  // Step 2 API state — search
  const [apiSearchResults, setApiSearchResults] = useState<CompanyItem[]>([]);
  const [isSearchingApi, setIsSearchingApi] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // We need a ref to track selected equities' names for onboarding completion
  const equityNamesRef = useRef<Map<string, string>>(new Map());

  // Default preferences
  const [emailFrequency] = useState<NotificationPreference>(
    DEFAULT_NOTIFICATION_PREFERENCES.emailFrequency
  );
  const [filingTypes] = useState<FilingTypePreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES.filingTypes
  );
  const [contentPreferences] = useState<NotificationContentPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES.contentPreferences
  );
  const [uiPreferences] = useState<UIPreferences>(DEFAULT_UI_PREFERENCES);

  // Initialize page state once auth context is loaded
  useEffect(() => {
    if (userName) {
      // placeholder for user-specific init
    }
  }, [userName]);

  useEffect(() => {
    try {
      if (!isLoading) setInitializing(false);
    } catch (err) {
      console.error("Error during initialization:", err);
      setError("An error occurred while loading. Please try refreshing the page.");
      setInitializing(false);
    }
  }, [isLoading]);

  // -----------------------------------------------------------------------
  // Browse-by-sector fetch
  // -----------------------------------------------------------------------
  const fetchBySector = useCallback(
    async (sectorsList: string[], page: number, filterSector?: string | null) => {
      setIsBrowseLoading(true);
      try {
        const sectorsParam = filterSector ? filterSector : sectorsList.join(",");
        const res = await fetch(
          `/api/companies?sectors=${encodeURIComponent(sectorsParam)}&page=${page}&limit=50`
        );
        if (!res.ok) throw new Error("Failed to fetch companies");
        const data: BySectorResponse = await res.json();

        if (page === 1) {
          setBrowseCompanies(data.companies);
        } else {
          setBrowseCompanies((prev) => [...prev, ...data.companies]);
        }
        setBrowsePage(data.page);
        setBrowseTotalPages(data.totalPages);
        setBrowseTotal(data.total);

        // Only update sector counts from an unfiltered request
        if (!filterSector && data.sectorCounts) {
          setSectorCounts(data.sectorCounts);
        }

        // Preload logos for the fetched page
        data.companies.forEach(({ symbol, name }) => {
          const img = new Image();
          img.src = getLogoUrl(symbol, name);
        });
      } catch (err) {
        console.error("Browse fetch error:", err);
      } finally {
        setIsBrowseLoading(false);
      }
    },
    []
  );

  // Fetch initial sector counts (unfiltered) when entering step 2
  const fetchSectorCounts = useCallback(
    async (sectorsList: string[]) => {
      try {
        const res = await fetch(
          `/api/companies?sectors=${encodeURIComponent(sectorsList.join(","))}&page=1&limit=1`
        );
        if (res.ok) {
          const data: BySectorResponse = await res.json();
          if (data.sectorCounts) setSectorCounts(data.sectorCounts);
        }
      } catch {
        // non-critical
      }
    },
    []
  );

  // -----------------------------------------------------------------------
  // API search
  // -----------------------------------------------------------------------
  const searchApi = useCallback(async (query: string) => {
    if (query.length < 2) {
      setApiSearchResults([]);
      setIsSearchingApi(false);
      return;
    }
    setIsSearchingApi(true);
    try {
      const response = await fetch(`/api/companies?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = (await response.json()) as {
          companies?: Array<{ symbol: string; name: string; sector?: string | null }>;
        };
        if (data.companies && Array.isArray(data.companies)) {
          setApiSearchResults(
            data.companies.slice(0, 20).map((c) => ({
              symbol: c.symbol,
              name: c.name,
              sector: c.sector,
            }))
          );
        }
      }
    } catch (err) {
      console.error("API search error:", err);
    } finally {
      setIsSearchingApi(false);
    }
  }, []);

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (query.length >= 2) {
        setIsSearchingApi(true);
        debounceTimerRef.current = setTimeout(() => searchApi(query), 300);
      } else {
        setApiSearchResults([]);
        setIsSearchingApi(false);
      }
    },
    [searchApi]
  );

  // -----------------------------------------------------------------------
  // Progress
  // -----------------------------------------------------------------------
  const calculateProgress = () => {
    if (currentStep === 1) {
      return Math.min(45, selectedSectors.length * 15);
    }
    const equityProgress = Math.min(40, (selectedEquities.length / MAX_TICKERS) * 40);
    return 50 + Math.round(equityProgress);
  };
  const progress = calculateProgress();

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  const handleSectorToggle = (sectorId: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sectorId) ? prev.filter((id) => id !== sectorId) : [...prev, sectorId]
    );
  };

  const handleEquityToggle = (company: CompanyItem) => {
    const { symbol, name } = company;
    setSelectedEquities((prev) => {
      if (prev.includes(symbol)) {
        equityNamesRef.current.delete(symbol);
        return prev.filter((s) => s !== symbol);
      }
      if (prev.length < MAX_TICKERS) {
        equityNamesRef.current.set(symbol, name);
        return [...prev, symbol];
      }
      return prev;
    });
  };

  const handleSectorFilterClick = (sectorId: string) => {
    const next = activeSectorFilter === sectorId ? null : sectorId;
    setActiveSectorFilter(next);
    setBrowseCompanies([]);
    setBrowsePage(1);
    fetchBySector(selectedSectors, 1, next);
  };

  const handleLoadMore = () => {
    const nextPage = browsePage + 1;
    fetchBySector(selectedSectors, nextPage, activeSectorFilter);
  };

  // Visible companies: search results when searching, browse results otherwise
  const displayedCompanies: CompanyItem[] =
    searchQuery.length >= 2 ? apiSearchResults : browseCompanies;

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------
  const handleNext = () => {
    if (currentStep === 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(2);
        setIsTransitioning(false);
        // Fetch first page of companies for the selected sectors
        setActiveSectorFilter(null);
        setBrowseCompanies([]);
        setBrowsePage(1);
        fetchBySector(selectedSectors, 1);
        fetchSectorCounts(selectedSectors);
      }, 300);
    } else if (currentStep === 2) {
      handleCompleteOnboarding();
    }
  };

  const handleBack = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(currentStep - 1);
      setIsTransitioning(false);
      setSearchQuery("");
      setApiSearchResults([]);
    }, 300);
  };

  // -----------------------------------------------------------------------
  // Complete onboarding
  // -----------------------------------------------------------------------
  const handleCompleteOnboarding = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      const formattedTickers = selectedEquities.map((symbol) => ({
        symbol,
        companyName: equityNamesRef.current.get(symbol) || symbol,
      }));

      const result = await completeOnboardingBatched({
        preferences: {
          notifications: { emailFrequency, filingTypes, contentPreferences },
          ui: uiPreferences,
        },
        tickers: formattedTickers,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to complete onboarding");
      }

      document.cookie = "onboarding_completed=true; path=/; max-age=60; SameSite=Lax";
      setShowTransition(true);

      if (session) {
        session.reload().catch((reloadError) => {
          console.warn("Session reload failed, continuing with navigation:", reloadError);
        });
      }
    } catch (error) {
      console.error("Error completing onboarding:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      setError(errorMessage);
      toast.error("Failed to complete onboarding. Please try again.");
      setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render guards
  // -----------------------------------------------------------------------
  if (isLoading || initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !showTransition) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
              <p className="mb-6">{error}</p>
              <Button onClick={() => { setError(null); setIsSubmitting(false); }}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showTransition) {
    return <OnboardingTransition />;
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="mt-10 mb-2 text-2xl font-bold">Welcome to tldrSEC!</h1>
            <p className="text-muted-foreground">
              Let&apos;s personalize your experience in just 2 quick steps.
            </p>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Step {currentStep} of 2</span>
              <span className="text-muted-foreground">{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} variant="brand" className="h-2" />
          </div>

          {/* Step Container with Transition */}
          <div className="relative overflow-hidden">
            <div
              className={`transition-all duration-300 ease-in-out ${
                isTransitioning
                  ? "translate-x-[-100%] opacity-0"
                  : "translate-x-0 opacity-100"
              }`}
            >
              {/* ============================================================ */}
              {/* Step 1: Sector Selection                                      */}
              {/* ============================================================ */}
              {currentStep === 1 && (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-bold">What sectors interest you?</h2>
                      <p className="text-muted-foreground">
                        Select the industries you&apos;d like to track. You can always change
                        this later.
                      </p>
                    </div>

                    <ScrollArea className="max-h-[calc(100vh-320px)]">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                        {sectors.map((sector, index) => {
                          const Icon = sector.icon;
                          const isSelected = selectedSectors.includes(sector.id);
                          return (
                            <div
                              key={sector.id}
                              className={`cursor-pointer rounded-lg border-2 p-3 opacity-0 animate-slideUp transition-all hover:shadow-md ${
                                isSelected
                                  ? "border-primary bg-primary/10 shadow-md"
                                  : "border-gray-200 hover:border-primary/50 dark:border-gray-700"
                              }`}
                              style={{ animationDelay: `${index * 30}ms` }}
                              onClick={() => handleSectorToggle(sector.id)}
                            >
                              <div className="flex flex-col items-center text-center">
                                <div
                                  className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg border ${sector.color}`}
                                >
                                  <Icon className="h-5 w-5" />
                                </div>
                                <h3 className="mb-1 text-sm font-medium">{sector.name}</h3>
                                <p className="mb-2 text-xs text-muted-foreground">
                                  {sector.description}
                                </p>
                                <div className="h-5 flex items-center justify-center">
                                  {isSelected && (
                                    <CheckCircle className="h-5 w-5 text-primary" />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>

                    <div className="mt-8 flex items-center justify-between">
                      <div></div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          {selectedSectors.length} sector
                          {selectedSectors.length !== 1 ? "s" : ""} selected
                        </span>
                        <Button
                          onClick={handleNext}
                          disabled={selectedSectors.length === 0}
                        >
                          Continue
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ============================================================ */}
              {/* Step 2: Equity Selection (API-powered)                        */}
              {/* ============================================================ */}
              {currentStep === 2 && (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-bold">Choose your first companies</h2>
                      <p className="text-muted-foreground">
                        {isUnlimited
                          ? 'Select the companies you want to track. Browse by sector or search for any company.'
                          : `Select up to ${MAX_TICKERS} tickers to start tracking. Browse by sector or search for any company.`
                        }
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Showing companies in{" "}
                        {selectedSectors
                          .map((id) => sectors.find((s) => s.id === id)?.name)
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>

                    {/* Search */}
                    <div className="relative mb-4">
                      <Input
                        placeholder="Search any SEC-listed company..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-10"
                      />
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      {isSearchingApi && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Sector filter pills */}
                    {searchQuery.length < 2 && (
                      <div className="mb-6 flex flex-wrap gap-2">
                        <button
                          className={cn(
                            badgeVariants({ variant: activeSectorFilter === null ? "default" : "secondary" }),
                            "cursor-pointer rounded-full px-3 py-1"
                          )}
                          onClick={() => {
                            setActiveSectorFilter(null);
                            setBrowseCompanies([]);
                            setBrowsePage(1);
                            fetchBySector(selectedSectors, 1, null);
                          }}
                        >
                          All
                          {Object.values(sectorCounts).reduce((a, b) => a + b, 0) > 0 && (
                            <span className="ml-1 opacity-70">
                              ({Object.values(sectorCounts).reduce((a, b) => a + b, 0).toLocaleString()})
                            </span>
                          )}
                        </button>
                        {selectedSectors.map((sectorId) => {
                          const sector = sectors.find((s) => s.id === sectorId);
                          const count = sectorCounts[sectorId] || 0;
                          return (
                            <button
                              key={sectorId}
                              className={cn(
                                badgeVariants({ variant: activeSectorFilter === sectorId ? "default" : "secondary" }),
                                "cursor-pointer rounded-full px-3 py-1"
                              )}
                              onClick={() => handleSectorFilterClick(sectorId)}
                            >
                              {sector?.name}
                              {count > 0 && (
                                <span className="ml-1 opacity-70">
                                  ({count.toLocaleString()})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Searching indicator */}
                    {isSearchingApi && searchQuery.length >= 2 && (
                      <p className="text-xs text-muted-foreground mb-4 text-center">
                        Searching all SEC-listed companies...
                      </p>
                    )}

                    {/* Company Grid */}
                    <ScrollArea className="max-h-[50vh]">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {displayedCompanies.map((company) => {
                        const isSelected = selectedEquities.includes(company.symbol);
                        const isDisabled =
                          !isSelected && selectedEquities.length >= MAX_TICKERS;
                        return (
                          <div
                            key={company.symbol}
                            className={`cursor-pointer rounded-lg border p-3 transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 shadow-sm"
                                : isDisabled
                                  ? "border-gray-200 bg-muted/50 opacity-50 dark:border-gray-700"
                                  : "border-gray-200 hover:border-primary/50 hover:shadow-sm dark:border-gray-700"
                            }`}
                            onClick={() =>
                              !isDisabled && handleEquityToggle(company)
                            }
                          >
                            <div className="flex items-center gap-3">
                              <CompanyLogo
                                symbol={company.symbol}
                                companyName={company.name}
                                size="md"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{company.symbol}</div>
                                <div className="text-sm text-muted-foreground truncate">
                                  {company.name}
                                </div>
                              </div>
                              {isSelected && (
                                <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    </ScrollArea>

                    {/* Loading indicator for browse */}
                    {isBrowseLoading && searchQuery.length < 2 && (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    )}

                    {/* Load More button */}
                    {searchQuery.length < 2 &&
                      !isBrowseLoading &&
                      browsePage < browseTotalPages && (
                        <div className="mt-4 flex justify-center">
                          <Button variant="outline" onClick={handleLoadMore}>
                            Load More
                            <span className="ml-1 text-muted-foreground text-xs">
                              ({browseCompanies.length} of {browseTotal.toLocaleString()})
                            </span>
                          </Button>
                        </div>
                      )}

                    {/* Empty state */}
                    {displayedCompanies.length === 0 && !isBrowseLoading && !isSearchingApi && (
                      <div className="py-8 text-center text-muted-foreground">
                        {searchQuery.length >= 2
                          ? "No companies found matching your search."
                          : "No companies found. Try searching by name instead."}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="mt-8 flex items-center justify-between">
                      <Button variant="outline" onClick={handleBack}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          {isUnlimited
                            ? `${selectedEquities.length} tickers selected`
                            : `${selectedEquities.length} of ${MAX_TICKERS} tickers selected`
                          }
                        </span>
                        <Button
                          onClick={handleNext}
                          disabled={selectedEquities.length === 0 || isSubmitting}
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              Complete Setup
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
