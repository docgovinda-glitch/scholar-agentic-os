import type { NextFunction, Request, Response } from "express";

/**
 * Browser tabs opened before the journal pipeline moved to one mount
 * (`/api/projects/:id/agentic`) still call the old `/api/projects/:id/agent/...`
 * address (publication readiness, export, copilot chat). This rewrites such a
 * request to the `/agentic` path before any router sees it, so it runs the
 * same handlers with the same auth, rate limits and AI decoration, without
 * mounting the router twice.
 *
 * Only exactly `/api/projects/<id>/agent` and paths under it are touched;
 * `/agentic` and Coursework's `/assignment/agent/...` are left alone.
 * Safe to remove once no tab can still run a build from before 2026-11-17
 * (a reload picks up the new client).
 */
const LEGACY = /^(\/api\/projects\/[^/?#]+)\/agent(?=[/?#]|$)/;

export function rewriteLegacyAgentPath(url: string): string {
  return url.replace(LEGACY, "$1/agentic");
}

export function legacyAgentPath(req: Request, _res: Response, next: NextFunction): void {
  const rewritten = rewriteLegacyAgentPath(req.url);
  if (rewritten !== req.url) {
    req.url = rewritten;
    markDeprecated(_res);
  }
  next();
}

/** Tells anyone looking at the response that an old client address was used. */
function markDeprecated(res: Response): void {
  res.setHeader("Deprecation", "true");
  res.setHeader("Link", '</api/projects/:id/agentic>; rel="successor-version"');
}
