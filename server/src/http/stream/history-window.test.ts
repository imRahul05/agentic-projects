import { describe, expect, it } from "vitest";
import { windowHistory } from "./history-window.js";

interface TestMessage {
  readonly id: string;
  readonly role: string;
  readonly parts?: readonly unknown[];
}

function user(id: string): TestMessage {
  return { id, role: "user", parts: [{ type: "text", text: id }] };
}

function assistant(id: string): TestMessage {
  return { id, role: "assistant", parts: [{ type: "text", text: id }] };
}

describe("windowHistory", () => {
  it("returns a short history unchanged", () => {
    const messages = [user("a"), assistant("b")];
    expect(windowHistory(messages, 10)).toEqual(messages);
  });

  it("does not hand back the caller's array", () => {
    const messages = [user("a")];
    expect(windowHistory(messages, 10)).not.toBe(messages);
  });

  it("keeps the newest messages and drops the oldest", () => {
    const messages = [user("1"), assistant("2"), user("3"), assistant("4"), user("5")];
    const windowed = windowHistory(messages, 3);

    expect(windowed.map((m) => m.id)).toEqual(["3", "4", "5"]);
  });

  it("never opens the window on an assistant turn whose question was dropped", () => {
    const messages = [user("1"), assistant("2"), assistant("3"), user("4")];
    const windowed = windowHistory(messages, 3);

    expect(windowed.map((m) => m.id)).toEqual(["4"]);
    expect(windowed[0]?.role).toBe("user");
  });

  it("always keeps the turn being answered", () => {
    const messages = [user("1"), assistant("2"), assistant("3")];
    expect(windowHistory(messages, 1).map((m) => m.id)).toEqual(["3"]);
  });

  it("drops only whole messages, keeping every surviving message identical", () => {
    // `encryptedContent` is provider-required and must survive byte for byte.
    const toolPart = {
      type: "tool-web_search",
      output: { results: [{ url: "https://example.test", encryptedContent: "opaque-blob" }] },
    };
    const withTool: TestMessage = { id: "tool", role: "assistant", parts: [toolPart] };
    const messages = [user("old"), withTool, user("new")];

    const windowed = windowHistory(messages, 2);

    expect(windowed).toHaveLength(1);
    // Same object references: nothing was copied, filtered or rewritten.
    expect(windowed[0]).toBe(messages[2]);
    expect(windowHistory(messages, 3)[1]).toBe(withTool);
    expect(windowHistory(messages, 3)[1]?.parts?.[0]).toBe(toolPart);
  });

  it("treats a non-positive window as no windowing at all", () => {
    const messages = [user("1"), assistant("2")];
    expect(windowHistory(messages, 0)).toEqual(messages);
  });

  it("handles an empty history", () => {
    expect(windowHistory([], 5)).toEqual([]);
  });
});
