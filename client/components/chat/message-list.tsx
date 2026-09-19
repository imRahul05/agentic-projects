"use client";

import { MessageItem } from "@/components/chat/message-item";
import type { WeatherUIMessage } from "@/lib/contracts/chat";

export interface MessageListProps {
  readonly messages: readonly WeatherUIMessage[];
  readonly isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const lastIndex = messages.length - 1;

  return (
    /**
     * `role="log"` + `aria-live="polite"` is the transcript pattern: assistive
     * technology announces text as it streams in without interrupting, and
     * without a duplicate off-screen mirror of the visible answer.
     */
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Conversation"
      className="flex flex-col gap-6"
    >
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isStreaming={isStreaming && index === lastIndex && message.role === "assistant"}
        />
      ))}
    </div>
  );
}
