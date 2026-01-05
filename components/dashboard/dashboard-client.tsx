"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard";
import { InlineAddRow } from "@/components/dashboard/inline-add-row";
import { TickerSettingsDropdown } from "@/components/dashboard/ticker-settings-dropdown";
import {
  Trash2Icon,
  PlusIcon,
  ArrowUpDown,
  Loader2,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Company, FilingPreferences } from "@/lib/api/types";
import {
  getTrackedCompanies,
  addTrackedCompany,
  deleteTrackedCompany,
  updateCompanyPreferences,
} from "@/lib/api/ticker-service";
import { useAsync } from "@/lib/hooks/use-async";
import { TutorialGuide } from "@/components/onboarding/tutorial-guide";

// Column helper for the table
const columnHelper = createColumnHelper<Company>();

// Items per page constant
const ITEMS_PER_PAGE = 10;

export function DashboardClient() {
  // State for tracked companies
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
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

  // Load tracked companies on component mount
  useEffect(() => {
    loadCompanies();

    // Check if user is new and should see tutorial
    const hasSeenTutorial = localStorage.getItem("hasSeenTutorial");
    if (!hasSeenTutorial) {
      setShowTutorial(true);
      localStorage.setItem("hasSeenTutorial", "true");
    }

    // Load tutorial progress if available
    const savedProgress = localStorage.getItem("tutorialProgress");
    if (savedProgress) {
      setTutorialProgress(parseInt(savedProgress, 10));
    }
  }, [loadCompanies]);

  // Lazy-load companies for search - only fetch when user clicks Add Ticker
  const loadCompaniesForSearch = useCallback(async () => {
    if (companiesLoaded) return; // Already loaded
    try {
      const response = await fetch("/api/companies/list");
      if (response.ok) {
        const data = (await response.json()) as { companies?: Array<{ symbol: string; name: string }> };
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
    setShowInlineAdd(false); // Close inline row

    // Check if this ticker already exists to prevent duplicates
    const alreadyTracked = companies.some(
      (company) => company.symbol.toUpperCase() === symbol.toUpperCase()
    );
    if (alreadyTracked) {
      toast.info(`${symbol} is already in your tracked companies`);
      return;
    }

    // Create a new company object for optimistic update
    const newCompany: Company = {
      id: `temp-${Date.now()}`, // Temporary ID that will be replaced after API refresh
      symbol,
      name, // name property is the company name in the Company interface
      lastFiling: "—",
      lastFilingDate: undefined, // Using undefined instead of null to match Company type
      summaryCount: 0,
      preferences: {
        tenK: true,
        tenQ: true,
        eightK: true,
        form4: false,
        other: false,
      },
    };

    // Optimistically add the company to the list to reduce perceived latency
    setCompanies((prevCompanies) => [newCompany, ...prevCompanies]);

    try {
      // Add the ticker to the database
      const result = await executeAddTicker(() =>
        addTrackedCompany(symbol, name)
      );

      if (result && result.success && result.data) {
        toast.success(`Added ${symbol} to your tracked companies`);

        // Update the temporary company with real data from the response
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

        // Show next step in tutorial if active
        if (showTutorial && tutorialProgress === 0) {
          setTutorialProgress(1);
        }
      } else {
        // Handle API error response - remove the optimistic update
        setCompanies((prevCompanies) =>
          prevCompanies.filter((company) => company.id !== newCompany.id)
        );

        // Get error message from result if available
        let errorMessage = `Failed to add ${symbol}`;
        if (!result.success && result.data === null) {
          errorMessage = `Failed to add ${symbol}: The ticker may already be tracked or not exist`;
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      // Remove the optimistic update on error
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

      // Remove from local state
      setCompanies((prev) => prev.filter((c) => c.id !== currentCompany.id));
      setIsDeleteDialogOpen(false);
      setCurrentCompany(null);
    } catch (error) {
      console.error("Error deleting ticker:", error);
      toast.error(`Failed to remove ${currentCompany.symbol}`);
    }
  };

  // Handle preference change from settings dropdown
  const handlePreferenceChange = useCallback(
    async (company: Company, preferenceKey: string, value: boolean) => {
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
        // Subtle success - no toast for preference toggles to reduce noise
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

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  // Table columns definition with new structure
  const columns = useMemo(
    () => [
      columnHelper.accessor("symbol", {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="pl-0 font-medium"
          >
            Ticker
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: (info) => (
          <div className="font-semibold">{info.getValue()}</div>
        ),
        size: 80,
      }),
      columnHelper.accessor("name", {
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="pl-0 font-medium"
          >
            Company
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: (info) => (
          <div className="text-sm text-muted-foreground truncate max-w-[200px]">
            {info.getValue()}
          </div>
        ),
      }),
      // Latest Filing Date column
      columnHelper.accessor("lastFilingDate", {
        id: "lastFilingDate",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="pl-0 font-medium"
          >
            Latest Filing
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: (info) => (
          <div className="text-sm text-muted-foreground">
            {formatDate(info.getValue())}
          </div>
        ),
        size: 120,
      }),
      // Summary Count column
      columnHelper.accessor("summaryCount", {
        id: "summaryCount",
        header: () => (
          <span className="text-xs font-medium text-center block">
            Summaries
          </span>
        ),
        cell: (info) => (
          <div className="flex justify-center">
            <span className="text-sm font-medium text-muted-foreground">
              {info.getValue() ?? 0}
            </span>
          </div>
        ),
        size: 80,
      }),
      // Settings action column
      columnHelper.accessor((row) => row, {
        id: "settings",
        header: () => null,
        cell: (info) => {
          const company = info.getValue();
          return (
            <TickerSettingsDropdown
              tickerSymbol={company.symbol}
              preferences={company.preferences}
              onPreferenceChange={(key, value) =>
                handlePreferenceChange(company, key, value)
              }
            />
          );
        },
        size: 40,
      }),
      // Delete action column
      columnHelper.accessor((row) => row, {
        id: "actions",
        header: () => null,
        cell: (info) => {
          const company = info.getValue();
          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setCurrentCompany(company);
                setIsDeleteDialogOpen(true);
              }}
              className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              aria-label={`Delete ${company.symbol}`}
            >
              <Trash2Icon className="h-4 w-4" />
            </Button>
          );
        },
        size: 40,
      }),
    ],
    [handlePreferenceChange]
  );

  // Initialize table with pagination
  const table = useReactTable({
    data: companies || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    initialState: {
      pagination: {
        pageSize: ITEMS_PER_PAGE,
      },
    },
  });

  const showEmptyState =
    (companies?.length === 0 && !isLoadingCompanies) || companiesError;

  return (
    <div className="space-y-6">
      <DashboardHeader
        heading="Dashboard"
      />

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
                  loadCompaniesForSearch(); // Lazy load companies on first click
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
            {/* Desktop skeleton */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">
                      <Skeleton className="h-4 w-14" />
                    </TableHead>
                    <TableHead>
                      <Skeleton className="h-4 w-20" />
                    </TableHead>
                    <TableHead>
                      <Skeleton className="h-4 w-24" />
                    </TableHead>
                    <TableHead className="text-center w-[100px]">
                      <Skeleton className="h-4 w-16 mx-auto" />
                    </TableHead>
                    <TableHead className="w-[40px]" />
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-5 w-12" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-8 mx-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8 rounded-md" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8 rounded-md" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile skeleton */}
            <div className="sm:hidden space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="landing-card p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-14" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex gap-1">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t">
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-4 w-8" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
                loadCompaniesForSearch(); // Lazy load companies on first click
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
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} className="group">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {/* Inline Add Row at the top */}
                  {showInlineAdd && (
                    <InlineAddRow
                      companies={allCompanies}
                      onSelect={handleAddTicker}
                      onCancel={() => setShowInlineAdd(false)}
                      columnCount={columns.length}
                    />
                  )}
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() && "selected"}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        No companies found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {companies.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between px-2 py-4">
                  <div className="text-sm text-muted-foreground">
                    Page {table.getState().pagination.pageIndex + 1} of{" "}
                    {table.getPageCount()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {/* Page number buttons */}
                    {(() => {
                      const pageCount = table.getPageCount();
                      const currentPage = table.getState().pagination.pageIndex;
                      const pages: (number | "ellipsis")[] = [];

                      // Always show first page
                      pages.push(0);

                      // Calculate visible page range
                      if (pageCount <= 7) {
                        // Show all pages if 7 or fewer
                        for (let i = 1; i < pageCount - 1; i++) {
                          pages.push(i);
                        }
                      } else {
                        // Show ellipsis for many pages
                        if (currentPage > 2) {
                          pages.push("ellipsis");
                        }
                        // Show pages around current
                        const start = Math.max(1, currentPage - 1);
                        const end = Math.min(pageCount - 2, currentPage + 1);
                        for (let i = start; i <= end; i++) {
                          if (!pages.includes(i)) pages.push(i);
                        }
                        if (currentPage < pageCount - 3) {
                          pages.push("ellipsis");
                        }
                      }

                      // Always show last page if more than 1 page
                      if (pageCount > 1 && !pages.includes(pageCount - 1)) {
                        pages.push(pageCount - 1);
                      }

                      return pages.map((page, idx) =>
                        page === "ellipsis" ? (
                          <span
                            key={`ellipsis-${idx}`}
                            className="px-2 text-muted-foreground"
                          >
                            ...
                          </span>
                        ) : (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "ghost"}
                            size="icon"
                            className={`h-8 w-8 rounded-full transition-colors ${
                              currentPage === page
                                ? "bg-black text-white hover:bg-black"
                                : "hover:bg-black hover:text-white"
                            }`}
                            onClick={() => table.setPageIndex(page)}
                          >
                            {page + 1}
                          </Button>
                        )
                      );
                    })()}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-3">
              {/* Mobile Inline Add Card at the top */}
              {showInlineAdd && (
                <div className="landing-card p-4 bg-muted/30">
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
                          <span className="text-muted-foreground text-sm truncate ml-2">
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
                    className="mt-2 w-full"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              )}

              {table.getRowModel().rows.map((row) => {
                const company = row.original;
                return (
                  <div key={company.id} className="landing-card p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold">{company.symbol}</h3>
                        <p className="text-sm text-muted-foreground">
                          {company.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <TickerSettingsDropdown
                          tickerSymbol={company.symbol}
                          preferences={company.preferences}
                          onPreferenceChange={(key, value) =>
                            handlePreferenceChange(company, key, value)
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCurrentCompany(company);
                            setIsDeleteDialogOpen(true);
                          }}
                          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Filing info for mobile */}
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">
                          Latest Filing
                        </span>
                        <span className="text-sm">
                          {formatDate(company.lastFilingDate)}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">
                          Summaries
                        </span>
                        <span className="text-sm">
                          {company.summaryCount ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Mobile Pagination Controls */}
              {companies.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-center gap-1 px-2 py-4">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {/* Mobile page numbers (simplified) */}
                  {(() => {
                    const pageCount = table.getPageCount();
                    const currentPage = table.getState().pagination.pageIndex;
                    const pages: (number | "ellipsis")[] = [];

                    // Simplified for mobile: show current page and neighbors
                    if (pageCount <= 5) {
                      for (let i = 0; i < pageCount; i++) {
                        pages.push(i);
                      }
                    } else {
                      pages.push(0);
                      if (currentPage > 1) pages.push("ellipsis");
                      if (currentPage > 0 && currentPage < pageCount - 1) {
                        pages.push(currentPage);
                      }
                      if (currentPage < pageCount - 2) pages.push("ellipsis");
                      pages.push(pageCount - 1);
                    }

                    return pages.map((page, idx) =>
                      page === "ellipsis" ? (
                        <span
                          key={`m-ellipsis-${idx}`}
                          className="px-1 text-muted-foreground text-sm"
                        >
                          ...
                        </span>
                      ) : (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "ghost"}
                          size="icon"
                          className={`h-8 w-8 text-sm rounded-full transition-colors ${
                            currentPage === page
                              ? "bg-black text-white hover:bg-black"
                              : "hover:bg-black hover:text-white"
                          }`}
                          onClick={() => table.setPageIndex(page)}
                        >
                          {page + 1}
                        </Button>
                      )
                    );
                  })()}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
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
