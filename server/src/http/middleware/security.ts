import cors from "cors";
import helmet from "helmet";
import { RequestHandler } from "express";
import { HttpConfig } from "../../config/config.types.js";

export function createSecurityMiddlewares(config: HttpConfig): {
  helmetMiddleware: RequestHandler;
  corsMiddleware: RequestHandler;
} {
  const helmetMiddleware = helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  });

  const corsMiddleware = cors({
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: false,
    exposedHeaders: ["x-request-id", "content-type"],
    methods: ["GET", "POST", "OPTIONS"],
  });

  return { helmetMiddleware, corsMiddleware };
}
