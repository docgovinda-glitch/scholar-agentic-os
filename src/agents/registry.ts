/**
 * Agent Registry
 * 
 * Manages agent registration, discovery, and lifecycle.
 */

import type { Agent, AgentMetadata } from "./types";

// ============================================================================
// Agent Registry Events
// ============================================================================

export type AgentRegistryEvent =
  | "agent.registered"
  | "agent.unregistered"
  | "agent.enabled"
  | "agent.disabled"
  | "agent.error";

// ============================================================================
// Agent Entry
// ============================================================================

export interface AgentEntry<T = unknown, R = unknown> {
  agent: Agent<T, R>;
  registeredAt: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

// ============================================================================
// Agent Registry
// ============================================================================

export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<string, AgentEntry> = new Map();
  private eventHandlers: Map<string, Set<(payload: unknown) => void>> = new Map();

  private constructor() {}

  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  on(event: AgentRegistryEvent, handler: (payload: unknown) => void): () => void {
    const handlers = this.eventHandlers.get(event) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(event, handlers);
    return () => handlers.delete(handler);
  }

  private emit(event: AgentRegistryEvent, payload: unknown): void {
    this.eventHandlers.get(event)?.forEach((h) => h(payload));
  }

  // ============================================================================
  // Registration
  // ============================================================================

  register<T, R>(agent: Agent<T, R>, config?: Record<string, unknown>): void {
    const existing = this.agents.get(agent.metadata.id);
    if (existing && !config?.force) {
      return;
    }

    this.agents.set(agent.metadata.id, {
      agent,
      registeredAt: new Date().toISOString(),
      enabled: true,
      config,
    });

    this.emit("agent.registered", { agentId: agent.metadata.id });
  }

  unregister(id: string): boolean {
    if (!this.agents.has(id)) return false;
    this.agents.delete(id);
    this.emit("agent.unregistered", { agentId: id });
    return true;
  }

  // ============================================================================
  // Discovery
  // ============================================================================

  get(id: string): Agent | undefined {
    const entry = this.agents.get(id);
    return entry?.enabled ? entry.agent : undefined;
  }

  list(): AgentMetadata[] {
    return Array.from(this.agents.values()).map((e) => e.agent.metadata);
  }

  getAvailableIds(): string[] {
    return Array.from(this.agents.keys());
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  // ============================================================================
  // Enable/Disable
  // ============================================================================

  enable(id: string): boolean {
    const entry = this.agents.get(id);
    if (!entry) return false;
    entry.enabled = true;
    this.emit("agent.enabled", { agentId: id });
    return true;
  }

  disable(id: string): boolean {
    const entry = this.agents.get(id);
    if (!entry) return false;
    entry.enabled = false;
    this.emit("agent.disabled", { agentId: id });
    return true;
  }

  // ============================================================================
  // Clear (for testing)
  // ============================================================================

  clear(): void {
    this.agents.clear();
  }
}