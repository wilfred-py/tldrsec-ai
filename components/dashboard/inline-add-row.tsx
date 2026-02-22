"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { Search, X, Loader2 } from "lucide-react";
import { TickerSearchResult } from "@/lib/api/types";

interface InlineAddRowProps {
  companies: TickerSearchResult[];
  onSelect: (symbol: string, name: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  columnCount: number;
}

export function InlineAddRow({
  companies,
  onSelect,
  onCancel,
  isLoading = false,
  columnCount
}: InlineAddRowProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle escape key and arrow navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
      if (e.key === 'ArrowDown' && results.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      }
      if (e.key === 'ArrowUp' && results.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      }
      if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
        e.preventDefault();
        const result = results[selectedIndex];
        onSelect(result.symbol, result.name);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onSelect, results, selectedIndex]);

  // Filter companies with 100ms debounce, starting at 1 character
  const filterCompanies = useCallback((query: string) => {
    if (query.length < 1) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = companies
      .filter(company =>
        company.symbol.toLowerCase().includes(lowerQuery) ||
        company.name.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 8); // Limit to 8 results for inline display

    setResults(filtered);
    setShowResults(true);
    setSelectedIndex(-1);
  }, [companies]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      filterCompanies(value);
    }, 100); // Fast 100ms debounce
  };

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={columnCount} className="py-2">
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="search"
              placeholder="Type to search ticker or company..."
              className="pl-8 h-9 bg-background border-gray-200 dark:border-zinc-700"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              disabled={isLoading}
            />

            {/* Dropdown results */}
            {showResults && results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 border rounded-md shadow-lg z-50 max-h-64 overflow-auto bg-white dark:bg-zinc-950">
                {results.map((result, index) => (
                  <div
                    key={result.symbol}
                    role="option"
                    aria-selected={index === selectedIndex}
                    className={`px-3 py-2 cursor-pointer flex justify-between items-center ${
                      index === selectedIndex
                        ? 'bg-accent'
                        : 'hover:bg-accent/50'
                    }`}
                    onClick={() => onSelect(result.symbol, result.name)}
                  >
                    <div>
                      <span className="font-semibold">{result.symbol}</span>
                      <span className="text-muted-foreground ml-2 text-sm">{result.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showResults && searchQuery.length >= 1 && results.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 border rounded-md shadow-lg z-50 p-3 text-center text-muted-foreground text-sm bg-white dark:bg-zinc-950">
                No results found
              </div>
            )}
          </div>

          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
