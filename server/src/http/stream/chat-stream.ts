import { pipeAgentUIStreamToResponse, safeValidateUIMessages } from "ai";
import type { Request, Response } from "express";
import type { ChatMessageMetadata, WeatherUIMessage } from "../../ai/agent/agent.types.js";
import type { Container } from "../../container.js";
import { AppError, isAbortError, type ErrorCode } from "../../platform/errors/app-error.js";
import { createTextMasker } from "../../platform/errors/mask.js";
import { collectSensitiveValues } from "../../platform/errors/sensitive-values.js";
import type { ChatRequestBody } from "../contracts/chat.contract.js";
import { windowHistory } from "./history-window.js";

export interface ChatStreamDeps {
  readonly container: Container;
}

export interface ChatStreamRequest {
  readonly req: Request;
  readonly res: Response;
  readonly body: ChatRequestBody;
}

/** What the client receives in a stream error part: never more than this. */
interface SafeStreamError {
  readonly code: ErrorCode;
  readonly message: string;
}

export interface ChatStreamHandler {
  (params: ChatStreamRequest): Promise<void>;
}

/**
 * Built once per app so the masker and the config lookups are not rebuilt per
 * request; the per-request state lives entirely inside the returned function.
 */
export function createChatStream(deps: ChatStreamDeps): ChatStreamHandler {
  const { config, logger, metrics, clock } = deps.container;
  const agentConfig = config.ai.agent;
  const mask = createTextMasker(collectSensitiveValues(config));

  return async function streamChat({ req, res, body }: ChatStreamRequest): Promise<void> {
    const log = logger.child({ requestId: req.requestId, route: "chat" });

    // Validate the message list before anything is spent on a model call.
    const validated = await safeValidateUIMessages<WeatherUIMessage>({ messages: body.messages });
    if (!validated.success) {
      throw new AppError("VALIDATION_ERROR", {
        publicMessage: "The conversation history is not a valid message list.",
        cause: validated.error,
      });
    }

    const uiMessages = windowHistory(validated.data, agentConfig.historyWindowMessages);

    const created = deps.container.createAgent({
      modelAlias: body.modelAlias,
      locale: body.locale ?? config.chat.defaultLocale,
      timezone: body.timezone,
    });

    const controller = new AbortController();
    const startedAtMs = clock.timestampMs();
    let searchCount = 0;
    let clientAborted = false;

    // The client hanging up must stop the agent — and therefore stop paying for
    // searches and tokens nobody will read.
    req.on("close", () => {
      if (res.writableEnded || controller.signal.aborted) return;
      clientAborted = true;
      controller.abort();
      metrics.increment("chat.stream.aborted");
      log.info("chat stream aborted by client", {
        durationMs: clock.timestampMs() - startedAtMs,
        searchCount,
      });
    });

    const metadata = (): ChatMessageMetadata => ({
      modelAlias: created.resolved.alias,
      providerId: created.resolved.providerId,
      searchCount,
      durationMs: clock.timestampMs() - startedAtMs,
    });

    log.info("chat stream started", {
      modelAlias: created.resolved.alias,
      providerId: created.resolved.providerId,
      messageCount: uiMessages.length,
      droppedMessages: validated.data.length - uiMessages.length,
    });

    try {
      await pipeAgentUIStreamToResponse({
        response: res,
        agent: created.agent,
        // Windowed history, passed through with every tool part intact.
        uiMessages: [...uiMessages],
        abortSignal: controller.signal,
        timeout: {
          totalMs: agentConfig.totalTimeoutMs,
          stepMs: agentConfig.stepTimeoutMs,
        },
        // Load-bearing: this emits normalized `source-url` parts, so a single
        // client UI renders citations for every provider despite their native
        // web-search tools returning entirely different output shapes.
        sendSources: true,
        messageMetadata: (): ChatMessageMetadata => metadata(),
        onStepEnd: (step): void => {
          // One agent, one tool: every tool call is a search.
          searchCount += step.toolCalls.length;
        },
        onError: (error): string => {
          const appError = AppError.from(error, {
            code: "INTERNAL_ERROR",
            publicMessage: "The assistant could not finish this answer.",
          });
          const safe: SafeStreamError = {
            code: isAbortError(error) ? "REQUEST_ABORTED" : appError.code,
            message: mask(appError.publicMessage),
          };
          if (safe.code === "REQUEST_ABORTED") {
            log.info("chat stream cancelled mid-answer", { searchCount });
          } else {
            // Full detail server-side only.
            log.error("chat stream error", {
              code: appError.code,
              error: appError.message,
              cause: appError.cause instanceof Error ? appError.cause.message : undefined,
              stack: appError.stack,
              searchCount,
            });
            metrics.increment("chat.stream.failed", { code: appError.code });
          }
          return JSON.stringify(safe);
        },
        onFinish: ({ isAborted, finishReason }): void => {
          const durationMs = clock.timestampMs() - startedAtMs;
          metrics.timing("chat.stream.duration", durationMs, {
            alias: created.resolved.alias,
          });
          if (isAborted || clientAborted) {
            log.info("chat stream aborted", { durationMs, searchCount });
            return;
          }
          metrics.increment("chat.stream.completed", { alias: created.resolved.alias });
          log.info("chat stream finished", {
            durationMs,
            searchCount,
            finishReason: finishReason ?? null,
          });
        },
      });
    } catch (error) {
      // An abort is an outcome, not a failure: it is never rethrown as an error.
      if (clientAborted || isAbortError(error)) {
        log.info("chat stream ended by abort", {
          durationMs: clock.timestampMs() - startedAtMs,
          searchCount,
        });
        return;
      }
      throw error;
    }
  };
}
