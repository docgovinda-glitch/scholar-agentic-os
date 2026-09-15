import { useEffect, useState } from "react";
import { useLoading } from "../context/LoadingContext";

interface GlobalLoadingOverlayProps {
  /** Optional override for controlled visibility, e.g. in Suspense fallback */
  active?: boolean;
  /** Optional custom message */
  message?: string;
}

/**
 * Global Loading Overlay with Active AI Breathing & Fast Spinning Core
 *
 * Requirements:
 * - Asset: cognitive_authority_veena_logo_v7b_colored_details.png
 * - Dark overlay: rgba(0, 0, 0, 0.8) covering viewport
 * - Fast 360° spin (2-3s linear infinite)
 * - Breathing core: scale(1) -> scale(1.05) with warm orange (#FF7A00) / magenta (#E02875) pulse
 * - Smooth fade-in / fade-out transitions (300ms) with pointer-events: none when idle
 */
export default function GlobalLoadingOverlay({
  active,
  message = "Processing...",
}: GlobalLoadingOverlayProps) {
  const context = useLoading();
  const isLoading = active !== undefined ? active : context.isLoading;
  const [shouldRender, setShouldRender] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setShouldRender(true);
    } else {
      // Allow the 300ms CSS fade-out transition to finish before unmounting from DOM
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      className={`ai-loading-overlay ${isLoading ? "is-visible" : "is-hidden"}`}
      role="status"
      aria-live="polite"
      aria-busy={isLoading}
      data-testid="global-loading-overlay"
    >
      <div className="flex flex-col items-center justify-center gap-5 select-none pointer-events-none">
        {/* Breathing Core Container */}
        <div
          className="ai-loader-breathe relative flex items-center justify-center flex-shrink-0"
          style={{ width: "76px", height: "76px" }}
        >
          {/* Rapid Active 360° Spinning Logo Image */}
          <img
            src="cognitive_authority_veena_logo_v7b_colored_details.png"
            alt="Active AI Core Processing"
            width={76}
            height={76}
            className="ai-loader-spin object-contain select-none pointer-events-none rounded-full"
            style={{ width: "76px", height: "76px" }}
            loading="eager"
            onError={(e) => {
              const target = e.currentTarget;
              if (
                !target.src.startsWith(
                  window.location.origin +
                    "/cognitive_authority_veena_logo_v7b_colored_details.png"
                )
              ) {
                target.src =
                  "/cognitive_authority_veena_logo_v7b_colored_details.png";
              }
            }}
          />
        </div>

        {/* Ambient Processing Status Label */}
        {message && (
          <span className="text-xs font-semibold tracking-wider text-white/80 uppercase font-sans animate-pulse">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
