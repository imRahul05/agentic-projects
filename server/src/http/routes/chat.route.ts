import { Router, type RequestHandler } from "express";
import type { Container } from "../../container.js";
import { createChatRequestSchema, type ChatRequestBody } from "../contracts/chat.contract.js";
import { validateBody } from "../middleware/validate.js";
import { createChatStream } from "../stream/chat-stream.js";

export interface ChatRouteDeps {
  readonly container: Container;
  readonly rateLimiters: readonly RequestHandler[];
}

export function createChatRouter(deps: ChatRouteDeps): Router {
  const router = Router();
  const streamChat = createChatStream({ container: deps.container });
  const validateChatBody = validateBody(createChatRequestSchema(deps.container.config.ai.agent));

  router.post(
    "/chat",
    ...deps.rateLimiters,
    validateChatBody,
    (req, res, next): void => {
      // `validateChatBody` replaced `req.body` with the schema's output.
      const body: ChatRequestBody = req.body;
      streamChat({ req, res, body }).catch(next);
    },
  );

  return router;
}
