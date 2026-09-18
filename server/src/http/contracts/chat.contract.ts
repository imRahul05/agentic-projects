import { z } from "zod";
import { UnitSystem } from "../../config/config.types.js";

export const chatMessagePartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough();

export type ChatMessagePart = z.infer<typeof chatMessagePartSchema>;

export const clientChatMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().optional(),
    parts: z.array(chatMessagePartSchema).optional(),
  })
  .passthrough();

export type ClientChatMessage = z.infer<typeof clientChatMessageSchema>;

export const chatRequestSchema = z.object({
  messages: z.array(clientChatMessageSchema).min(1),
  modelAlias: z.string().optional(),
  units: z.enum(["metric", "imperial"]).optional().default("metric"),
  locale: z.string().optional().default("en-US"),
  timezone: z.string().optional(),
});

export interface ChatRequest {
  readonly messages: readonly ClientChatMessage[];
  readonly modelAlias?: string;
  readonly units: UnitSystem;
  readonly locale: string;
  readonly timezone?: string;
}
