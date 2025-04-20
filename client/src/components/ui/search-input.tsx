import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Handle search with debounce
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (query.trim() === "") {
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimeout.current = setTimeout(async () => {
      try {
        await onSearch(query);
      } finally {
        setIsSearching(false);
      }
    }, debounceMs);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [query, onSearch, debounceMs]);

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="pl-10 pr-10"
      />
      
      {isSearching && (
        <div className="absolute inset-y-0 right-3 flex items-center">
          <LoadingSpinner size="sm" />
        </div>
      )}
    </div>
  );
}
