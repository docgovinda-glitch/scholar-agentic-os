import type { Request, Response, NextFunction } from "express";

/**
 * Route-level middleware to enforce the client-only BYOK security boundary.
 *
 * Explicitly rejects any request payload carrying user-owned AI provider credentials
 * (apiKey, api_key, providerKey, provider_key) to prevent user BYOK credentials
 * from ever entering the Scholar backend server.
 *
 * Legitimate authentication fields (Authorization headers, session tokens, captcha tokens,
 * admin platform credentials under /api/admin) are preserved.
 */
export function rejectClientCredentials(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    const forbiddenKeys = ["apiKey", "api_key", "providerKey", "provider_key", "userApiKey", "user_api_key"];
    for (const key of forbiddenKeys) {
      if (key in req.body && req.body[key]) {
        res.status(400).json({
          error: "User BYOK API keys are client-held and cannot be submitted to the server. Execute BYOK operations directly on the client.",
        });
        return;
      }
    }
  }
  next();
}

export default rejectClientCredentials;
