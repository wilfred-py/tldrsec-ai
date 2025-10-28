"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchIcon, PlusIcon } from "lucide-react";
import { TickerSearchResult } from "@/lib/api/types";

interface CompanySearchProps {
  onSelect: (symbol: string, name: string) => void;
  onCancel: () => void;
}

export function CompanySearch({ onSelect }: CompanySearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [allCompanies, setAllCompanies] = useState<TickerSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all companies on component mount
  useEffect(() => {
    const loadCompanies = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/companies/list');
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json() as { companies?: TickerSearchResult[] };
        if (data.companies && Array.isArray(data.companies)) {
          setAllCompanies(data.companies);
        }
      } catch (error) {
        console.error("Error loading companies:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadCompanies();
  }, []);

  // Handle search input changes with debouncing
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSelectedIndex(-1); // Reset selection on new search

    // Clear previous timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (value.length < 2) {
      setResults([]);
      return;
    }

    // Set new timeout for debouncing
    debounceTimeout.current = setTimeout(() => {
      if (allCompanies.length > 0) {
        const filteredResults = allCompanies
          .filter(company =>
            company.symbol.toLowerCase().includes(value.toLowerCase()) ||
            company.name.toLowerCase().includes(value.toLowerCase())
          )
          .slice(0, 50); // Limit to 50 results for performance

        setResults(filteredResults);
      } else {
        // Fallback to API search if companies aren't loaded
        fetch(`/api/companies/search?q=${encodeURIComponent(value)}`)
          .then(response => response.json())
          .then((data: unknown) => {
            const typedData = data as { companies?: TickerSearchResult[] };
            if (typedData.companies) {
              setResults(typedData.companies);
            }
          })
          .catch(error => {
            console.error("Error searching companies:", error);
            setResults([]);
          });
      }
    }, 300); // 300ms debounce delay
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          const selected = results[selectedIndex];
          onSelect(selected.symbol, selected.name);
          setSearchQuery("");
          setResults([]);
          setSelectedIndex(-1);
        }
        break;
      case 'Escape':
        setSearchQuery("");
        setResults([]);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  return (
    <div className="my-4">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder="Search by ticker or company name..."
          className="pl-8 w-full"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
      
      {isLoading && searchQuery.length > 1 && results.length === 0 && (
        <div className="mt-2 text-sm text-center text-muted-foreground">
          Loading companies...
        </div>
      )}
      
      {results.length > 0 && (
        <div className="mt-4 border rounded-md divide-y max-h-64 overflow-auto">
          {results.map((result, index) => (
            <div
              key={result.symbol}
              className={`p-3 flex justify-between items-center cursor-pointer transition-colors ${
                index === selectedIndex ? 'bg-accent' : 'hover:bg-accent'
              }`}
              onClick={() => {
                onSelect(result.symbol, result.name);
                // Clear search after selection
                setSearchQuery("");
                setResults([]);
                setSelectedIndex(-1);
              }}
            >
              <div>
                <p className="font-medium">{result.symbol}</p>
                <p className="text-sm text-muted-foreground">{result.name}</p>
              </div>
              <Button size="sm" variant="ghost">
                <PlusIcon className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      
      {searchQuery.length > 1 && results.length === 0 && !isLoading && (
        <div className="mt-4 text-center py-8 border rounded-md">
          <p className="text-muted-foreground">No results found</p>
        </div>
      )}
    </div>
  );
}
