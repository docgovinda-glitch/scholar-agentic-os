import { useEffect, useRef, useState } from "react";
import { loadGoogleGsiScript, signInWithGoogleIdToken } from "../../services/supabaseAuthService";

const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  "321279128437-m3pm3b0qk9kli39mv2em8t5fq2io841p.apps.googleusercontent.com";

interface GoogleIdentityButtonProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

/**
 * Renders the official Google Identity Services (GIS) button.
 * Uses `google.accounts.id.renderButton` to trigger Google's native popup,
 * authenticating directly via `signInWithIdToken` without ever navigating
 * the browser to `*.supabase.co` (preventing institutional firewall blocks).
 */
export default function GoogleIdentityButton({ onSuccess, onError, disabled }: GoogleIdentityButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gsiLoaded, setGsiLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadGoogleGsiScript()
      .then(() => {
        if (cancelled) return;
        const google = (window as any).google;
        if (!google?.accounts?.id || !containerRef.current) return;

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response: { credential?: string }) => {
            if (!response.credential) {
              onError?.("No credential returned from Google.");
              return;
            }

            setBusy(true);
            try {
              const res = await signInWithGoogleIdToken(response.credential);
              if (res.success) {
                onSuccess?.();
              } else {
                onError?.(res.error || "Google authentication failed.");
              }
            } catch (err: any) {
              onError?.(err?.message || "Google authentication failed.");
            } finally {
              setBusy(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Clear container and render Google standard button directly into containerRef
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          google.accounts.id.renderButton(containerRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            width: 320,
            text: "continue_with",
            shape: "rectangular",
            logo_alignment: "left",
          });
        }

        setGsiLoaded(true);
      })
      .catch((err) => {
        console.warn("[GoogleIdentityButton] GIS script failed to load:", err);
        setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [onSuccess, onError]);

  return (
    <div className="flex w-full flex-col items-center justify-center">
      {/* Container where Google renders its iframe button. Must remain mounted in DOM. */}
      <div
        ref={containerRef}
        className={`flex w-full justify-center ${!gsiLoaded ? "hidden" : ""}`}
        style={{ minHeight: gsiLoaded ? "40px" : "0px" }}
      />

      {/* Loading placeholder while GIS script is downloading */}
      {!gsiLoaded && !loadError && (
        <div className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[color:var(--text-muted)]">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span>Loading Google Sign-In…</span>
        </div>
      )}

      {/* Fallback notification if GIS script failed to load (e.g. adblocker) */}
      {loadError && (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] p-3 text-center text-xs text-[color:var(--text-muted)]">
          Google Sign-In is unavailable. Please sign in with your email and password below.
        </div>
      )}

      {busy && (
        <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span>Authenticating with Google…</span>
        </div>
      )}
    </div>
  );
}
