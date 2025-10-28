"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardHeader } from "@/components/dashboard";
import { CompanySearch } from "@/components/dashboard/company-search";
import { SettingsIcon, Trash2Icon, ArrowUpDown, Loader2 } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
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
import { SystemHealthBanner } from "@/components/dashboard/system-health-banner";
import { ProcessingStatus } from "@/components/dashboard/processing-status";

// Column helper for the table
const columnHelper = createColumnHelper<Company>();

export function DashboardClient() {
  // State for tracked companies
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialProgress, setTutorialProgress] = useState(0);
  
  
  // Async hooks for API calls
  const { execute: executeGetCompanies, isLoading: isLoadingCompanies, error: companiesError } = useAsync([]);
  const { execute: executeAddTicker } = useAsync();
  const { execute: executeDeleteTicker, isLoading: isDeletingTicker } = useAsync();
  const { execute: executeUpdatePreferences, isLoading: isUpdatingPreferences } = useAsync();
  
  

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD/CTRL + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }

      // ESC to clear search
      if (e.key === 'Escape') {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput && document.activeElement === searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));
          searchInput.blur();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  



  
  // Handle adding a ticker - Enhanced with optimistic update only
  const handleAddTicker = async (symbol: string, name: string) => {
    // Check if ticker already exists
    const exists = companies.some(company => company.symbol.toUpperCase() === symbol.toUpperCase());
    if (exists) {
      toast.error(`${symbol} is already tracked`);
      // Highlight existing row briefly (handled by CSS animation)
      const existingRow = document.querySelector(`[data-ticker="${symbol}"]`);
      if (existingRow) {
        existingRow.classList.add('highlight-pulse');
        setTimeout(() => existingRow.classList.remove('highlight-pulse'), 1000);
      }
      return;
    }

    // Create a new company object for optimistic update with loading state
    const tempId = `temp-${Date.now()}`;
    const newCompany: Company = {
      id: tempId,
      symbol,
      name,
      lastFiling: "—",
      lastFilingDate: undefined,
      preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
    };

    // Optimistically add the company to the list - immediate UI update
    setCompanies(prevCompanies => [...prevCompanies, newCompany]);

    try {
      // Add the ticker to the database
      const result = await executeAddTicker(() => addTrackedCompany(symbol, name));

      if (result && result.success && result.data) {
        // Update the optimistic entry with real data from API (no full reload needed)
        setCompanies(prevCompanies =>
          prevCompanies.map(c =>
            c.id === tempId ? { ...result.data } : c
          )
        );

        toast.success(`Added ${symbol} to your tracked companies`);

        // Show next step in tutorial if active
        if (showTutorial && tutorialProgress === 0) {
          setTutorialProgress(1);
        }
      } else {
        // Handle API error response - remove the optimistic update (rollback)
        setCompanies(prevCompanies => prevCompanies.filter(company => company.id !== tempId));

        // Get error message from result if available
        let errorMessage = `Failed to add ${symbol}`;
        if (!result.success && result.data === null) {
          errorMessage = `${symbol} may already be tracked or does not exist`;
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      // Remove the optimistic update on error (rollback)
      setCompanies(prevCompanies => prevCompanies.filter(company => company.id !== tempId));

      console.error("Error adding ticker:", error);
      toast.error(`Failed to add ${symbol}`);
    }
  };
  
  // Handle deleting a ticker - Enhanced with optimistic removal and rollback
  const handleDeleteTicker = async () => {
    if (!currentCompany) return;

    const companyToDelete = currentCompany;
    setDeletingCompanyId(companyToDelete.id); // Set deleting state for fade-out animation

    // Close dialog immediately for better UX
    setIsDeleteDialogOpen(false);

    // Wait for fade-out animation to complete (150ms)
    await new Promise(resolve => setTimeout(resolve, 150));

    // Optimistically remove from local state
    setCompanies(prev => prev.filter(c => c.id !== companyToDelete.id));

    try {
      await executeDeleteTicker(() => deleteTrackedCompany(companyToDelete.id));
      toast.success(`Removed ${companyToDelete.symbol} from tracked companies`);
      setCurrentCompany(null);
      setDeletingCompanyId(null);
    } catch (error) {
      // Rollback: Re-add the company on error
      setCompanies(prev => {
        // Find insertion position to maintain sort order
        const sortedCompanies = [...prev, companyToDelete].sort((a, b) =>
          a.symbol.localeCompare(b.symbol)
        );
        return sortedCompanies;
      });

      console.error("Error deleting ticker:", error);
      toast.error(`Failed to remove ${companyToDelete.symbol}. Please try again.`);
      setDeletingCompanyId(null);
    }
  };
  
  // Handle updating company preferences
  const handleUpdatePreferences = async () => {
    if (!currentCompany) return;
    
    try {
      await executeUpdatePreferences(() => updateCompanyPreferences(currentCompany.symbol, currentCompany.preferences));
      toast.success(`Updated preferences for ${currentCompany.symbol}`);
      
      // Update in local state
      setCompanies(prev => prev.map(c => 
        c.symbol === currentCompany.symbol ? currentCompany : c
      ));
      
      setIsPreferencesOpen(false);
    } catch (error) {
      console.error("Error updating preferences:", error);
      toast.error(`Failed to update preferences for ${currentCompany.symbol}`);
    }
  };
  
  // Handle preference toggle changes
  const handlePreferenceChange = (key: keyof Company['preferences'], value: boolean) => {
    if (!currentCompany) return;
    
    setCurrentCompany({
      ...currentCompany,
      preferences: {
        ...currentCompany.preferences,
        [key]: value
      }
    });
  };
  
  
  // Table columns definition
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
      cell: info => <div className="font-medium">{info.getValue()}</div>,
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
      cell: info => <div>{info.getValue()}</div>,
    }),
    columnHelper.accessor(row => row, {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: info => {
        const company = info.getValue();
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setCurrentCompany(company);
                setIsPreferencesOpen(true);
              }}
              className="h-8 w-8"
              data-tutorial="preferences"
            >
              <SettingsIcon className="h-4 w-4" />
              <span className="sr-only">Preferences</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setCurrentCompany(company);
                setIsDeleteDialogOpen(true);
              }}
              className="h-8 w-8"
            >
              <Trash2Icon className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        );
      },
    }),
  ], []);
  
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
      
      {/* System Health & Status */}
      <SystemHealthBanner />
      <ProcessingStatus />
      
      {/* Tracked Tickers - Removed border */}
      <Card className="p-6">
        <div className="mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Tracked Tickers</h2>
                <p className="text-sm text-muted-foreground">Manage your tracked companies.</p>
              </div>
            </div>

            {/* Inline Search Bar - No Modal */}
            <div className="w-full" data-tutorial="add-ticker">
              <CompanySearch
                onSelect={handleAddTicker}
                onCancel={() => {}}
              />
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
              Use the search bar above to add your first company and start tracking SEC filings.
            </p>
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
                    table.getRowModel().rows.map(row => {
                      const company = row.original;
                      const isDeleting = deletingCompanyId === company.id;
                      return (
                        <TableRow
                          key={row.id}
                          data-state={row.getIsSelected() && "selected"}
                          data-ticker={company.symbol}
                          className={isDeleting ? "fade-out-row" : "fade-in-row"}
                        >
                          {row.getVisibleCells().map(cell => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        No companies found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            
            {/* Mobile Card View */}
            <div className="sm:hidden space-y-4">
              {companies.map(company => {
                const isDeleting = deletingCompanyId === company.id;
                return (
                  <div
                    key={company.symbol}
                    data-ticker={company.symbol}
                    className={`border rounded-md p-4 ${isDeleting ? "fade-out-row" : "fade-in-row"}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-medium">{company.symbol}</h3>
                        <p className="text-sm text-muted-foreground">{company.name}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCurrentCompany(company);
                            setIsPreferencesOpen(true);
                          }}
                          className="h-8 w-8"
                        >
                          <SettingsIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCurrentCompany(company);
                            setIsDeleteDialogOpen(true);
                          }}
                          className="h-8 w-8"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
      
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
      
      {/* Preferences Dialog */}
      <Dialog open={isPreferencesOpen} onOpenChange={setIsPreferencesOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Company Preferences</DialogTitle>
            <DialogDescription>
              Customize your preferences for {currentCompany?.symbol}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="tenK">10-K Filings</Label>
                <p className="text-sm text-muted-foreground">
                  Annual reports
                </p>
              </div>
              <Switch
                id="tenK"
                checked={currentCompany?.preferences?.tenK}
                onCheckedChange={(checked) => handlePreferenceChange('tenK', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="tenQ">10-Q Filings</Label>
                <p className="text-sm text-muted-foreground">
                  Quarterly reports
                </p>
              </div>
              <Switch
                id="tenQ"
                checked={currentCompany?.preferences?.tenQ}
                onCheckedChange={(checked) => handlePreferenceChange('tenQ', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="eightK">8-K Filings</Label>
                <p className="text-sm text-muted-foreground">
                  Current reports
                </p>
              </div>
              <Switch
                id="eightK"
                checked={currentCompany?.preferences?.eightK}
                onCheckedChange={(checked) => handlePreferenceChange('eightK', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="form4">Form 4 Filings</Label>
                <p className="text-sm text-muted-foreground">
                  Insider trading reports
                </p>
              </div>
              <Switch
                id="form4"
                checked={currentCompany?.preferences?.form4}
                onCheckedChange={(checked) => handlePreferenceChange('form4', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="other">Other Filings</Label>
                <p className="text-sm text-muted-foreground">
                  All other SEC filings
                </p>
              </div>
              <Switch
                id="other"
                checked={currentCompany?.preferences?.other}
                onCheckedChange={(checked) => handlePreferenceChange('other', checked)}
              />
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsPreferencesOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePreferences} disabled={isUpdatingPreferences}>
              {isUpdatingPreferences ? "Saving..." : "Save Changes"}
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
