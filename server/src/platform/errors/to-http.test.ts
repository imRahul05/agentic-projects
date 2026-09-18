import { describe, expect, it } from "vitest";
import { AppError, type ErrorCode } from "./app-error.js";
import { toHttpError } from "./to-http.js";

const EXPECTED_STATUS: ReadonlyArray<readonly [ErrorCode, number]> = [
  ["VALIDATION_ERROR", 422],
  ["MODEL_UNAVAILABLE", 422],
  ["SEARCH_UNAVAILABLE", 503],
  ["RATE_LIMITED", 429],
  ["UPSTREAM_TIMEOUT", 504],
  ["AGENT_LIMIT_EXCEEDED", 500],
  ["REQUEST_ABORTED", 499],
  ["INTERNAL_ERROR", 500],
];

const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "SEARCH_UNAVAILABLE",
  "RATE_LIMITED",
  "UPSTREAM_TIMEOUT",
]);

describe("toHttpError", () => {
  it.each(EXPECTED_STATUS)("maps %s to %i", (code, status) => {
    const { status: actual, body } = toHttpError(
      new AppError(code, { publicMessage: "safe message" }),
      "req-1",
    );

    expect(actual).toBe(status);
    expect(body.error.code).toBe(code);
    expect(body.error.message).toBe("safe message");
    expect(body.error.requestId).toBe("req-1");
  });

  it.each(EXPECTED_STATUS)("marks %s retryable only when it is", (code) => {
    const { body } = toHttpError(new AppError(code, { publicMessage: "safe message" }));
    expect(body.error.retryable).toBe(RETRYABLE.has(code));
  });

  it("honours an explicit status override", () => {
    const { status } = toHttpError(
      new AppError("VALIDATION_ERROR", { status: 404, publicMessage: "Not found." }),
    );
    expect(status).toBe(404);
  });

  it("returns the public message, never the cause", () => {
    const cause = new Error("connect ECONNREFUSED https://api.example.test key=sk-secret");
    const { body } = toHttpError(
      new AppError("SEARCH_UNAVAILABLE", {
        publicMessage: "Web search is not available right now.",
        cause,
      }),
    );

    expect(body.error.message).toBe("Web search is not available right now.");
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    expect(JSON.stringify(body)).not.toContain("api.example.test");
  });

  it("turns an unrecognised error into a generic 500", () => {
    const { status, body } = toHttpError(new Error("kaboom at /Users/someone/secret.ts"), "req-2");

    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("An internal server error occurred.");
    expect(body.error.retryable).toBe(false);
    expect(body.error.requestId).toBe("req-2");
    expect(JSON.stringify(body)).not.toContain("kaboom");
  });

  it("passes validation field errors through as details", () => {
    const { body } = toHttpError(
      new AppError("VALIDATION_ERROR", {
        publicMessage: "The request body is invalid.",
        meta: { "messages.0": "expected an object" },
      }),
    );

    expect(body.error.details).toEqual({ "messages.0": "expected an object" });
  });
});
