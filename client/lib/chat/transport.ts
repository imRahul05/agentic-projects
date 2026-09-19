import { DefaultChatTransport } from "ai";
import { apiPaths, endpoints } from "@/lib/api/endpoints";
import type { WeatherUIMessage } from "@/lib/contracts/chat";

/** What the transport needs from the UI at the moment a message is sent. */
export interface ChatSendContext {
  readonly modelAlias?: string;
  /** `capabilities.defaultLocale`, used when the browser reports no language. */
  readonly defaultLocale?: string;
}

/**
 * The IANA zone the browser is actually in, e.g. `Europe/Lisbon`.
 *
 * This is the single highest-value field in the request: without it the agent
 * cannot resolve "today" or "tomorrow", and its web searches drift to stale
 * dates. Available in every modern browser and in Node, so it is safe to call
 * during render — but still guarded, because a bad ICU build would otherwise
 * take the whole composer down.
 */
export function resolveTimezone(): string | undefined {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timezone === "string" && timezone.length > 0 ? timezone : undefined;
  } catch {
    return undefined;
  }
}

/** The viewer's preferred language, falling back to the deployment default. */
export function resolveLocale(fallback: string | undefined): string | undefined {
  if (typeof navigator !== "undefined") {
    const language = navigator.language;
    if (typeof language === "string" && language.length > 0) {
      return language;
    }
  }
  return fallback;
}

/**
 * `POST {base}/api/chat` with `{ messages, modelAlias?, locale?, timezone? }`.
 *
 * The absolute URL is resolved inside `prepareSendMessagesRequest` rather than
 * at construction: constructing happens during render (including the server
 * prerender), and a missing `NEXT_PUBLIC_API_BASE_URL` must surface as a request
 * error the UI can show, not as a render crash.
 *
 * Cheap to rebuild — `useChat` keeps the `transport` option in its own internal
 * latest-value ref and resolves it per request, so handing it a new instance when
 * the selected model changes does not recreate the chat or disturb the stream.
 */
export function createWeatherChatTransport(
  context: ChatSendContext
): DefaultChatTransport<WeatherUIMessage> {
  return new DefaultChatTransport<WeatherUIMessage>({
    api: apiPaths.chat,
    prepareSendMessagesRequest: ({ messages, body }) => {
      const timezone = resolveTimezone();
      const locale = resolveLocale(context.defaultLocale);

      return {
        api: endpoints.chat(),
        body: {
          ...body,
          messages,
          ...(context.modelAlias === undefined ? {} : { modelAlias: context.modelAlias }),
          ...(locale === undefined ? {} : { locale }),
          ...(timezone === undefined ? {} : { timezone }),
        },
      };
    },
    prepareReconnectToStreamRequest: () => ({ api: endpoints.chat() }),
  });
}
