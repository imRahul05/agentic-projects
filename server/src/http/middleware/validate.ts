import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../platform/errors/app-error.js";

/**
 * Any zod schema whose input is unconstrained — which is what an HTTP body or
 * query string is before validation.
 */
export type RequestSchema = z.ZodType<unknown, z.ZodTypeDef, unknown>;

/** `field -> message`, safe to return: it names our own fields, never a value. */
function fieldErrors(error: z.ZodError): Readonly<Record<string, string>> {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    details[path.length > 0 ? path : "body"] = issue.message;
  }
  return details;
}

function validationError(error: z.ZodError): AppError {
  const details = fieldErrors(error);
  return new AppError("VALIDATION_ERROR", {
    publicMessage: "The request body is invalid.",
    cause: error,
    meta: details,
  });
}

/**
 * Validates and *replaces* `req.body` with the parsed value, so a handler
 * downstream of this middleware can rely on the schema's output shape.
 */
export function validateBody<S extends RequestSchema>(schema: S): RequestHandler {
  return (req, _res, next): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates the query string. `req.query` is left untouched: Express 4 rebuilds
 * it lazily from the URL, so replacing it is not reliably observable.
 */
export function validateQuery<S extends RequestSchema>(schema: S): RequestHandler {
  return (req, _res, next): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    next();
  };
}
