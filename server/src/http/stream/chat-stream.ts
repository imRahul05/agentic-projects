import { pipeAgentUIStreamToResponse } from "ai";
import { Response } from "express";
import { WeatherAgent } from "../../ai/agent/agent.types.js";
import { ClientChatMessage } from "../contracts/chat.contract.js";

export interface StreamChatParams {
  readonly res: Response;
  readonly agent: WeatherAgent;
  readonly messages: readonly ClientChatMessage[];
  readonly abortSignal?: AbortSignal;
  readonly modelAlias?: string;
}

type PipeOptions = Parameters<typeof pipeAgentUIStreamToResponse>[0];

export async function streamChatToResponse(params: StreamChatParams): Promise<void> {
  const { res, agent, messages, abortSignal, modelAlias } = params;

  await pipeAgentUIStreamToResponse({
    response: res,
    agent,
    uiMessages: messages as PipeOptions["uiMessages"],
    abortSignal,
    messageMetadata: () => ({
      modelAlias,
    }),
    onError: (error: unknown) => {
      if (error instanceof Error) {
        return error.message;
      }
      return "An unexpected error occurred during weather processing.";
    },
  });
}
