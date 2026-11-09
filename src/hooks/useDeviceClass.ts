/**
 * Runtime device classification.
 *
 * Tailwind's `md:` / `lg:` classes handle layout, but they cannot decide
 * whether a component renders at all — and the AI configuration page needs
 * exactly that: Smart Gateway and Local AI require a real desktop (they depend
 * on the user installing and running a server program, which is impossible on
 * a phone), while on-device mobile AI is only meaningful on a handset. Hiding
 * those with CSS would still mount them, still run their detection probes, and
 * still let a phone user tab into an option they can never complete.
 *
 * Breakpoints match Tailwind's defaults so the JS and CSS agree:
 *   mobile  < 768px   (below `md`)
 *   tablet  768-1023  (`md`)
 *   desktop >= 1024   (`lg`)
 *
 * Width alone is not enough to say "desktop", though: a tablet in landscape is
 * wider than 1024px but still cannot run Ollama. So a coarse pointer (touch,
 * no mouse) demotes the result — that is what actually distinguishes a laptop
 * from a large tablet.
 */

import { useEffect, useState } from "react";

export type DeviceClass = "mobile" | "tablet" | "desktop";

export interface DeviceInfo {
  deviceClass: DeviceClass;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Primary input is touch — true on phones and tablets, false with a mouse */
  isTouchPrimary: boolean;
  /** Can this device plausibly run a local AI server program? */
  canRunLocalAI: boolean;
}

const MOBILE_MAX = 767;
const TABLET_MAX = 1023;
/** A touch device whose short side is this small or less is a phone, even turned sideways. */
const PHONE_SHORT_SIDE_MAX = 500;

/**
 * Pure classifier (exported for tests). Width alone mislabels a phone in
 * landscape (844x390) as a tablet, which then gets the desktop layout: a permanent
 * 260px sidebar and a chat only ~150px tall. For touch devices the short side is
 * what separates a phone from a tablet.
 */
export function classifyViewport(width: number, height: number, isTouchPrimary: boolean): DeviceClass {
  if (width <= MOBILE_MAX) return "mobile";
  if (isTouchPrimary && Math.min(width, height) <= PHONE_SHORT_SIDE_MAX) return "mobile";
  // A wide touch device is a tablet, not a desktop, however many pixels it has.
  if (width <= TABLET_MAX || isTouchPrimary) return "tablet";
  return "desktop";
}

function classify(): DeviceInfo {
  // SSR / test environments without a window: assume desktop so nothing is
  // hidden by default. Under-showing an option is worse than over-showing it.
  if (typeof window === "undefined") {
    return {
      deviceClass: "desktop",
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isTouchPrimary: false,
      canRunLocalAI: true,
    };
  }

  const isTouchPrimary =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const deviceClass = classifyViewport(window.innerWidth, window.innerHeight, isTouchPrimary);

  return {
    deviceClass,
    isMobile: deviceClass === "mobile",
    isTablet: deviceClass === "tablet",
    isDesktop: deviceClass === "desktop",
    isTouchPrimary,
    canRunLocalAI: deviceClass === "desktop",
  };
}

export function useDeviceClass(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(classify);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frame = 0;
    const onResize = () => {
      // Resize fires continuously while a window is dragged; coalescing to one
      // update per frame keeps this from re-rendering the whole settings page
      // dozens of times a second.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setInfo(classify()));
    };

    window.addEventListener("resize", onResize);
    const pointerQuery = window.matchMedia?.("(pointer: coarse)");
    pointerQuery?.addEventListener?.("change", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      pointerQuery?.removeEventListener?.("change", onResize);
    };
  }, []);

  return info;
}

/** Non-hook form for use outside React (services, one-off checks). */
export function getDeviceClass(): DeviceInfo {
  return classify();
}
