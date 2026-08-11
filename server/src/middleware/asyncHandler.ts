/**
 * Wraps an async Express route so a rejected promise becomes an HTTP
 * response instead of a hung request.
 *
 * Express 4 (this app's version — see package.json) only understands
 * synchronous throws: when an `async` handler rejects, Express never sees it.
 * The rejection surfaces as an unhandled promise rejection on the process
 * while the request itself is simply left open, with no status, no body, and
 * no entry in any error middleware — the client waits until it times out.
 * Express 5 fixes this natively; until this app moves, every async handler
 * needs either its own try/catch or this wrapper.
 *
 * 503 rather than 500 is deliberate: the failures this actually catches are
 * a Supabase Data API call refusing or timing out (SupabaseRestError), which
 * is "try again shortly", not "this request can never work". Handlers that
 * want a different status for an expected failure should still catch it
 * themselves — this is the floor, not a substitute.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch((err: unknown) => {
      // A handler that already answered before failing must not be answered
      // twice — writing again would throw ERR_HTTP_HEADERS_SENT and mask the
      // original error.
      if (res.headersSent) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(503).json({ error: message });
    });
  };
}
