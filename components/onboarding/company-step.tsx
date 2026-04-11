"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle, ArrowRight, ArrowLeft, Search, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CompanyLogo } from "@/components/ui/company-logo";
import {
  SECTORS, MAX_TICKERS, IS_UNLIMITED,
  type CompanyItem,
} from "@/app/(auth)/onboarding/types";
import {
  POPULAR_COMPANIES,
  getPopularBySector,
  getPopularSectorCounts,
} from "@/lib/onboarding/popular-companies";

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
  const [activeSectorFilter, setActiveSectorFilter] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CompanyItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus heading on mount for a11y
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Static company data — no API calls needed for browse
  const sectorCounts = useMemo(
    () => getPopularSectorCounts(selectedSectors),
    [selectedSectors]
  );

  const browseCompanies = useMemo(() => {
    if (activeSectorFilter) {
      return getPopularBySector([activeSectorFilter]);
    }
    return getPopularBySector(selectedSectors);
  }, [selectedSectors, activeSectorFilter]);

  const totalCount = useMemo(
    () => Object.values(sectorCounts).reduce((a, b) => a + b, 0),
    [sectorCounts]
  );

  // API search for full SEC universe
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
      // Silent fail
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

      // Quick client-side filter of popular companies first
      const lower = query.toLowerCase();
      const localMatches = POPULAR_COMPANIES.filter(
        (c) => c.symbol.toLowerCase().includes(lower) || c.name.toLowerCase().includes(lower)
      ).slice(0, 20);
      setSearchResults(localMatches);

      // Also search the full SEC universe via API
      setIsSearching(true);
      debounceRef.current = setTimeout(() => searchApi(query), 300);
    },
    [searchApi]
  );

  const handleSectorFilterClick = (sectorId: string) => {
    setActiveSectorFilter(activeSectorFilter === sectorId ? null : sectorId);
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

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="flex flex-col p-6" style={{ height: "calc(100vh - 120px)", maxHeight: "700px" }}>
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

        {/* Sector filter pills — always visible */}
        <div className="mb-4 flex gap-2 overflow-x-auto flex-nowrap pb-1">
            <button
              className={cn(
                badgeVariants({ variant: activeSectorFilter === null ? "default" : "secondary" }),
                "cursor-pointer rounded-full px-3 py-1 whitespace-nowrap"
              )}
              onClick={() => setActiveSectorFilter(null)}
            >
              All
              {totalCount > 0 && (
                <span className="ml-1 opacity-70">
                  ({totalCount.toLocaleString()})
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

        {/* Company Grid */}
        <div className="flex-1 overflow-auto min-h-[320px]">
          {/* Company cards */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
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

          {/* Searching indicator */}
          {isSearching && searchQuery.length >= 2 && (
            <p className="text-xs text-muted-foreground my-4 text-center">
              Searching all SEC-listed companies...
            </p>
          )}

          {/* Empty state */}
          {displayedCompanies.length === 0 && !isSearching && (
            <div className="py-8 text-center text-muted-foreground">
              {searchQuery.length >= 2
                ? "No companies found matching your search."
                : "No companies found. Try searching by name instead."}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto pt-4 flex items-center justify-between border-t border-gray-100 dark:border-gray-800">
          <Button variant="ghost" onClick={onBack} disabled={isTransitioning}>
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
