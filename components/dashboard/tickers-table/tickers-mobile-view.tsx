"use client";

import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2Icon, Search, X } from "lucide-react";
import { Company, FilingPreferences, TickerSearchResult } from "@/lib/api/types";
import { TickerSettingsDropdown } from "@/components/dashboard/ticker-settings-dropdown";
import { DataTablePaginationMobile } from "@/components/ui/data-table";
import { useState } from "react";

interface TickersMobileViewProps {
  table: Table<Company>;
  showInlineAdd: boolean;
  allCompanies: TickerSearchResult[];
  onAddTicker: (symbol: string, name: string) => void;
  onCancelAdd: () => void;
  onPreferenceChange: (
    company: Company,
    key: keyof FilingPreferences,
    value: boolean
  ) => void;
  onDelete: (company: Company) => void;
  formatDate: (date?: string) => string;
  totalCount: number;
  pageSize: number;
}

export function TickersMobileView({
  table,
  showInlineAdd,
  allCompanies,
  onAddTicker,
  onCancelAdd,
  onPreferenceChange,
  onDelete,
  formatDate,
  totalCount: _totalCount,
  pageSize: _pageSize,
}: TickersMobileViewProps) {
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);

  const handleSearchChange = (query: string) => {
    if (query.length >= 1) {
      const filtered = allCompanies
        .filter(
          (c) =>
            c.symbol.toLowerCase().includes(query.toLowerCase()) ||
            c.name.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 8);
      setSearchResults(filtered);
    } else {
      setSearchResults([]);
    }
  };

  // Always apply consistent layout to prevent shifts when paginating
  return (
    <div className="flex flex-col">
      <div className="space-y-3 flex-1">
        {/* Mobile Inline Add Card */}
        {showInlineAdd && (
          <div className="brand-card p-4 bg-muted/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Type to search ticker or company..."
                className="pl-8"
                autoFocus
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onCancelAdd();
                }}
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 bg-background border rounded-md shadow-lg">
                {searchResults.map((result) => (
                  <div
                    key={result.symbol}
                    className="px-3 py-2 cursor-pointer hover:bg-accent/50 flex justify-between items-center"
                    onClick={() => onAddTicker(result.symbol, result.name)}
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
              onClick={onCancelAdd}
              className="mt-2 w-full"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
        )}

        {/* Company Cards */}
        {table.getRowModel().rows.map((row) => {
          const company = row.original;
          return (
            <div key={company.id} className="brand-card p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold">{company.symbol}</h3>
                  <p className="text-sm text-muted-foreground">{company.name}</p>
                </div>
                <div className="flex items-center gap-1">
                  <TickerSettingsDropdown
                    tickerSymbol={company.symbol}
                    preferences={company.preferences}
                    onPreferenceChange={(key, value) =>
                      onPreferenceChange(
                        company,
                        key as keyof FilingPreferences,
                        value
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(company)}
                    className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Filing info */}
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
                  <span className="text-xs text-muted-foreground">Summaries</span>
                  <span className="text-sm">{company.summaryCount ?? 0}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Pagination - always rendered, component returns null when single page */}
      <div className="mt-auto pt-3">
        <DataTablePaginationMobile table={table} />
      </div>
    </div>
  );
}
