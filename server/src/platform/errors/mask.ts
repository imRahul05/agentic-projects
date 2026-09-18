/**
 * Last-line redaction for text that is about to cross the wire.
 *
 * Error text reaches the client from several places — an `AppError`'s
 * `publicMessage`, a provider SDK error relayed through the stream's `onError` —
 * and any of them may have been built from a URL, an api key, a provider id or a
 * provider-native model id. The client needs none of those, so they are stripped
 * here rather than trusted not to appear.
 */

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const BEARER_PATTERN = /\bbearer\s+\S+/gi;
/** Long opaque tokens: api keys, base64 blobs, hex digests. */
const TOKEN_PATTERN = /\b[A-Za-z0-9_-]{24,}\b/g;
const KEYED_SECRET_PATTERN =
  /\b(?:api[_-]?key|authorization|x-api-key|token|secret)\b\s*[:=]\s*\S+/gi;

export const REDACTED = "[redacted]";

/** Strips secrets that can be recognised by shape alone. */
export function maskUnsafeText(text: string): string {
  return text
    .replace(KEYED_SECRET_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, REDACTED)
    .replace(URL_PATTERN, REDACTED)
    .replace(TOKEN_PATTERN, REDACTED)
    .trim();
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Adds redaction of known literal values (provider ids, provider-native model
 * ids, base URLs, api keys) on top of {@link maskUnsafeText}. Those come from
 * configuration, so nothing about the deployment is restated in code.
 */
export function createTextMasker(sensitiveValues: readonly string[]): (text: string) => string {
  const candidates = sensitiveValues
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);

  if (candidates.length === 0) {
    return maskUnsafeText;
  }

  const literals = new RegExp(candidates.map(escapeForRegExp).join("|"), "gi");
  return (text: string): string => maskUnsafeText(text).replace(literals, REDACTED);
}
