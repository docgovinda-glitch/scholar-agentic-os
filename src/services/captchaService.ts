/**
 * CAPTCHA configuration for Cloudflare Turnstile.
 *
 * The widget itself lives in src/desk/auth/CaptchaWidget.tsx. Turnstile tokens
 * are single-use, so the widget owns their lifecycle (reset after a failed
 * attempt, cleared on expiry). The server-side check is done by Supabase Auth.
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
  const siteKey =
    (typeof import.meta !== "undefined" && import.meta?.env?.VITE_CAPTCHA_SITE_KEY) ||
    (typeof process !== "undefined" && (process?.env?.VITE_CAPTCHA_SITE_KEY as string | undefined));
  return {
    siteKey: siteKey || "",
    enabled: Boolean(siteKey),
  };
}

/**
 * Type augmentation for the Cloudflare Turnstile API (loaded by CaptchaWidget).
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
