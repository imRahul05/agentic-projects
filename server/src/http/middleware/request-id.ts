import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      /**
       * Correlation id for this request. Always present: `requestId()` is the
       * first middleware `createApp` installs.
       */
      requestId: string;
    }
  }
}

const REQUEST_ID_HEADER = "x-request-id";

/**
 * A client-supplied id is echoed back only if it is a short, opaque token.
 * Anything else (control characters, header injection attempts, log-flooding
 * payloads) is replaced rather than rejected: correlation is a convenience, not
 * a contract the caller gets to fail the request on.
 */
const SANE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export function isSaneRequestId(value: string): boolean {
  return SANE_REQUEST_ID.test(value);
}

export function requestId(): RequestHandler {
  return (req, res, next): void => {
    const inbound = req.header(REQUEST_ID_HEADER);
    const id = inbound !== undefined && isSaneRequestId(inbound) ? inbound : randomUUID();
    req.requestId = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  };
}
