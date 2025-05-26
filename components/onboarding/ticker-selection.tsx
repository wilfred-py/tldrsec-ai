"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, AlertCircle } from 'lucide-react';
import { TickerSearch } from './ticker-search';

export interface SelectedTicker {
  id?: string;
  symbol: string;
  companyName: string;
  cik?: string;
  exchangeCodes?: string[];
}

interface TickerSelectionProps {
  selectedTickers: SelectedTicker[];
  onAddTicker: (ticker: SelectedTicker) => void;
  onRemoveTicker: (tickerSymbol: string) => void;
  maxTickers?: number;
}

export function TickerSelection({
  selectedTickers,
  onAddTicker,
  onRemoveTicker,
  maxTickers = 10
}: TickerSelectionProps) {
  const canAddMore = selectedTickers.length < maxTickers;

  return (
    <div className="space-y-6">
      {/* Ticker search */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Search and add companies to track
        </label>
        <TickerSearch 
          onSelect={(ticker) => {
            // Prevent duplicates
            if (!selectedTickers.some(t => t.symbol === ticker.symbol)) {
              onAddTicker(ticker);
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          {canAddMore 
            ? `You can add up to ${maxTickers} companies (${selectedTickers.length}/${maxTickers})`
            : `Maximum number of companies (${maxTickers}) reached`
          }
        </p>
      </div>
      
      {/* Selected tickers list */}
      {selectedTickers.length > 0 ? (
        <div className="border rounded-md p-4">
          <h4 className="font-medium mb-2">Selected Companies</h4>
          <ScrollArea className="h-[200px] pr-4">
            <div className="space-y-2">
              {selectedTickers.map((ticker) => (
                <div 
                  key={ticker.symbol} 
                  className="flex items-center justify-between p-2 bg-muted/40 rounded-md"
                >
                  <div className="flex-grow overflow-hidden">
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">
                        {ticker.symbol}
                      </Badge>
                      <span className="truncate text-sm">{ticker.companyName}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 ml-2 flex-shrink-0"
                    onClick={() => onRemoveTicker(ticker.symbol)}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Remove {ticker.symbol}</span>
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="border border-dashed rounded-md p-6 flex flex-col items-center justify-center text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-3" />
          <h4 className="font-medium">No companies selected</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Search and add companies you want to track SEC filings for
          </p>
        </div>
      )}
    </div>
  );
} 