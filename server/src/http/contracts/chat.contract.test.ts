import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../../config/config.types.js";
import { createChatRequestSchema } from "./chat.contract.js";

const agent: AgentConfig = {
  maxSteps: 5,
  maxSearches: 3,
  totalTimeoutMs: 60000,
  stepTimeoutMs: 30000,
  maxOutputTokens: 1024,
  historyWindowMessages: 10,
  maxInputChars: 400,
};

const schema = createChatRequestSchema(agent);

function message(text: string): unknown {
  return { id: "m1", role: "user", parts: [{ type: "text", text }] };
}

describe("chat request contract", () => {
  it("accepts a minimal body", () => {
    const result = schema.safeParse({ messages: [message("weather in Lisbon?")] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages).toHaveLength(1);
      expect(result.data.modelAlias).toBeUndefined();
    }
  });

  it("accepts the optional fields", () => {
    const result = schema.safeParse({
      messages: [message("weather?")],
      modelAlias: "fast",
      locale: "pt-PT",
      timezone: "Europe/Lisbon",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modelAlias).toBe("fast");
      expect(result.data.locale).toBe("pt-PT");
      expect(result.data.timezone).toBe("Europe/Lisbon");
    }
  });

  it("passes messages through untouched instead of re-modelling them", () => {
    // A native web-search tool part, including the field Anthropic requires back
    // verbatim on later turns.
    const toolPart = {
      type: "tool-web_search",
      toolCallId: "call-1",
      state: "output-available",
      input: { query: "lisbon weather" },
      output: { results: [{ url: "https://example.test", encryptedContent: "opaque-blob" }] },
    };
    const assistant = { id: "m2", role: "assistant", parts: [toolPart] };

    const result = schema.safeParse({ messages: [message("hi"), assistant] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages[1]).toStrictEqual(assistant);
    }
  });

  it("rejects an empty message list", () => {
    const result = schema.safeParse({ messages: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a missing message list", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["messages"]);
    }
  });

  it.each([undefined, null, 42, "messages", { messages: "hello" }, { messages: {} }])(
    "rejects the malformed body %j",
    (body) => {
      expect(schema.safeParse(body).success).toBe(false);
    },
  );

  it("rejects an empty model alias rather than silently defaulting", () => {
    const result = schema.safeParse({ messages: [message("hi")], modelAlias: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a history larger than the configured input budget", () => {
    const oversized = [message("x".repeat(agent.maxInputChars + 1))];
    const result = schema.safeParse({ messages: oversized });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["messages"]);
      expect(result.error.issues[0]?.message).toContain("too large");
    }
  });

  it("measures the budget over the whole history, not a single message", () => {
    const half = "x".repeat(Math.ceil(agent.maxInputChars / 2));
    const result = schema.safeParse({ messages: [message(half), message(half)] });
    expect(result.success).toBe(false);
  });

  it("accepts a history just inside the budget", () => {
    const messages = [message("x".repeat(agent.maxInputChars / 4))];
    expect(JSON.stringify(messages).length).toBeLessThanOrEqual(agent.maxInputChars);
    expect(schema.safeParse({ messages }).success).toBe(true);
  });

  it("strips unknown keys so extra client transport fields are harmless", () => {
    const result = schema.safeParse({
      messages: [message("hi")],
      trigger: "submit-message",
      id: "chat-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(["messages"]);
    }
  });

  it("takes the budget from the config it is given", () => {
    const generous = createChatRequestSchema({ ...agent, maxInputChars: 100000 });
    const messages = [message("x".repeat(agent.maxInputChars + 1))];

    expect(schema.safeParse({ messages }).success).toBe(false);
    expect(generous.safeParse({ messages }).success).toBe(true);
  });
});
