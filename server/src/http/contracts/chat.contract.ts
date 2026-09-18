import { z } from "zod";
import type { AgentConfig } from "../../config/config.types.js";

/**
 * `messages` is intentionally `unknown[]`.
 *
 * The UI message format is the AI SDK's (parts, tool calls, provider metadata),
 * and re-modelling it here would mean two schemas drifting apart — and, worse,
 * a zod object that silently strips the provider-specific fields a native web
 * search needs replayed. The array is size-checked here and then validated for
 * real by `safeValidateUIMessages` in the stream layer.
 */
const baseChatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1, "at least one message is required"),
  modelAlias: z.string().min(1).max(64).optional(),
  locale: z.string().min(2).max(35).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export type ChatRequestBody = z.infer<typeof baseChatRequestSchema>;

export type ChatRequestSchema = z.ZodType<ChatRequestBody, z.ZodTypeDef, unknown>;

/**
 * The input budget is a cost control, not a nicety: there is no auth in front of
 * this endpoint, so an unbounded history is an unbounded bill. It is measured on
 * the serialized payload because that is what actually reaches the model.
 */
export function createChatRequestSchema(agent: AgentConfig): ChatRequestSchema {
  return baseChatRequestSchema.superRefine((value, ctx) => {
    const serializedChars = JSON.stringify(value.messages).length;
    if (serializedChars > agent.maxInputChars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages"],
        message: `conversation is too large (${serializedChars} characters, limit ${agent.maxInputChars}); start a new chat`,
      });
    }
  });
}
