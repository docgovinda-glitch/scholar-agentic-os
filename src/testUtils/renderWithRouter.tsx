import { useEffect, type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter, useLocation, type MemoryRouterProps } from "react-router-dom";

/**
 * Shared test helper for anything using react-router-dom hooks
 * (useNavigate/useParams/useSearchParams/Link/etc.) — those throw outside a
 * Router ancestor, so any component that's been migrated onto real routes
 * needs this instead of a bare render(). Centralized here so every migrated
 * test file shares one implementation rather than each hand-rolling its own
 * MemoryRouter setup — the previous per-test pattern of manually calling
 * window.history.pushState(...) before render() doesn't work once a real
 * router owns navigation state; MemoryRouter's own initialEntries replaces it.
 */

export interface RenderWithRouterOptions extends Omit<RenderOptions, "wrapper"> {
  /** Starting URL(s) for the in-memory history stack. Defaults to ["/"]. */
  initialEntries?: MemoryRouterProps["initialEntries"];
  /** Which entry in initialEntries is "current" on mount. */
  initialIndex?: number;
  /**
   * Called whenever the current route changes, so a test can assert on
   * navigation (e.g. "clicking Back returned to /") without reaching into
   * MemoryRouter's internals or re-adding raw window.location assertions.
   */
  onLocationChange?: (location: { pathname: string; search: string; hash: string }) => void;
}

function LocationWatcher({ onChange }: { onChange: RenderWithRouterOptions["onLocationChange"] }) {
  const location = useLocation();
  useEffect(() => {
    onChange?.({ pathname: location.pathname, search: location.search, hash: location.hash });
  }, [location, onChange]);
  return null;
}

export function renderWithRouter(ui: ReactElement, options: RenderWithRouterOptions = {}) {
  const { initialEntries = ["/"], initialIndex, onLocationChange, ...renderOptions } = options;
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      {onLocationChange && <LocationWatcher onChange={onLocationChange} />}
      {ui}
    </MemoryRouter>,
    renderOptions
  );
}
