"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, X } from 'lucide-react';
import { debounce } from 'lodash';
import { toast } from 'sonner';

interface TickerResult {
  id?: string;
  symbol: string;
  companyName: string;
  cik?: string;
  exchangeCodes?: string[];
  isResolved?: boolean;
}

interface TickerSearchProps {
  onSelect: (ticker: TickerResult) => void;
}

export function TickerSearch({ onSelect }: TickerSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TickerResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const searchTickers = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery || searchQuery.length < 2) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`/api/tickers/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();

        if (data.success) {
          setResults(data.results || []);
        } else {
          toast.error(data.message || 'Error searching tickers');
          setResults([]);
        }
      } catch (error) {
        console.error('Error searching tickers:', error);
        toast.error('Failed to search tickers');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    []
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    if (value.length >= 2) {
      searchTickers(value);
      setIsOpen(true);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  };

  const handleSelectTicker = (ticker: TickerResult) => {
    onSelect(ticker);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleClearInput = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        inputRef.current &&
        resultsRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        !resultsRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search for company or ticker symbol (e.g., AAPL, Microsoft)"
          value={query}
          onChange={handleInputChange}
          className="pl-10 pr-10"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3"
            onClick={handleClearInput}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear search</span>
          </Button>
        )}
      </div>
      
      {isOpen && (
        <div
          ref={resultsRef}
          className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-md max-h-60 overflow-auto"
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span>Searching...</span>
            </div>
          ) : results.length > 0 ? (
            <ul>
              {results.map((ticker) => (
                <li 
                  key={ticker.id || ticker.symbol}
                  className="p-2 hover:bg-accent cursor-pointer border-b last:border-0"
                  onClick={() => handleSelectTicker(ticker)}
                >
                  <div className="flex justify-between">
                    <span className="font-medium">{ticker.symbol}</span>
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">
                      {(ticker.exchangeCodes && ticker.exchangeCodes.length > 0) 
                        ? ticker.exchangeCodes[0]
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {ticker.companyName}
                  </div>
                </li>
              ))}
            </ul>
          ) : query.length >= 2 ? (
            <div className="p-4 text-center text-muted-foreground">
              No results found. Try a different search.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
} 