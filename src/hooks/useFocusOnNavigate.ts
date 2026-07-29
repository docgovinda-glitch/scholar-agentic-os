import { useEffect, useRef } from "react";

/**
 * Navigation overhaul (docs/planning/navigation-scoping.md) — moves keyboard
 * focus to a screen's heading whenever the given navigation key changes, so
 * focus never gets silently lost to <body> after a phase change, settings
 * sub-tab switch, or any other hash-driven navigation. Returns a ref to
 * attach to the heading element; the element needs `tabIndex={-1}` so it's
 * programmatically focusable without becoming part of the normal Tab order.
 */
export function useFocusOnNavigate<T extends HTMLElement>(navigationKey: string): React.RefObject<T> {
  const ref = useRef<T>(null);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationKey]);

  return ref as React.RefObject<T>;
}
