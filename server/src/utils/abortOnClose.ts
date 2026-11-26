import type express from "express";

const requestSignals = new WeakMap<object, AbortSignal>();

/**
 * Aborted when the client goes away before the response is sent (the user
 * left, pressed Stop, or the browser gave up waiting), so the AI call stops
 * instead of running on, spending their credit, for nobody.
 */
export function abortOnClose(req: express.Request<any>): AbortSignal {
  const known = requestSignals.get(req);
  if (known) return known;
  const ctl = new AbortController();
  const res = req.res;
  res?.on("close", () => {
    if (!res.writableEnded) ctl.abort();
  });
  requestSignals.set(req, ctl.signal);
  return ctl.signal;
}
