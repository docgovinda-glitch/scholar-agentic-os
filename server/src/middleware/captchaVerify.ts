/**
 * CAPTCHA verification middleware for Cloudflare Turnstile.
 * Validates tokens submitted by the client against the CAPTCHA_SECRET_KEY.
 */

const CAPTCHA_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function getCaptchaSecretKey(): string | undefined {
  return process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || process.env.CAPTCHA_SECRET_KEY;
}

export interface VerifyCaptchaResult {
  success: boolean;
  error?: string;
  errorCodes?: string[];
}

/**
 * Verify a CAPTCHA token from Cloudflare Turnstile.
 * Returns success: true if the token is valid.
 *
 * If CAPTCHA_SECRET_KEY / CLOUDFLARE_TURNSTILE_SECRET_KEY is not configured,
 * verification is skipped (returns success: true).
 */
export async function verifyCaptchaToken(token: string): Promise<VerifyCaptchaResult> {
  const secretKey = getCaptchaSecretKey();
  // If CAPTCHA is not configured, skip verification (pass through)
  if (!secretKey) {
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
        secret: secretKey,
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
