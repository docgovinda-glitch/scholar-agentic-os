import { useEffect, useRef, useState } from "react";
import { loadGoogleGsiScript, signInWithGoogleIdToken, signInWithGoogle } from "../../services/supabaseAuthService";
import { GoogleSignInButton } from "./AuthLayout";

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
 *
 * Resilient fallback: If Google's GSI rejects the current origin (e.g. [GSI_LOGGER] error
 * due to missing Authorized JavaScript origins in Google Cloud Console or third-party cookie blocks),
 * it seamlessly falls back to standard Supabase OAuth redirect via GoogleSignInButton.
 */
export default function GoogleIdentityButton({ onSuccess, onError, disabled }: GoogleIdentityButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gsiLoaded, setGsiLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  async function handleOAuthFallback() {
    setBusy(true);
    onErrorRef.current?.("");
    try {
      const res = await signInWithGoogle();
      if (!res.success) {
        onErrorRef.current?.(res.error || "Could not start Google sign in.");
        setBusy(false);
      }
    } catch (e: any) {
      onErrorRef.current?.(e?.message || "Could not start Google sign in.");
      setBusy(false);
    }
  }

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
              onErrorRef.current?.("No credential returned from Google.");
              return;
            }

            setBusy(true);
            try {
              const res = await signInWithGoogleIdToken(response.credential);
              if (res.success) {
                onSuccessRef.current?.();
              } else {
                onErrorRef.current?.(res.error || "Google authentication failed.");
              }
            } catch (err: any) {
              onErrorRef.current?.(err?.message || "Google authentication failed.");
            } finally {
              setBusy(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
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

        // Verification check: If Google fails to render the iframe inside containerRef
        // (common when Authorized JavaScript origins is missing in Google Cloud Console or cookies blocked),
        // fallback smoothly to our standard GoogleSignInButton after 1.5s so the user is never stuck.
        setTimeout(() => {
          if (!cancelled && containerRef.current) {
            const hasIframe = containerRef.current.querySelector("iframe");
            if (!hasIframe) {
              setLoadError(true);
            }
          }
        }, 1500);
      })
      .catch((err) => {
        console.warn("[GoogleIdentityButton] GIS script failed to load:", err);
        setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // If GIS script failed or Google rejected rendering the button due to origins/cookies,
  // display the resilient standard Google Sign-In button that routes via Supabase OAuth redirect.
  if (loadError) {
    return (
      <div className="flex w-full flex-col items-center justify-center">
        <GoogleSignInButton onClick={handleOAuthFallback} busy={busy} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center justify-center">
      {/* Container where Google renders its iframe button. Must remain mounted in DOM. */}
      <div
        ref={containerRef}
        className={`flex w-full justify-center ${!gsiLoaded ? "hidden" : ""}`}
        style={{ minHeight: gsiLoaded ? "40px" : "0px" }}
      />

      {/* Loading placeholder while GIS script is downloading */}
      {!gsiLoaded && (
        <div className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[color:var(--text-muted)]">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span>Loading Google Sign-In…</span>
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
