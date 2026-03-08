"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Trash2Icon } from "lucide-react";
import { Company, FilingPreferences } from "@/lib/api/types";
import { TickerSettingsDropdown } from "@/components/dashboard/ticker-settings-dropdown";

interface ColumnOptions {
  onPreferenceChange: (
    company: Company,
    key: keyof FilingPreferences,
    value: boolean
  ) => void;
  onDelete: (company: Company) => void;
  formatDate: (date?: string) => string;
}

export function getTickersColumns(
  options: ColumnOptions
): ColumnDef<Company>[] {
  const { onPreferenceChange, onDelete, formatDate } = options;

  return [
    {
      accessorKey: "symbol",
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
      cell: ({ row }) => (
        <div className="font-semibold">{row.getValue("symbol")}</div>
      ),
      size: 80,
    },
    {
      accessorKey: "name",
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
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground truncate max-w-[200px]">
          {row.getValue("name")}
        </div>
      ),
    },
    {
      accessorKey: "lastFilingDate",
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
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {formatDate(row.getValue("lastFilingDate"))}
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: "summaryCount",
      id: "summaryCount",
      header: () => (
        <span className="text-xs font-medium text-center block">Summaries</span>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          <span className="text-sm font-medium text-muted-foreground">
            {row.getValue("summaryCount") ?? 0}
          </span>
        </div>
      ),
      size: 80,
    },
    {
      id: "settings",
      header: () => null,
      cell: ({ row }) => {
        const company = row.original;
        return (
          <div className="inline-flex" data-tutorial={row.index === 0 ? "ticker-preferences" : undefined}>
            <TickerSettingsDropdown
              tickerSymbol={company.symbol}
              preferences={company.preferences}
              onPreferenceChange={(key, value) =>
                onPreferenceChange(company, key as keyof FilingPreferences, value)
              }
            />
          </div>
        );
      },
      size: 40,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        const company = row.original;
        return (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(company)}
            className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            aria-label={`Delete ${company.symbol}`}
            data-tutorial={row.index === 0 ? "delete-ticker" : undefined}
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        );
      },
      size: 40,
    },
  ];
}
