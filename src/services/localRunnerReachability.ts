/**
 * What this browser knows about the runners on this device.
 *
 * A saved local connection is only a preference. Whether this page can actually talk to the runner is a separate
 * fact (CORS and Local Network Access decide it), so it is remembered from real probes and shown as its own state.
 *
 * It also decides whether a probe may run unprompted: a blocked request writes errors to the console that script
 * cannot catch, so nothing is probed on page load unless it is expected to succeed.
 */
import { useSyncExternalStore } from "react";

export type RunnerReach = "reachable" | "unreachable" | "unknown";

const KEY = "scholar_local_runner_reach";
const EVENT = "scholar:local-reach-changed";

function readAll(): Record<string, RunnerReach> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, RunnerReach>) : {};
  } catch {
    return {};
  }
}

export const getRunnerReach = (id: string): RunnerReach => readAll()[id] ?? "unknown";

export function setRunnerReach(id: string, reach: RunnerReach): void {
  if (getRunnerReach(id) === reach) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [id]: reach }));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage unavailable: the state is simply not remembered
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Re-renders when any runner's reachability changes; returns a lookup by runner id. */
export function useRunnerReach(): (id: string) => RunnerReach {
  const raw = useSyncExternalStore(subscribe, () => {
    try {
      return localStorage.getItem(KEY) || "{}";
    } catch {
      return "{}";
    }
  }, () => "{}");
  return (id) => {
    try {
      return (JSON.parse(raw) as Record<string, RunnerReach>)[id] ?? "unknown";
    } catch {
      return "unknown";
    }
  };
}

/** True only when the browser already lets this page reach the device, or the runner answered here before. */
export async function canProbeUnprompted(runnerId: string): Promise<boolean> {
  const known = getRunnerReach(runnerId);
  if (known !== "unknown") return known === "reachable";
  for (const name of ["loopback-network", "local-network-access"]) {
    try {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      if (status.state === "granted") return true;
    } catch {
      // this browser does not know the permission name
    }
  }
  return false;
}
