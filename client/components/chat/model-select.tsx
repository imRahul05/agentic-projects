"use client";

import { useId, useMemo } from "react";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";
import type { ModelOption } from "@/lib/contracts/capabilities";

export interface ModelSelectProps {
  /** From `capabilities.models` — the client names no model of its own. */
  readonly models: readonly ModelOption[];
  readonly value: string | undefined;
  readonly disabled?: boolean;
  readonly onChange: (alias: string) => void;
}

/**
 * Model selection, living in the composer's toolbar (ai-elements'
 * `prompt-input` select pattern) rather than in the page header, so the choice
 * sits where the message it applies to is written.
 *
 * The deployment decides how many models exist — the server only lists the ones
 * its keys can actually reach — so this handles every size:
 *
 *   0 models  the capabilities request has not landed (or failed): render nothing.
 *   1 model   nothing to choose, so show the name as static text instead of a
 *             control that cannot do anything.
 *   2+ models a real select.
 *
 * `alias` is the model id the server expects back in `modelAlias`; `label` is
 * the display name. Base UI's `Select` renders the label for the selected value
 * from the `items` map, so no lookup is duplicated here.
 */
export function ModelSelect({ models, value, disabled = false, onChange }: ModelSelectProps) {
  const labelId = useId();

  const items = useMemo(
    () => models.map((model) => ({ label: model.label, value: model.alias })),
    [models]
  );

  if (models.length === 0) {
    return null;
  }

  if (models.length === 1) {
    const only = models[0];
    return (
      <p className="min-w-0 truncate px-2 text-xs font-medium text-muted-foreground">
        <span className="sr-only">Model: </span>
        {only === undefined ? null : only.label}
      </p>
    );
  }

  return (
    <>
      <span className="sr-only" id={labelId}>
        Model
      </span>
      <PromptInputSelect
        disabled={disabled}
        items={items}
        value={value ?? null}
        onValueChange={(next: unknown) => {
          // Base UI types the value as the generic it could not infer; the only
          // values this select offers are the aliases put into `items`.
          if (typeof next === "string") {
            onChange(next);
          }
        }}
      >
        <PromptInputSelectTrigger aria-labelledby={labelId} size="sm">
          <PromptInputSelectValue placeholder="Model" />
        </PromptInputSelectTrigger>
        <PromptInputSelectContent align="start">
          {models.map((model) => (
            <PromptInputSelectItem key={model.alias} value={model.alias}>
              {model.label}
            </PromptInputSelectItem>
          ))}
        </PromptInputSelectContent>
      </PromptInputSelect>
    </>
  );
}
