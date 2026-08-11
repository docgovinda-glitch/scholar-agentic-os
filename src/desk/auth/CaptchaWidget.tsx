import { useEffect, useRef } from "react";
import { getCaptchaConfig } from "../../services/captchaService";

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/**
 * Loads the Turnstile script once per document and resolves when the API is
 * available. Concurrent callers share the same promise, and a remount reuses
 * the already-loaded script rather than injecting another copy.
 */
let turnstileReady: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileReady) return turnstileReady;

  turnstileReady = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        // Allow a later mount to retry rather than caching the failure forever.
        turnstileReady = null;
        reject(new Error("Could not load the CAPTCHA challenge."));
      },
      { once: true }
    );
  });

  return turnstileReady;
}

/**
 * CAPTCHA widget wrapper for Cloudflare Turnstile.
 *
 * The script-loading and already-loaded paths deliberately share ONE cleanup.
 * They used to be separate: the loading branch returned its own cleanup that
 * removed the <script> tag and nothing else, which made the widget-removing
 * cleanup below it unreachable on that path — so React StrictMode's
 * mount/unmount/remount rendered a second Turnstile widget into the same
 * container on any cold load. (Removing the <script> also did not unload the
 * API it had already defined, so it never undid anything.) The `cancelled`
 * flag covers the same race for an unmount that happens while the script is
 * still in flight.
 *
 * `onTokenReady` is held in a ref rather than listed as an effect dependency:
 * callers pass an inline arrow, and depending on it would tear down and
 * re-render the challenge on every parent re-render.
 */
export default function CaptchaWidget({ onTokenReady }: { onTokenReady: (token: string | null) => void }) {
  const config = getCaptchaConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenReadyRef = useRef(onTokenReady);

  useEffect(() => {
    onTokenReadyRef.current = onTokenReady;
  }, [onTokenReady]);

  useEffect(() => {
    if (!config.enabled) {
      onTokenReadyRef.current(null);
      return;
    }

    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        // A widget already rendered into this container (a double-invoked
        // effect that raced past `cancelled`) must be torn down before
        // another goes in, so the container never holds two.
        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: config.siteKey,
          theme: "light",
          size: "normal",
          callback: async () => {
            if (!window.turnstile || !widgetIdRef.current) return;
            const token = await window.turnstile.getResponse(widgetIdRef.current);
            onTokenReadyRef.current(token || null);
          },
        });
      })
      .catch(() => {
        if (!cancelled) onTokenReadyRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [config.enabled, config.siteKey]);

  // If CAPTCHA is disabled, don't render anything
  if (!config.enabled) {
    return null;
  }

  return <div ref={containerRef} className="my-4" />;
}
