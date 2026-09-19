"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ModelOption } from "@/lib/contracts/capabilities";

export interface ModelPickerProps {
  /** From `capabilities.models` — the client names no model of its own. */
  readonly models: readonly ModelOption[];
  readonly value: string | undefined;
  readonly disabled?: boolean;
  readonly onChange: (alias: string) => void;
}

/**
 * A segmented control rather than a dropdown: deployments expose two or three
 * models, so a picker that shows every option at once beats one that hides them
 * behind a popover. Base UI's `ToggleGroup` supplies the roving-focus keyboard
 * behaviour.
 */
export function ModelPicker({ models, value, disabled = false, onChange }: ModelPickerProps) {
  if (models.length < 2) {
    return null;
  }

  const selected = value === undefined ? [] : [value];

  return (
    <div className="flex items-center gap-2">
      <span id="model-picker-label" className="sr-only">
        Model
      </span>
      <ToggleGroup
        aria-labelledby="model-picker-label"
        value={selected}
        disabled={disabled}
        onValueChange={(groupValue) => {
          const next = groupValue[0];
          // Base UI reports `[]` when the pressed item is pressed again; a model
          // picker always needs exactly one selection, so ignore that.
          if (next !== undefined) {
            onChange(next);
          }
        }}
      >
        {models.map((model) => (
          <ToggleGroupItem
            key={model.alias}
            value={model.alias}
            size="sm"
            title={model.description ?? `${model.label} (${model.providerId})`}
          >
            {model.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
