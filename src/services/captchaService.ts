/**
 * CAPTCHA service for Cloudflare Turnstile integration.
 * Provides abuse protection on signup form.
 *
 * Turnstile is configured in Cloudflare dashboard and returns verification
 * tokens that the server validates via CAPTCHA_SECRET_KEY.
 */

export interface CaptchaConfig {
  siteKey: string;
  enabled: boolean;
}

/**
 * Get CAPTCHA configuration from environment.
 * If VITE_CAPTCHA_SITE_KEY is not set, CAPTCHA is disabled.
 */
export function getCaptchaConfig(): CaptchaConfig {
  const siteKey = import.meta.env.VITE_CAPTCHA_SITE_KEY as string | undefined;
  return {
    siteKey: siteKey || "",
    enabled: Boolean(siteKey),
  };
}

/**
 * Request a CAPTCHA token from Turnstile.
 * Must be called in response to user interaction (form submission).
 * Returns the verification token to send to the server.
 */
export async function getCaptchaToken(): Promise<string | null> {
  if (!window.turnstile) {
    console.error("Turnstile CAPTCHA not loaded");
    return null;
  }

  try {
    const token = await window.turnstile.getResponse();
    if (token) return token;
    return null;
  } catch (error) {
    console.error("Error getting CAPTCHA token:", error);
    return null;
  }
}

/**
 * Reset the CAPTCHA widget (called when user wants to retry after error).
 */
export function resetCaptcha(): void {
  if (window.turnstile) {
    window.turnstile.reset();
  }
}

/**
 * Remove/reset the CAPTCHA widget (called after successful submission).
 */
export function clearCaptcha(): void {
  if (window.turnstile) {
    window.turnstile.remove();
  }
}

/**
 * Type augmentation for Cloudflare Turnstile API.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement | string, options: any) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => Promise<string>;
      isExpired: (widgetId?: string) => boolean;
    };
  }
}
