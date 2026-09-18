import { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../../platform/errors/app-error.js";

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details: Record<string, string | number | boolean> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        details[path || "root"] = issue.message;
      }
      next(
        new AppError("VALIDATION_ERROR", {
          status: 422,
          publicMessage: result.error.issues.map((i) => i.message).join(", "),
          meta: details,
        })
      );
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details: Record<string, string | number | boolean> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        details[path || "root"] = issue.message;
      }
      next(
        new AppError("VALIDATION_ERROR", {
          status: 422,
          publicMessage: result.error.issues.map((i) => i.message).join(", "),
          meta: details,
        })
      );
      return;
    }
    next();
  };
}
