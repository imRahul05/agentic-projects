"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, isToolUIPart, getToolName } from "ai";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UnitSystem } from "@/lib/types/weather.types";
import {
  Sparkles,
  Send,
  Square,
  Trash2,
  Bot,
  User,
  MapPin,
  CloudSun,
  Loader2,
  Calendar,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface WeatherChatPanelProps {
  readonly modelAlias: string;
  readonly units: UnitSystem;
  readonly className?: string;
}

const SUGGESTED_QUESTIONS: readonly string[] = [
  "What is the forecast for Paris this weekend?",
  "Will it rain in London today?",
  "Compare current weather in Tokyo and New York",
  "What should I wear for the weather in Chicago today?",
];

export function WeatherChatPanel({
  modelAlias,
  units,
  className,
}: WeatherChatPanelProps) {
  const [input, setInput] = React.useState<string>("");

  const transport = React.useMemo(() => {
    return new DefaultChatTransport({
      api: "/api/chat",
      body: {
        modelAlias,
        units,
      },
    });
  }, [modelAlias, units]);

  const { messages, sendMessage, stop, status, setMessages } = useChat({
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  function handleClearChat() {
    setMessages([]);
  }

  function handleSuggestionClick(question: string) {
    if (isLoading) return;
    sendMessage({ text: question });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div
      className={cn(
        "flex flex-col h-[600px] w-full rounded-2xl border bg-card text-card-foreground shadow-lg overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight text-foreground">
              Weather AI Agent
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Grounded multi-model meteorology
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px] font-normal">
            Model: {modelAlias}
          </Badge>
          {messages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleClearChat}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 text-sm"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
            <div className="rounded-2xl bg-primary/10 p-3.5 text-primary ring-1 ring-primary/20">
              <Bot className="size-8" />
            </div>
            <div>
              <h4 className="font-medium text-foreground text-sm">
                How can I help with your weather today?
              </h4>
              <p className="text-xs text-muted-foreground max-w-xs mt-1">
                Ask about current conditions, multi-day forecasts, or comparative meteorology anywhere in the world.
              </p>
            </div>

            {/* Suggestion Chips */}
            <div className="w-full max-w-sm pt-2 space-y-2">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Suggested Prompts
              </div>
              <div className="flex flex-col gap-1.5">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => handleSuggestionClick(question)}
                    className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2 text-left text-xs text-foreground hover:bg-muted/80 hover:border-primary/30 transition-colors cursor-pointer"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={cn(
                  "flex items-start gap-2.5",
                  isUser ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold select-none",
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground border"
                  )}
                >
                  {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                </div>

                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 max-w-[85%] space-y-2 text-sm leading-relaxed",
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted/50 border text-foreground rounded-tl-sm"
                  )}
                >
                  {message.parts.map((part, index) => {
                    if (isTextUIPart(part)) {
                      return (
                        <div key={index} className="whitespace-pre-wrap">
                          {part.text}
                        </div>
                      );
                    }

                    if (isToolUIPart(part)) {
                      const toolName = getToolName(part);
                      let icon = <Loader2 className="size-3 animate-spin text-primary" />;
                      let label = `Executing ${toolName}...`;

                      if (toolName === "search_location") {
                        icon = <MapPin className="size-3 text-primary" />;
                        label = "Location Resolved";
                      } else if (toolName === "get_current_weather") {
                        icon = <CloudSun className="size-3 text-primary" />;
                        label = "Weather Retrieved";
                      } else if (toolName === "get_forecast") {
                        icon = <Calendar className="size-3 text-primary" />;
                        label = "Forecast Analyzed";
                      } else if (toolName === "compare_weather") {
                        icon = <Layers className="size-3 text-primary" />;
                        label = "Comparison Complete";
                      }

                      return (
                        <div
                          key={index}
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground shadow-xs my-1"
                        >
                          {icon}
                          <span className="font-medium text-[11px]">{label}</span>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span>AI Agent is researching weather data...</span>
          </div>
        )}
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t bg-muted/20 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about the weather..."
          disabled={isLoading}
          className="flex-1 h-10 rounded-xl border bg-background px-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-50"
        />

        {isLoading ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={stop}
            title="Stop generation"
            aria-label="Stop generation"
          >
            <Square className="size-4 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            title="Send message"
            aria-label="Send message"
          >
            <Send className="size-4" />
          </Button>
        )}
      </form>
    </div>
  );
}
