"use client";

import { useChat } from "@ai-sdk/react";
import type { ChatStatus } from "ai";
import { useCallback, useMemo, useState } from "react";
import { createWeatherChatTransport } from "@/lib/chat/transport";
import type { ModelOption } from "@/lib/contracts/capabilities";
import type { WeatherUIMessage } from "@/lib/contracts/chat";

/**
 * Thin wrapper over the real v4 `useChat`:
 *
 *   useChat<UI_MESSAGE extends UIMessage = UIMessage>(options?: UseChatOptions<UI_MESSAGE>)
 *     -> { id, messages, status, error, setMessages, clearError,
 *          sendMessage, regenerate, stop, resumeStream,
 *          addToolOutput, addToolResult, addToolApprovalResponse }
 *
 * Notably: there is no `input`/`handleInputChange`/`handleSubmit`, no `isLoading`
 * and no `append`/`reload`. The composer owns its own input state and calls
 * `sendMessage({ text })`; "loading" is derived from `status`.
 *
 * What this hook adds on top: a stable transport, the selected model alias, and
 * an explicit `aborted` flag (the SDK returns to `status: "ready"` after `stop`,
 * which is indistinguishable from a finished answer).
 */

export interface UseWeatherChatOptions {
  readonly models: readonly ModelOption[];
  readonly defaultLocale?: string;
}

export interface UseWeatherChatResult {
  readonly messages: readonly WeatherUIMessage[];
  readonly status: ChatStatus;
  readonly error: Error | undefined;
  readonly isBusy: boolean;
  readonly isStreaming: boolean;
  readonly aborted: boolean;
  readonly modelAlias: string | undefined;
  readonly setModelAlias: (alias: string) => void;
  readonly send: (text: string) => void;
  readonly stop: () => void;
  readonly regenerate: () => void;
  readonly clearError: () => void;
}

/**
 * Chat actions reject only after the hook has already recorded the failure in
 * `error`, so the rejection itself is deliberately absorbed here rather than
 * escaping as an unhandled promise.
 */
function run(action: () => Promise<void>): void {
  void action().catch(() => undefined);
}

export function useWeatherChat(options: UseWeatherChatOptions): UseWeatherChatResult {
  const { models, defaultLocale } = options;

  const [selectedAlias, setSelectedAlias] = useState<string | undefined>(undefined);
  const [aborted, setAborted] = useState(false);

  // Fall back to the first model the server offers until the user picks one, so
  // no alias is ever hardcoded on the client.
  const modelAlias = useMemo(() => {
    if (selectedAlias !== undefined && models.some((model) => model.alias === selectedAlias)) {
      return selectedAlias;
    }
    return models[0]?.alias;
  }, [models, selectedAlias]);

  const transport = useMemo(
    () =>
      createWeatherChatTransport({
        ...(modelAlias === undefined ? {} : { modelAlias }),
        ...(defaultLocale === undefined ? {} : { defaultLocale }),
      }),
    [modelAlias, defaultLocale]
  );

  const chat = useChat<WeatherUIMessage>({ transport });
  const { messages, status, error, sendMessage, regenerate, stop, clearError } = chat;

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        return;
      }
      setAborted(false);
      run(() => sendMessage({ text: trimmed }));
    },
    [sendMessage]
  );

  const handleStop = useCallback(() => {
    setAborted(true);
    run(() => stop());
  }, [stop]);

  const handleRegenerate = useCallback(() => {
    setAborted(false);
    run(() => regenerate());
  }, [regenerate]);

  const isBusy = status === "submitted" || status === "streaming";
  const isStreaming = status === "streaming";

  return {
    messages,
    status,
    error,
    isBusy,
    isStreaming,
    aborted: aborted && !isBusy,
    modelAlias,
    setModelAlias: setSelectedAlias,
    send,
    stop: handleStop,
    regenerate: handleRegenerate,
    clearError,
  };
}
