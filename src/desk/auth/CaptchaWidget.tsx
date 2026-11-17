import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
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

/** Imperative handle a form holds so it can reset the challenge after a failed attempt. */
export interface CaptchaWidgetHandle {
  reset: () => void;
}

interface CaptchaWidgetProps {
  onTokenReady: (token: string | null) => void;
  /** React 19 passes ref as a plain prop, so no forwardRef wrapper is needed. */
  ref?: Ref<CaptchaWidgetHandle>;
}

/**
 * CAPTCHA widget wrapper for Cloudflare Turnstile.
 *
 * A Turnstile token is single-use. After a failed submit the token it produced
 * has already been spent, so a retry with it fails for a reason the user cannot
 * see. Forms therefore call `reset()` on failure, which clears the held token
 * and re-arms the challenge. The widget also clears the token when Turnstile
 * reports it expired or errored, so a stale token is never submitted.
 *
 * The script-loading and already-loaded paths share ONE cleanup, so React
 * StrictMode's mount/unmount/remount never renders a second widget into the
 * same container. The `cancelled` flag covers an unmount while the script is
 * still in flight.
 *
 * `onTokenReady` is held in a ref rather than listed as an effect dependency:
 * callers pass an inline arrow, and depending on it would tear down and
 * re-render the challenge on every parent re-render.
 */
export default function CaptchaWidget({ onTokenReady, ref }: CaptchaWidgetProps) {
  const config = getCaptchaConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenReadyRef = useRef(onTokenReady);

  useEffect(() => {
    onTokenReadyRef.current = onTokenReady;
  }, [onTokenReady]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        onTokenReadyRef.current(null);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }),
    []
  );

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
          callback: (token: string) => onTokenReadyRef.current(token || null),
          "expired-callback": () => onTokenReadyRef.current(null),
          "error-callback": () => onTokenReadyRef.current(null),
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

  return <div ref={containerRef} className="my-3 flex justify-center w-full min-h-[66px] overflow-hidden" />;
}
