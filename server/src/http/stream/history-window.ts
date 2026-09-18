/** The only field windowing needs to look at. */
export interface RoledMessage {
  readonly role: string;
}

/**
 * Trims a conversation to the newest `maxMessages` messages by dropping WHOLE
 * older messages, and nothing else.
 *
 * CRITICAL: message parts are never inspected, filtered or rewritten. Provider-
 * executed web search returns tool parts carrying fields the provider requires
 * back verbatim on the next turn — Anthropic's native web search results include
 * an `encryptedContent` field which must be replayed unmodified or multi-turn
 * search breaks (the provider rejects or re-runs the search). Returned messages
 * are therefore the *same object references* that came in.
 *
 * This is also why the AI SDK's `pruneMessages` is not used: it prunes *inside*
 * messages (reasoning and tool-call/result content, on `ModelMessage`s), which is
 * precisely the surgery that would strip those fields. Dropping whole messages is
 * the only windowing that is safe here.
 */
export function windowHistory<T extends RoledMessage>(
  messages: readonly T[],
  maxMessages: number,
): T[] {
  if (maxMessages <= 0 || messages.length <= maxMessages) {
    return [...messages];
  }

  const windowed = messages.slice(messages.length - maxMessages);

  // A window that opens on an assistant turn hands the model an answer whose
  // question it can no longer see, so leading non-user messages are dropped too.
  // The final message is always kept: it is the turn being answered.
  let start = 0;
  while (start < windowed.length - 1 && windowed[start]?.role !== "user") {
    start += 1;
  }

  return windowed.slice(start);
}
