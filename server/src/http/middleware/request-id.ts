import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const existing = req.header("x-request-id");
    const id = existing || randomUUID();
    req.id = id;
    res.setHeader("x-request-id", id);
    next();
  };
}
