import { useCallback, useEffect, useState } from "react";

/**
 * Theme control for the token system in src/index.css.
 *
 * Three states, not two. "system" is a real, selectable choice rather than
 * merely the absence of a choice: a user whose OS switches to dark at sunset
 * expects the app to follow, and collapsing that into a boolean toggle makes
 * the behaviour unreachable once they have touched the control even once.
 *
 * The stylesheet does the actual work — `prefers-color-scheme` for "system",
 * and a `data-theme` attribute on <html> to override it in either direction.
 * This hook only decides which of those applies.
 *
 * The matching pre-paint read lives inline in index.html. It must stay in
 * sync with STORAGE_KEY below; it cannot import from here, because it has to
 * run before the bundle loads to avoid a flash of the wrong theme.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "scholar-theme";

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Safari private mode throws on localStorage access. Fall through to
    // "system", which needs no storage to work.
  }
  return "system";
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** What the user will actually see, once preference and OS setting combine. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return prefersDark() ? "dark" : "light";
  return preference;
}

function applyPreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    // Removing the attribute hands control back to the media query, rather
    // than pinning whichever value happened to be resolved at the time.
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference));

  // Keep the DOM and the resolved value in step with the preference.
  useEffect(() => {
    applyPreference(preference);
    setResolved(resolveTheme(preference));
  }, [preference]);

  // Follow the OS while the preference is "system". Without this the app
  // would keep whatever the OS setting was at load time.
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(query.matches ? "dark" : "light");

    // addEventListener on MediaQueryList is unsupported in Safari < 14, which
    // still ships addListener. Both are wired so neither browser is stranded.
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference still applies for this session; it just will not persist.
    }
  }, []);

  return { preference, resolved, setPreference };
}
