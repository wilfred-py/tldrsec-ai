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
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Load all companies on component mount
  useEffect(() => {
    const loadCompanies = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/companies?list=true');
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
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
        fetch(`/api/companies?q=${encodeURIComponent(value)}`)
          .then(response => response.json())
          .then(data => {
            if (data.companies) {
              setResults(data.companies);
            }
          })
          .catch(error => {
            console.error("Error searching companies:", error);
            setResults([]);
          });
      }
    }, 300); // 300ms debounce delay
  };

  return (
    <div className="my-4">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by ticker or company name..."
          className="pl-8 w-full"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
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
          {results.map((result) => (
            <div 
              key={result.symbol}
              className="p-3 hover:bg-accent flex justify-between items-center cursor-pointer"
              onClick={() => onSelect(result.symbol, result.name)}
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
