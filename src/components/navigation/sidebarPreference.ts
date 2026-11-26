/**
 * Whether the wide-screen sidebar is folded to its icon rail, as the user last chose it.
 * Shared by the main screen and Presentation Studio so the choice follows the user between them.
 * Phones never read it: there the sidebar is a drawer that always starts closed.
 */
const KEY = "scholar.sidebar.collapsed";

/** The saved choice, or null when the user has never chosen (or storage is unavailable). */
export function readSidebarCollapsed(): boolean | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "1" ? true : value === "0" ? false : null;
  } catch {
    return null;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    /* storage unavailable (private mode): the choice lasts for this page only */
  }
}
