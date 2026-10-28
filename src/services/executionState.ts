/**
 * Request-Scoped AI Execution State Manager
 *
 * Tracks active AI operations scoped by project / request ID so concurrent
 * executions do not clobber one another. Exposes observable state for the
 * UI header and agent progress monitors.
 */

export type ExecutionStatus =
  | "idle"
  | "running"
  | "executing"
  | "fallback"
  | "recovering"
  | "error"
  | "completed"
  | "success";

export interface ExecutionScope {
  scopeId: string;
  providerId: string;
  providerName: string;
  modelId?: string;
  // Friendly aliases for UI consumption
  activeProvider: string;
  activeModel?: string;
  isFallback: boolean;
  isFallbackActive: boolean;
  status: ExecutionStatus;
  message?: string;
  startedAt: number;
}

export type ActiveAiExecution = ExecutionScope;
export type ExecutionListener = (execution: ExecutionScope | null) => void;

interface ListenerEntry {
  fn: ExecutionListener;
  filterScopeId?: string;
}

const scopes = new Map<string, ExecutionScope>();
const listeners = new Set<ListenerEntry>();
let currentScopeId: string | null = null;

function notify(targetScopeId?: string) {
  listeners.forEach((entry) => {
    try {
      if (entry.filterScopeId) {
        if (!targetScopeId || targetScopeId === entry.filterScopeId) {
          entry.fn(scopes.get(entry.filterScopeId) ?? null);
        }
      } else {
        const current = currentScopeId ? scopes.get(currentScopeId) ?? null : null;
        entry.fn(current);
      }
    } catch {
      // Listener threw; do not interrupt execution pipeline
    }
  });
}

import { announcePolite } from "../components/ui/AriaLiveAnnouncer";

export function startExecutionScope(
  scopeId: string,
  providerId: string,
  providerName: string,
  modelId?: string
): ExecutionScope {
  currentScopeId = scopeId;
  const scope: ExecutionScope = {
    scopeId,
    providerId,
    providerName,
    modelId,
    activeProvider: providerId,
    activeModel: modelId,
    isFallback: false,
    isFallbackActive: false,
    status: "running",
    message: undefined,
    startedAt: Date.now(),
  };
  scopes.set(scopeId, scope);
  notify();
  announcePolite(`AI generation started: ${providerName}${modelId ? ` (${modelId})` : ""}`);
  return scope;
}

export function updateExecutionScope(
  scopeId: string,
  patch: Partial<ExecutionScope>
): void {
  const existing = scopes.get(scopeId);
  if (!existing) return;

  const isFallback = patch.isFallbackActive ?? patch.isFallback ?? existing.isFallback;
  const activeProvider = patch.activeProvider ?? patch.providerId ?? existing.activeProvider;
  const activeModel = patch.activeModel ?? patch.modelId ?? existing.activeModel;

  scopes.set(scopeId, {
    ...existing,
    ...patch,
    isFallback,
    isFallbackActive: isFallback,
    activeProvider,
    activeModel,
  });
  notify();
}

export function endExecutionScope(
  scopeId: string,
  status: ExecutionStatus = "completed",
  message?: string
): void {
  const existing = scopes.get(scopeId);
  if (existing) {
    scopes.set(scopeId, {
      ...existing,
      status,
      message,
    });
    if (currentScopeId === scopeId) {
      currentScopeId = null;
    }
    notify();

    // Deterministic instant cleanup from active map
    scopes.delete(scopeId);
    if (scopes.size > 0) {
      currentScopeId = Array.from(scopes.keys())[0];
    }
    notify();
    announcePolite(`AI generation ${status === "completed" || status === "success" ? "completed" : status}`);
  }
}

export function getExecutionScope(scopeId: string): ExecutionScope | undefined {
  return scopes.get(scopeId);
}

export function getActiveExecution(scopeId?: string): ExecutionScope | null {
  const id = scopeId || currentScopeId;
  return id ? scopes.get(id) ?? null : null;
}

export function subscribeExecutionState(
  listener: ExecutionListener,
  filterScopeId?: string
): () => void {
  const entry: ListenerEntry = { fn: listener, filterScopeId };
  listeners.add(entry);
  // Immediate initial callback with requested scope
  if (filterScopeId) {
    listener(scopes.get(filterScopeId) ?? null);
  } else {
    listener(getActiveExecution());
  }
  return () => {
    listeners.delete(entry);
  };
}

export function clearAllExecutionScopes(): void {
  scopes.clear();
  currentScopeId = null;
  notify();
}
