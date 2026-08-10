/**
 * CAPTCHA verification middleware for Cloudflare Turnstile.
 * Validates tokens submitted by the client against the CAPTCHA_SECRET_KEY.
 */

const CAPTCHA_SECRET_KEY = process.env.CAPTCHA_SECRET_KEY;
const CAPTCHA_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface VerifyCaptchaResult {
  success: boolean;
  error?: string;
  errorCodes?: string[];
}

/**
 * Verify a CAPTCHA token from Cloudflare Turnstile.
 * Returns success: true if the token is valid.
 *
 * If CAPTCHA_SECRET_KEY is not configured, verification is skipped
 * (returns success: true). This allows the system to work without
 * CAPTCHA while the feature is being rolled out.
 */
export async function verifyCaptchaToken(token: string): Promise<VerifyCaptchaResult> {
  // If CAPTCHA is not configured, skip verification (pass through)
  if (!CAPTCHA_SECRET_KEY) {
    return { success: true };
  }

  if (!token) {
    return { success: false, error: "CAPTCHA token is required" };
  }

  try {
    const response = await fetch(CAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: CAPTCHA_SECRET_KEY,
        response: token,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `CAPTCHA verification service returned ${response.status}` };
    }

    const data = (await response.json()) as {
      success?: boolean;
      error_codes?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    if (data.success) {
      return { success: true };
    }

    return {
      success: false,
      error: "CAPTCHA verification failed",
      errorCodes: data.error_codes,
    };
  } catch (error) {
    return {
      success: false,
      error: `CAPTCHA verification error: ${error instanceof Error ? error.message : "unknown"}`,
    };
  }
}
