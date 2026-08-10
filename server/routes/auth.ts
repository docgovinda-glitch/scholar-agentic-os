import express from "express";
import { verifyCaptchaToken } from "../src/middleware/captchaVerify.ts";

/**
 * Authentication routes for signup verification.
 * Handles CAPTCHA token verification and other signup-time checks.
 */
export function registerAuthRoutes(app: express.Express): void {
  /**
   * POST /api/auth/verify-signup
   *
   * Verifies CAPTCHA token before allowing signup.
   * Called client-side during form submission to validate the challenge.
   *
   * Body:
   *   - captchaToken: string (from Turnstile)
   *
   * Returns:
   *   - success: boolean
   *   - error?: string (if verification failed)
   */
  app.post("/api/auth/verify-signup", express.json(), async (req, res) => {
    const { captchaToken } = req.body as { captchaToken?: string };

    if (!captchaToken) {
      return res.status(400).json({
        success: false,
        error: "CAPTCHA token is required",
      });
    }

    const result = await verifyCaptchaToken(captchaToken);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "CAPTCHA verification failed",
      });
    }

    return res.json({ success: true });
  });
}
