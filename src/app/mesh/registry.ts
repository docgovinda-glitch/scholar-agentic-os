/**
 * app/mesh's agent registry — an in-process lookup from agent id to its
 * manifest. This is NOT docs 42 §9's "signed registry" (versioned config
 * fetched and verified at load time); it's the in-memory equivalent that
 * lets a caller (eventually the Conductor) look up "AG-18" without
 * importing every agent module directly.
 */

import type { AgentManifest } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, AgentManifest<any, any>>();

export function registerAgent<TInput, TOutput>(manifest: AgentManifest<TInput, TOutput>): void {
  registry.set(manifest.id, manifest);
}

export function getAgent(id: string): AgentManifest<unknown, unknown> | undefined {
  return registry.get(id);
}

export function listAgents(): AgentManifest<unknown, unknown>[] {
  return [...registry.values()];
}

/** Test-only: forgets every registered manifest. */
export function __resetRegistryForTests(): void {
  registry.clear();
}
