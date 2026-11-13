/**
 * Tracks the *visual* viewport, which is what the user actually sees.
 *
 * On iOS Safari the on-screen keyboard shrinks the visual viewport but not the
 * layout viewport (`100dvh` stays the same), so a composer pinned to the bottom
 * of a `100dvh` container ends up hidden behind the keyboard. Reading
 * `window.visualViewport` lets the caller size the container to what is visible
 * and hide chrome (e.g. the bottom nav) while the keyboard is open.
 *
 * Only active when `enabled`; otherwise returns `{ height: null, keyboardOpen: false }`
 * and attaches no listeners.
 */

import { useEffect, useState } from "react";

/** Height lost to browser chrome/rounding below this is not a keyboard. */
export const KEYBOARD_MIN_DELTA_PX = 120;

export interface VisualViewportState {
  height: number | null;
  keyboardOpen: boolean;
}

export function isKeyboardOpen(layoutHeight: number, visualHeight: number): boolean {
  return layoutHeight - visualHeight > KEYBOARD_MIN_DELTA_PX;
}

export function useVisualViewport(enabled: boolean): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>({ height: null, keyboardOpen: false });

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !vv) {
      setState({ height: null, keyboardOpen: false });
      return;
    }
    const update = () => {
      const keyboardOpen = isKeyboardOpen(window.innerHeight, vv.height);
      // Only override the container height while the keyboard is up.
      setState({ height: keyboardOpen ? Math.round(vv.height) : null, keyboardOpen });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return state;
}
