import * as React from "react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { LocationRef } from "@/lib/types/weather.types";
import { useSearchLocationQuery } from "@/lib/queries/weather.queries";
import { cn } from "@/lib/utils";

export interface LocationSearchProps {
  readonly onSelectLocation: (location: LocationRef) => void;
  readonly placeholder?: string;
  readonly className?: string;
}

export function LocationSearch({
  onSelectLocation,
  placeholder = "Search city, state or coordinates...",
  className,
}: LocationSearchProps) {
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [debouncedTerm, setDebouncedTerm] = React.useState<string>("");
  const [isOpen, setIsOpen] = React.useState<boolean>(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: searchResults, isLoading } = useSearchLocationQuery(
    debouncedTerm,
    isOpen && debouncedTerm.trim().length >= 2
  );

  // Close on click outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(loc: LocationRef) {
    onSelectLocation(loc);
    setSearchTerm(loc.region ? `${loc.name}, ${loc.region}` : loc.name);
    setIsOpen(false);
  }

  function handleClear() {
    setSearchTerm("");
    setDebouncedTerm("");
    setIsOpen(false);
  }

  const locations = searchResults?.locations || [];

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-lg", className)}>
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="h-10 w-full rounded-xl border border-input bg-background/90 pl-10 pr-9 text-sm shadow-sm backdrop-blur-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {searchTerm ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            aria-label="Clear location search"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {isOpen && debouncedTerm.trim().length >= 2 && (
        <div className="absolute top-full z-50 mt-1.5 w-full rounded-xl border bg-popover text-popover-foreground shadow-lg backdrop-blur-md overflow-hidden animate-in fade-in-0 zoom-in-95">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Searching locations...</span>
            </div>
          ) : locations.length > 0 ? (
            <ul className="py-1 divide-y divide-border/30">
              {locations.map((loc) => (
                <li key={loc.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(loc)}
                    className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-muted/70 transition-colors cursor-pointer"
                  >
                    <MapPin className="size-4 mt-0.5 shrink-0 text-primary" />
                    <div>
                      <div className="font-medium text-foreground">{loc.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[loc.region, loc.country].filter(Boolean).join(", ")}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No locations found matching &ldquo;{debouncedTerm}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
