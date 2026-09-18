import * as React from "react";
import { useCapabilitiesQuery } from "@/lib/queries/weather.queries";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModelSelectorProps {
  readonly selectedAlias: string;
  readonly onChange: (alias: string) => void;
}

export function ModelSelector({ selectedAlias, onChange }: ModelSelectorProps) {
  const { data: capabilities, isLoading } = useCapabilitiesQuery();

  if (isLoading) {
    return (
      <div className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        <span>Loading models...</span>
      </div>
    );
  }

  const models = capabilities?.models || [];
  if (models.length === 0) {
    return null;
  }

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <label htmlFor="model-select" className="sr-only">
        Select AI Model
      </label>
      <div className="flex items-center gap-1.5 rounded-lg border bg-background/80 px-2.5 py-1 text-xs shadow-sm backdrop-blur-sm">
        <Sparkles className="size-3.5 text-primary" />
        <select
          id="model-select"
          value={selectedAlias}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "bg-transparent font-medium text-foreground outline-none cursor-pointer text-xs pr-1"
          )}
        >
          {models.map((model) => (
            <option key={model.alias} value={model.alias} className="bg-popover text-popover-foreground">
              {model.label} ({model.provider})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
