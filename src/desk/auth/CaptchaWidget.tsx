import { useEffect, useRef } from "react";
import { getCaptchaConfig } from "../../services/captchaService";

/**
 * CAPTCHA widget wrapper for Cloudflare Turnstile.
 * Renders the CAPTCHA challenge and manages token retrieval.
 */
export default function CaptchaWidget({ onTokenReady }: { onTokenReady: (token: string | null) => void }) {
  const config = getCaptchaConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!config.enabled || !containerRef.current) {
      onTokenReady(null);
      return;
    }

    // Load Turnstile script if not already loaded
    if (!window.turnstile) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      script.onload = () => {
        if (window.turnstile && containerRef.current) {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: config.siteKey,
            theme: "light",
            size: "normal",
            callback: async () => {
              if (window.turnstile && widgetIdRef.current) {
                const token = await window.turnstile.getResponse(widgetIdRef.current);
                onTokenReady(token || null);
              }
            },
          });
        }
      };

      return () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };
    } else if (containerRef.current) {
      // Turnstile already loaded, render immediately
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: config.siteKey,
        theme: "light",
        size: "normal",
        callback: async () => {
          if (window.turnstile && widgetIdRef.current) {
            const token = await window.turnstile.getResponse(widgetIdRef.current);
            onTokenReady(token || null);
          }
        },
      });
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [config.enabled, config.siteKey, onTokenReady]);

  // If CAPTCHA is disabled, don't render anything
  if (!config.enabled) {
    return null;
  }

  return <div ref={containerRef} className="my-4" />;
}
