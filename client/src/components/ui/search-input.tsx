import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface SearchInputProps {
  placeholder?: string;
  onSearch: (query: string) => Promise<void>;
  className?: string;
  debounceMs?: number;
}

export function SearchInput({ 
  placeholder = "Search...", 
  onSearch, 
  className,
  debounceMs = 300
}: SearchInputProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Handle search with debounce
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (query.trim() === "") {
      return;
    }

    debounceTimeout.current = setTimeout(async () => {
      try {
        await onSearch(query);
      } finally {
        // Reset selected index when new results come in
        setSelectedIndex(-1);
      }
    }, debounceMs);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [query, onSearch, debounceMs]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const resultsList = document.getElementById('search-results-list');
    
    if (!resultsList) return;
    
    const results = resultsList.querySelectorAll('li');
    const maxIndex = results.length - 1;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => {
          const newIndex = prev < maxIndex ? prev + 1 : 0;
          results[newIndex]?.scrollIntoView({ block: 'nearest' });
          return newIndex;
        });
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => {
          const newIndex = prev > 0 ? prev - 1 : maxIndex;
          results[newIndex]?.scrollIntoView({ block: 'nearest' });
          return newIndex;
        });
        break;
        
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex <= maxIndex) {
          const addButton = results[selectedIndex].querySelector('button');
          if (addButton) {
            addButton.click();
          }
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        setQuery('');
        onSearch(''); // Clear search results
        inputRef.current?.blur();
        break;
    }
  };

  // Update highlight styling
  useEffect(() => {
    const resultsList = document.getElementById('search-results-list');
    if (!resultsList) return;
    
    const items = resultsList.querySelectorAll('li');
    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.classList.add('bg-muted');
      } else {
        item.classList.remove('bg-muted');
      }
    });
  }, [selectedIndex]);

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="pl-10"
      />
    </div>
  );
}
