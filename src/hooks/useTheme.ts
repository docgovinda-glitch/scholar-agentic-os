/**
 * The app's one light/dark switch. Every control that shows or changes the theme uses this, so two of them
 * on screen (a sidebar and a phone header) never disagree.
 */
import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const EVENT = "scholar:theme-changed";

function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem("scholar-theme") || localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  const stored = storedTheme();
  if (stored) return stored;
  if (document.documentElement.classList.contains("dark")) return "dark";
  // First visit with no saved choice: follow the device setting.
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

let transitionTimer: number | undefined;

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const toggleTheme = useCallback(() => {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    const apply = () => {
      applyTheme(next);
      try {
        localStorage.setItem("scholar-theme", next);
        localStorage.setItem("theme", next);
      } catch {
        // storage unavailable: the choice lasts for this page
      }
      window.dispatchEvent(new Event(EVENT));
    };
    document.documentElement.classList.add("theme-transition");
    window.clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => document.documentElement.classList.remove("theme-transition"), 200);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(apply);
    else apply();
  }, []);
  return { theme, toggleTheme };
}
