/**
 * The one writer of `document.title`. Routes have fixed titles; a project route shows the name its workspace
 * publishes, so a name can never outlive the page it belonged to.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";

const APP = "Scholar Core";
let projectName = "";
const listeners = new Set<() => void>();

function publish(name: string): void {
  if (name === projectName) return;
  projectName = name;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** A workspace says what the open project is called. Cleared when it closes. */
export function useProjectDocumentTitle(name: string | null | undefined): void {
  const clean = (name ?? "").trim();
  useEffect(() => {
    if (clean) publish(clean);
  }, [clean]);
  useEffect(() => () => publish(""), []);
}

const ROUTE_TITLES: Array<[RegExp, string]> = [
  [/^\/(signin)?$/, "Projects"],
  [/^\/projects\/?$/, "Projects"],
  [/^\/presentation\/?$/, "Presentation Studio"],
  [/^\/vault\/?$/, "Knowledge Vault"],
  [/^\/ai-access(\/|$)/, "AI Access"],
  [/^\/settings\/?$/, "Account Settings"],
  [/^\/onboarding\/?$/, "Complete your profile"],
  [/^\/admin(\/|$)/, "Admin"],
  [/^\/(signup|reset-password|verify-email)(\/|$)/, "Account"],
];

export function titleFor(pathname: string, name: string): string {
  if (/^\/projects\/[^/]+/.test(pathname)) return `${name || "Project"} | ${APP}`;
  const route = ROUTE_TITLES.find(([pattern]) => pattern.test(pathname));
  return `${route ? route[1] : "Page not found"} | ${APP}`;
}

export function DocumentTitle(): null {
  const { pathname } = useLocation();
  const name = useSyncExternalStore(subscribe, () => projectName, () => "");
  useEffect(() => {
    document.title = titleFor(pathname, name);
  }, [pathname, name]);
  return null;
}
