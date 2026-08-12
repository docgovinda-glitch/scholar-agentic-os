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

import express from "express";
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

const ROUTE_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * An express.Router whose route handlers are wrapped in asyncHandler
 * automatically.
 *
 * Wrapping by hand does not scale to a router this size: server/routes/admin.ts
 * registers roughly forty routes, most of them `async` and most writing to
 * Supabase, and protection that depends on each author remembering to wrap the
 * next one is protection that lapses. Missing a wrap fails silently — the route
 * works until the day its Supabase call rejects, and then it hangs rather than
 * erroring, which is the failure mode hardest to notice in testing. Doing it at
 * the router makes the guarantee structural: a route added later is covered
 * without anyone having to know this exists.
 *
 * Handlers taking four arguments are left alone — that is Express's
 * error-middleware signature, and wrapping one would change its arity and stop
 * Express recognising it. Synchronous handlers pass through asyncHandler
 * harmlessly (Promise.resolve of a non-promise), so they need no special case.
 *
 * A handler with its own try/catch keeps working exactly as before and simply
 * never reaches the fallback — this is a floor under the router, not a
 * replacement for a route's own error handling, and routes that answer a
 * specific failure with a specific status should still do so themselves.
 */
export function createAsyncRouter(): express.Router {
  const router = express.Router();

  for (const method of ROUTE_METHODS) {
    const original = router[method].bind(router) as (...args: unknown[]) => unknown;
    (router as unknown as Record<string, unknown>)[method] = (path: unknown, ...handlers: unknown[]) =>
      original(
        path,
        ...handlers.map((h) => (typeof h === "function" && h.length < 4 ? asyncHandler(h as Parameters<typeof asyncHandler>[0]) : h))
      );
  }

  return router;
}
