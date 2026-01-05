"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard";
import { InlineAddRow } from "@/components/dashboard/inline-add-row";
import { Trash2Icon, PlusIcon, ArrowUpDown, Loader2, Search, X } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TickerSearchResult } from "@/lib/api/types";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Company } from "@/lib/api/types";
import { getTrackedCompanies, addTrackedCompany, deleteTrackedCompany, updateCompanyPreferences } from "@/lib/api/ticker-service";
import { useAsync } from "@/lib/hooks/use-async";
import { TutorialGuide } from "@/components/onboarding/tutorial-guide";

// Column helper for the table
const columnHelper = createColumnHelper<Company>();

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
  const [emptyStateResults, setEmptyStateResults] = useState<TickerSearchResult[]>([]);

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialProgress, setTutorialProgress] = useState(0);
  
  
  // Async hooks for API calls
  const { execute: executeGetCompanies, isLoading: isLoadingCompanies, error: companiesError } = useAsync([]);
  const { execute: executeAddTicker } = useAsync();
  const { execute: executeDeleteTicker, isLoading: isDeletingTicker } = useAsync();
  const { execute: executeUpdatePreferences } = useAsync();
  
  

  // Load tracked companies
  const loadCompanies = useCallback(async () => {
    try {
      const response = await executeGetCompanies(() => getTrackedCompanies());
      if (response && 'data' in response && Array.isArray(response.data)) {
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
    const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
      localStorage.setItem('hasSeenTutorial', 'true');
    }
    
    // Load tutorial progress if available
    const savedProgress = localStorage.getItem('tutorialProgress');
    if (savedProgress) {
      setTutorialProgress(parseInt(savedProgress, 10));
    }
  }, [loadCompanies]);

  // Prefetch all companies for search
  useEffect(() => {
    const prefetchCompanies = async () => {
      try {
        const response = await fetch('/api/companies/list');
        if (response.ok) {
          const data = await response.json();
          if (data.companies && Array.isArray(data.companies)) {
            setAllCompanies(data.companies);
            setCompaniesLoaded(true);
          }
        }
      } catch (error) {
        console.error('Error prefetching companies:', error);
      }
    };
    prefetchCompanies();
  }, []);

  // Handle adding a ticker
  const handleAddTicker = async (symbol: string, name: string) => {
    setShowInlineAdd(false); // Close inline row
    
    // Create a new company object for optimistic update
    const newCompany: Company = {
      id: `temp-${Date.now()}`, // Temporary ID that will be replaced after API refresh
      symbol,
      name, // name property is the company name in the Company interface
      lastFiling: "—",
      lastFilingDate: undefined, // Using undefined instead of null to match Company type
      preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
    };
    
    // Optimistically add the company to the list to reduce perceived latency
    setCompanies(prevCompanies => {
      // Check if this ticker already exists to prevent duplicates
      const exists = prevCompanies.some(company => company.symbol === symbol);
      if (exists) {
        // If it exists, don't add it again
        return prevCompanies;
      }
      // Add the new company to the list
      return [...prevCompanies, newCompany];
    });
    
    try {
      // Add the ticker to the database
      const result = await executeAddTicker(() => addTrackedCompany(symbol, name));
      
      if (result && result.success && result.data) {
        toast.success(`Added ${symbol} to your tracked companies`);
        
        // Explicitly reload the companies list from the API to ensure we have the latest data
        // This will replace our optimistic update with the real data
        try {
          // Call executeGetCompanies with a function that calls getTrackedCompanies
          const response = await executeGetCompanies(() => getTrackedCompanies());
          if (response && 'data' in response && Array.isArray(response.data)) {
            setCompanies(response.data);
          }
        } catch (refreshError) {
          console.error("Error refreshing companies list:", refreshError);
          // Even if refresh fails, we still added the ticker successfully
          // and our optimistic update remains in place
        }
        
        // Show next step in tutorial if active
        if (showTutorial && tutorialProgress === 0) {
          setTutorialProgress(1);
        }
      } else {
        // Handle API error response - remove the optimistic update
        setCompanies(prevCompanies => prevCompanies.filter(company => company.id !== newCompany.id));
        
        // Get error message from result if available
        let errorMessage = `Failed to add ${symbol}`;
        if (!result.success && result.data === null) {
          errorMessage = `Failed to add ${symbol}: The ticker may already be tracked or not exist`;
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      // Remove the optimistic update on error
      setCompanies(prevCompanies => prevCompanies.filter(company => company.id !== newCompany.id));
      
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
      setCompanies(prev => prev.filter(c => c.id !== currentCompany.id));
      setIsDeleteDialogOpen(false);
      setCurrentCompany(null);
    } catch (error) {
      console.error("Error deleting ticker:", error);
      toast.error(`Failed to remove ${currentCompany.symbol}`);
    }
  };
  
  // Handle inline preference toggle changes with optimistic update
  const handleInlinePreferenceChange = useCallback(async (
    company: Company,
    preferenceKey: keyof Company['preferences'],
    value: boolean
  ) => {
    // Optimistic update
    setCompanies(prev => prev.map(c =>
      c.id === company.id
        ? { ...c, preferences: { ...c.preferences, [preferenceKey]: value } }
        : c
    ));

    try {
      const updatedPreferences = {
        ...company.preferences,
        [preferenceKey]: value
      };

      await executeUpdatePreferences(() =>
        updateCompanyPreferences(company.symbol, updatedPreferences)
      );
      // Subtle success - no toast for inline toggles to reduce noise
    } catch (error) {
      // Revert on error
      setCompanies(prev => prev.map(c =>
        c.id === company.id
          ? { ...c, preferences: { ...c.preferences, [preferenceKey]: !value } }
          : c
      ));
      console.error("Error updating preferences:", error);
      toast.error(`Failed to update preference`);
    }
  }, [executeUpdatePreferences]);
  
  
  // Table columns definition with inline filing toggles
  const columns = useMemo(() => [
    columnHelper.accessor('symbol', {
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
      cell: info => <div className="font-semibold">{info.getValue()}</div>,
      size: 80,
    }),
    columnHelper.accessor('name', {
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
      cell: info => (
        <div className="text-sm text-muted-foreground truncate max-w-[200px]">
          {info.getValue()}
        </div>
      ),
    }),
    // Filing type toggle columns
    columnHelper.accessor(row => row.preferences?.tenK, {
      id: 'tenK',
      header: () => <span className="text-xs font-medium text-center block">10-K</span>,
      cell: info => (
        <div className="flex justify-center">
          <Switch
            checked={info.getValue() ?? true}
            onCheckedChange={(checked) => handleInlinePreferenceChange(info.row.original, 'tenK', checked)}
            aria-label={`Toggle 10-K for ${info.row.original.symbol}`}
          />
        </div>
      ),
      size: 60,
    }),
    columnHelper.accessor(row => row.preferences?.tenQ, {
      id: 'tenQ',
      header: () => <span className="text-xs font-medium text-center block">10-Q</span>,
      cell: info => (
        <div className="flex justify-center">
          <Switch
            checked={info.getValue() ?? true}
            onCheckedChange={(checked) => handleInlinePreferenceChange(info.row.original, 'tenQ', checked)}
            aria-label={`Toggle 10-Q for ${info.row.original.symbol}`}
          />
        </div>
      ),
      size: 60,
    }),
    columnHelper.accessor(row => row.preferences?.eightK, {
      id: 'eightK',
      header: () => <span className="text-xs font-medium text-center block">8-K</span>,
      cell: info => (
        <div className="flex justify-center">
          <Switch
            checked={info.getValue() ?? true}
            onCheckedChange={(checked) => handleInlinePreferenceChange(info.row.original, 'eightK', checked)}
            aria-label={`Toggle 8-K for ${info.row.original.symbol}`}
          />
        </div>
      ),
      size: 60,
    }),
    columnHelper.accessor(row => row.preferences?.form4, {
      id: 'form4',
      header: () => <span className="text-xs font-medium text-center block">Form 4</span>,
      cell: info => (
        <div className="flex justify-center">
          <Switch
            checked={info.getValue() ?? false}
            onCheckedChange={(checked) => handleInlinePreferenceChange(info.row.original, 'form4', checked)}
            aria-label={`Toggle Form 4 for ${info.row.original.symbol}`}
          />
        </div>
      ),
      size: 70,
    }),
    // Delete action column
    columnHelper.accessor(row => row, {
      id: 'actions',
      header: () => null,
      cell: info => {
        const company = info.getValue();
        return (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setCurrentCompany(company);
              setIsDeleteDialogOpen(true);
            }}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${company.symbol}`}
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        );
      },
      size: 40,
    }),
  ], [handleInlinePreferenceChange]);
  
  // Initialize table
  const table = useReactTable({
    data: companies || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });
  
  const showEmptyState = (companies?.length === 0 && !isLoadingCompanies) || companiesError;

  return (
    <div className="space-y-6">
      <DashboardHeader
        heading="Dashboard"
        description="Welcome to tldrSEC."
      />
      
      
      {/* Tracked Tickers - Removed border */}
      <div className="landing-card">
        <div className="mb-6 text-center">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="mx-auto sm:mx-0">
              <h2 className="text-lg font-semibold">Tracked Tickers</h2>
              <p className="text-sm text-muted-foreground">Manage your tracked companies.</p>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={() => setShowInlineAdd(true)}
                className="gap-1"
                data-tutorial="add-ticker"
                disabled={showInlineAdd || !companiesLoaded}
              >
                {!companiesLoaded ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlusIcon className="h-4 w-4 mr-2" />
                )}
                <span className="hidden sm:inline">Add Ticker</span>
                <span className="inline sm:hidden">Add</span>
              </Button>
            </div>
          </div>
        </div>
        
        {isLoadingCompanies ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-4 sm:p-8 text-center space-y-3">
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Loading tracked companies...</p>
          </div>
        ) : showEmptyState ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-4 sm:p-8 text-center space-y-4">
            <h3 className="text-base font-medium">No companies tracked yet</h3>
            <p className="text-sm text-muted-foreground">
              Start tracking companies to receive SEC filing summaries.
            </p>
            <Button
              className="mt-2"
              onClick={() => setShowInlineAdd(true)}
              disabled={!companiesLoaded}
            >
              {!companiesLoaded ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Your First Company
                </>
              )}
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
                          .filter(c =>
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
                      if (e.key === 'Escape') setShowInlineAdd(false);
                    }}
                  />
                </div>
                {emptyStateResults.length > 0 && (
                  <div className="mt-2 bg-background border rounded-md shadow-lg">
                    {emptyStateResults.map(result => (
                      <div
                        key={result.symbol}
                        className="px-3 py-2 cursor-pointer hover:bg-accent/50 flex justify-between items-center"
                        onClick={() => handleAddTicker(result.symbol, result.name)}
                      >
                        <span className="font-semibold">{result.symbol}</span>
                        <span className="text-muted-foreground text-sm">{result.name}</span>
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
                      {headerGroup.headers.map(header => (
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
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map(row => (
                      <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                        {row.getVisibleCells().map(cell => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        No companies found.
                      </TableCell>
                    </TableRow>
                  )}
                  {showInlineAdd && (
                    <InlineAddRow
                      companies={allCompanies}
                      onSelect={handleAddTicker}
                      onCancel={() => setShowInlineAdd(false)}
                      columnCount={columns.length}
                    />
                  )}
                </TableBody>
              </Table>
            </div>
            
            {/* Mobile Card View */}
            <div className="sm:hidden space-y-3">
              {companies.map(company => (
                <div key={company.symbol} className="landing-card p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold">{company.symbol}</h3>
                      <p className="text-sm text-muted-foreground">{company.name}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCurrentCompany(company);
                        setIsDeleteDialogOpen(true);
                      }}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Inline filing toggles for mobile */}
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t">
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-muted-foreground mb-1">10-K</span>
                      <Switch
                        checked={company.preferences?.tenK ?? true}
                        onCheckedChange={(checked) => handleInlinePreferenceChange(company, 'tenK', checked)}
                        aria-label={`Toggle 10-K for ${company.symbol}`}
                      />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-muted-foreground mb-1">10-Q</span>
                      <Switch
                        checked={company.preferences?.tenQ ?? true}
                        onCheckedChange={(checked) => handleInlinePreferenceChange(company, 'tenQ', checked)}
                        aria-label={`Toggle 10-Q for ${company.symbol}`}
                      />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-muted-foreground mb-1">8-K</span>
                      <Switch
                        checked={company.preferences?.eightK ?? true}
                        onCheckedChange={(checked) => handleInlinePreferenceChange(company, 'eightK', checked)}
                        aria-label={`Toggle 8-K for ${company.symbol}`}
                      />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-muted-foreground mb-1">Form 4</span>
                      <Switch
                        checked={company.preferences?.form4 ?? false}
                        onCheckedChange={(checked) => handleInlinePreferenceChange(company, 'form4', checked)}
                        aria-label={`Toggle Form 4 for ${company.symbol}`}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Mobile Inline Add Card */}
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
                            .filter(c =>
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
                        if (e.key === 'Escape') setShowInlineAdd(false);
                      }}
                    />
                  </div>
                  {emptyStateResults.length > 0 && (
                    <div className="mt-2 bg-background border rounded-md shadow-lg">
                      {emptyStateResults.map(result => (
                        <div
                          key={result.symbol}
                          className="px-3 py-2 cursor-pointer hover:bg-accent/50 flex justify-between items-center"
                          onClick={() => handleAddTicker(result.symbol, result.name)}
                        >
                          <span className="font-semibold">{result.symbol}</span>
                          <span className="text-muted-foreground text-sm truncate ml-2">{result.name}</span>
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
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {currentCompany?.symbol} from your tracked companies?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTicker} disabled={isDeletingTicker}>
              {isDeletingTicker ? "Removing..." : "Remove"}
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
