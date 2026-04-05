"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle, ArrowRight, ArrowLeft, Search, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CompanyLogo, getLogoUrl } from "@/components/ui/company-logo";
import {
  SECTORS, MAX_TICKERS, IS_UNLIMITED,
  type CompanyItem, type BySectorResponse,
} from "@/app/(auth)/onboarding/types";

interface CompanyStepProps {
  selectedSectors: string[];
  selectedEquities: string[];
  onEquityToggle: (company: CompanyItem) => void;
  onContinue: () => void;
  onBack: () => void;
  isTransitioning: boolean;
  equityNamesRef: React.MutableRefObject<Map<string, string>>;
}

export function CompanyStep({
  selectedSectors,
  selectedEquities,
  onEquityToggle,
  onContinue,
  onBack,
  isTransitioning,
  equityNamesRef: _equityNamesRef,
}: CompanyStepProps) {
  // Browse state
  const [browseCompanies, setBrowseCompanies] = useState<CompanyItem[]>([]);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotalPages, setBrowseTotalPages] = useState(0);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [sectorCounts, setSectorCounts] = useState<Record<string, number>>({});
  const [isBrowseLoading, setIsBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [activeSectorFilter, setActiveSectorFilter] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CompanyItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Full SEC company list for client-side search
  const allCompaniesRef = useRef<CompanyItem[] | null>(null);
  const [secListLoaded, setSecListLoaded] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus heading on mount for a11y
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Fetch full SEC company list once for client-side search
  useEffect(() => {
    let cancelled = false;
    fetch("/api/companies?list=true")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((data: { companies?: CompanyItem[] }) => {
        if (!cancelled && data.companies) {
          allCompaniesRef.current = data.companies;
          setSecListLoaded(true);
        }
      })
      .catch(() => {
        // Non-critical: fallback to API search per keystroke
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch companies by sector
  const fetchBySector = useCallback(
    async (sectorsList: string[], page: number, filterSector?: string | null) => {
      setIsBrowseLoading(true);
      setBrowseError(null);
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

        if (!filterSector && data.sectorCounts) {
          setSectorCounts(data.sectorCounts);
        }

        // Preload logos for visible companies only (first 12)
        data.companies.slice(0, 12).forEach(({ symbol, name }) => {
          const img = new Image();
          img.src = getLogoUrl(symbol, name);
        });
      } catch {
        setBrowseError("Failed to load companies. Please try again.");
      } finally {
        setIsBrowseLoading(false);
      }
    },
    []
  );

  // Initial fetch on mount
  useEffect(() => {
    fetchBySector(selectedSectors, 1);
    // Also fetch sector counts
    fetch(`/api/companies?sectors=${encodeURIComponent(selectedSectors.join(","))}&page=1&limit=1`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BySectorResponse | null) => {
        if (data?.sectorCounts) setSectorCounts(data.sectorCounts);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side search against full SEC list
  const searchClientSide = useCallback((term: string): CompanyItem[] => {
    const list = allCompaniesRef.current;
    if (!list) return [];
    const lower = term.toLowerCase();
    const matches = list.filter(
      (c) => c.symbol.toLowerCase().includes(lower) || c.name.toLowerCase().includes(lower)
    );
    matches.sort((a, b) => {
      const as = a.symbol.toLowerCase();
      const bs = b.symbol.toLowerCase();
      if (as === lower && bs !== lower) return -1;
      if (bs === lower && as !== lower) return 1;
      if (as.startsWith(lower) && !bs.startsWith(lower)) return -1;
      if (bs.startsWith(lower) && !as.startsWith(lower)) return 1;
      return as.localeCompare(bs);
    });
    return matches.slice(0, 20);
  }, []);

  // Fallback API search
  const searchApi = useCallback(async (query: string) => {
    try {
      const res = await fetch(`/api/companies?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json() as { companies?: CompanyItem[] };
        if (data.companies) {
          setSearchResults(data.companies.slice(0, 20));
        }
      }
    } catch {
      // Silent fail, client-side results still shown
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (query.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      // Instant client-side search if SEC list is loaded
      if (secListLoaded) {
        setSearchResults(searchClientSide(query));
        setIsSearching(false);
      } else {
        // Fallback: debounced API search
        setIsSearching(true);
        debounceRef.current = setTimeout(() => searchApi(query), 300);
      }
    },
    [secListLoaded, searchClientSide, searchApi]
  );

  // Paste-tickers handler
  const handlePasteTickers = useCallback(
    (input: string) => {
      const raw = input.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
      const valid: string[] = [];
      const invalid: string[] = [];

      for (const sym of raw) {
        if (/^[A-Z0-9\-.]{1,10}$/.test(sym)) {
          if (!selectedEquities.includes(sym) && !valid.includes(sym)) {
            valid.push(sym);
          }
        } else {
          invalid.push(sym);
        }
      }

      const remaining = MAX_TICKERS - selectedEquities.length;
      const toAdd = valid.slice(0, remaining);

      for (const sym of toAdd) {
        // Resolve company name from SEC list if available
        const match = allCompaniesRef.current?.find((c) => c.symbol === sym);
        onEquityToggle({ symbol: sym, name: match?.name || sym });
      }

      if (invalid.length > 0) {
        toast.error(`Invalid symbols skipped: ${invalid.join(", ")}`);
      }
      if (valid.length > remaining) {
        toast.warning(`Only added ${remaining} tickers (limit reached)`);
      }
    },
    [selectedEquities, onEquityToggle]
  );

  const handleSectorFilterClick = (sectorId: string) => {
    const next = activeSectorFilter === sectorId ? null : sectorId;
    setActiveSectorFilter(next);
    setBrowseCompanies([]);
    setBrowsePage(1);
    fetchBySector(selectedSectors, 1, next);
  };

  const handleEquityClick = (company: CompanyItem) => {
    if (selectedEquities.length >= MAX_TICKERS && !selectedEquities.includes(company.symbol)) {
      toast.info(`You've reached the maximum of ${MAX_TICKERS} tickers`);
      return;
    }
    onEquityToggle(company);
  };

  const displayedCompanies: CompanyItem[] =
    searchQuery.length >= 2 ? searchResults : browseCompanies;

  // Skeleton for loading state
  const skeletonCards = Array.from({ length: 6 }, (_, i) => (
    <div key={`skeleton-${i}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  ));

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="flex flex-col p-6" style={{ maxHeight: "calc(100vh - 80px)" }}>
        <div className="text-center mb-6">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
            Choose your first companies
          </h2>
          <p className="text-muted-foreground">
            {IS_UNLIMITED
              ? "Select the companies you want to track. Browse by sector or search for any company."
              : `Select up to ${MAX_TICKERS} tickers to start tracking. Browse by sector or search for any company.`}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Showing companies in{" "}
            {selectedSectors
              .map((id) => SECTORS.find((s) => s.id === id)?.name)
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
            className="pl-10 border-gray-200 dark:border-gray-700 focus:border-primary"
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Paste tickers (desktop only) */}
        <div className="hidden sm:block mb-4">
          <Input
            placeholder="Or paste tickers: AAPL, MSFT, NVDA..."
            className="text-sm border-gray-200 dark:border-gray-700 focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handlePasteTickers(e.currentTarget.value);
                e.currentTarget.value = "";
              }
            }}
            onPaste={(e) => {
              const target = e.currentTarget;
              // Delay to let browser populate the pasted value
              setTimeout(() => {
                const val = target.value;
                if (val.includes(",")) {
                  handlePasteTickers(val);
                  target.value = "";
                }
              }, 0);
            }}
          />
        </div>

        {/* Sector filter pills */}
        {searchQuery.length < 2 && (
          <div className="mb-4 flex gap-2 overflow-x-auto flex-nowrap pb-1">
            <button
              className={cn(
                badgeVariants({ variant: activeSectorFilter === null ? "default" : "secondary" }),
                "cursor-pointer rounded-full px-3 py-1 whitespace-nowrap"
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
              const sector = SECTORS.find((s) => s.id === sectorId);
              const count = sectorCounts[sectorId] || 0;
              return (
                <button
                  key={sectorId}
                  className={cn(
                    badgeVariants({ variant: activeSectorFilter === sectorId ? "default" : "secondary" }),
                    "cursor-pointer rounded-full px-3 py-1 whitespace-nowrap"
                  )}
                  onClick={() => handleSectorFilterClick(sectorId)}
                >
                  {sector?.name}
                  {count > 0 && (
                    <span className="ml-1 opacity-70">({count.toLocaleString()})</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Company Grid */}
        <div className="flex-1 min-h-0 overflow-auto">
          {/* Loading skeleton */}
          {isBrowseLoading && browseCompanies.length === 0 && searchQuery.length < 2 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {skeletonCards}
            </div>
          )}

          {/* Error state */}
          {browseError && !isBrowseLoading && (
            <div className="py-8 text-center">
              <p className="text-muted-foreground mb-4">{browseError}</p>
              <Button
                variant="outline"
                onClick={() => fetchBySector(selectedSectors, 1, activeSectorFilter)}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Company cards */}
          {!browseError && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {displayedCompanies.map((company) => {
                const isSelected = selectedEquities.includes(company.symbol);
                const isDisabled = !isSelected && selectedEquities.length >= MAX_TICKERS;
                return (
                  <button
                    key={company.symbol}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isDisabled}
                    className={`text-left rounded-lg border p-3 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : isDisabled
                          ? "border-gray-200 bg-muted/50 opacity-60 cursor-not-allowed dark:border-gray-700"
                          : "border-gray-200 hover:border-primary/50 hover:shadow-sm dark:border-gray-700 cursor-pointer"
                    }`}
                    onClick={() => handleEquityClick(company)}
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
                  </button>
                );
              })}
            </div>
          )}

          {/* Searching indicator */}
          {isSearching && searchQuery.length >= 2 && (
            <p className="text-xs text-muted-foreground my-4 text-center">
              Searching all SEC-listed companies...
            </p>
          )}

          {/* Browse loading spinner */}
          {isBrowseLoading && browseCompanies.length > 0 && searchQuery.length < 2 && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Load More */}
          {searchQuery.length < 2 && !isBrowseLoading && browsePage < browseTotalPages && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchBySector(selectedSectors, browsePage + 1, activeSectorFilter)}
              >
                Load More
                <span className="ml-1 text-muted-foreground text-xs">
                  ({browseCompanies.length} of {browseTotal.toLocaleString()})
                </span>
              </Button>
            </div>
          )}

          {/* Empty state */}
          {displayedCompanies.length === 0 && !isBrowseLoading && !isSearching && !browseError && (
            <div className="py-8 text-center text-muted-foreground">
              {searchQuery.length >= 2
                ? "No companies found matching your search."
                : "No companies found. Try searching by name instead."}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 flex items-center justify-between border-t border-gray-100 dark:border-gray-800">
          <Button variant="outline" onClick={onBack} disabled={isTransitioning}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {IS_UNLIMITED
                ? `${selectedEquities.length} tickers selected`
                : `${selectedEquities.length} of ${MAX_TICKERS} tickers selected`}
            </span>
            <Button
              onClick={onContinue}
              disabled={selectedEquities.length === 0 || isTransitioning}
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
