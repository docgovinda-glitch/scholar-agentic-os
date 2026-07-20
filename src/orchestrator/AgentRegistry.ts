/**
 * Agent Registry
 *
 * Manages agent registration, discovery, and lifecycle.
 * Provides a centralized repository for all agents in the system.
 */

import type { Agent, AgentMetadata, AgentContext, AgentResult } from "../agents/types";
import type { AgentCapability, AgentCapabilityEntry } from "./types";

// ============================================================================
// Registry Events
// ============================================================================

/**
 * Agent registry events.
 */
export type AgentRegistryEvent =
  | "agent.registered"
  | "agent.unregistered"
  | "agent.enabled"
  | "agent.disabled"
  | "agent.error";

// ============================================================================
// Agent Registry Events Interface
// ============================================================================

export interface AgentRegistryEvents {
  "agent.registered": { agentId: string; version: string };
  "agent.unregistered": { agentId: string };
  "agent.enabled": { agentId: string };
  "agent.disabled": { agentId: string };
  "agent.error": { agentId: string; error: string };
}

type EventHandler<T> = (payload: T) => void;

/**
 * Agent Registry
 */
export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<string, Agent> = new Map();
  private agentEntries: Map<string, {
    agent: Agent;
    registeredAt: string;
    enabled: boolean;
    config?: Record<string, unknown>;
    context?: AgentContext;
  }> = new Map();
  private eventHandlers: Map<string, Set<EventHandler<any>>> = new Map();
  private capabilityRegistry: Map<string, AgentCapabilityEntry> = new Map();

  /**
   * Create a new AgentRegistry instance.
   */
  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  on<K extends keyof AgentRegistryEvents>(
    event: K,
    handler: EventHandler<AgentRegistryEvents[K]>
  ): () => void {
    const handlers = this.eventHandlers.get(event as string) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(event as string, handlers);
    return () => handlers.delete(handler);
  }

  private emit<K extends keyof AgentRegistryEvents>(event: K, payload: AgentRegistryEvents[K]): void {
    this.eventHandlers.get(event as string)?.forEach((handler) => handler(payload));
  }

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * Register an agent.
   */
  register<T, R>(
    agent: Agent<T, R>, 
    config?: Record<string, unknown>,
    context?: AgentContext
  ): { success: boolean; reason?: string } {
    const existing = this.agentEntries.get(agent.metadata.id);

    if (existing) {
      return { success: false, reason: `Agent ${agent.metadata.id} already registered` };
    }

    // Create agent entry
    const entry = {
      agent,
      registeredAt: new Date().toISOString(),
      enabled: true,
      config,
      context,
    };

    this.agentEntries.set(agent.metadata.id, entry);
    this.agents.set(agent.metadata.id, agent);

    // Register capabilities
    this.registerCapabilities(agent.metadata.id, agent.metadata);

    this.emit("agent.registered", { 
      agentId: agent.metadata.id, 
      version: agent.metadata.version 
    });

    return { success: true };
  }

  /**
   * Unregister an agent.
   */
  unregister(id: string): boolean {
    const entry = this.agentEntries.get(id);
    if (!entry) {
      return false;
    }

    // Cleanup agent
    if (entry.agent.cleanup) {
      void entry.agent.cleanup();
    }

    this.agentEntries.delete(id);
    this.agents.delete(id);

    // Remove capabilities
    this.capabilityRegistry.delete(id);

    this.emit("agent.unregistered", { agentId: id });

    return true;
  }

  // ============================================================================
  // Discovery
  // ============================================================================

  /**
   * Get an agent by ID.
   */
  get<T, R>(id: string): Agent<T, R> | undefined {
    const entry = this.agentEntries.get(id);
    return entry?.enabled ? entry.agent as Agent<T, R> : undefined;
  }

  /**
   * Get an agent with context.
   */
  getWithContext<T, R>(id: string): { agent: Agent<T, R>; context?: AgentContext } | undefined {
    const entry = this.agentEntries.get(id);
    if (!entry || !entry.enabled) {
      return undefined;
    }

    return {
      agent: entry.agent as Agent<T, R>,
      context: entry.context,
    };
  }

  /**
   * List all agent metadata.
   */
  list(): AgentMetadata[] {
    return Array.from(this.agentEntries.values())
      .filter(entry => entry.enabled)
      .map(entry => entry.agent.metadata);
  }

  /**
   * Get all agent IDs.
   */
  getAllIds(): string[] {
    return Array.from(this.agentEntries.keys());
  }

  /**
   * Check if an agent exists.
   */
  has(id: string): boolean {
    return this.agentEntries.has(id);
  }

  // ============================================================================
  // Enable/Disable
  // ============================================================================

  /**
   * Enable an agent.
   */
  enable(id: string): boolean {
    const entry = this.agentEntries.get(id);
    if (!entry) {
      return false;
    }

    entry.enabled = true;
    this.emit("agent.enabled", { agentId: id });

    return true;
  }

  /**
   * Disable an agent.
   */
  disable(id: string): boolean {
    const entry = this.agentEntries.get(id);
    if (!entry) {
      return false;
    }

    entry.enabled = false;
    this.emit("agent.disabled", { agentId: id });

    return true;
  }

  /**
   * Check if an agent is enabled.
   */
  isEnabled(id: string): boolean {
    const entry = this.agentEntries.get(id);
    return entry?.enabled ?? false;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Update agent configuration.
   */
  updateConfig(id: string, config: Record<string, unknown>): boolean {
    const entry = this.agentEntries.get(id);
    if (!entry) {
      return false;
    }

    entry.config = { ...entry.config, ...config };
    return true;
  }

  /**
   * Get agent configuration.
   */
  getConfig(id: string): Record<string, unknown> | undefined {
    return this.agentEntries.get(id)?.config;
  }

  /**
   * Set agent context.
   */
  setContext(id: string, context: AgentContext): boolean {
    const entry = this.agentEntries.get(id);
    if (!entry) {
      return false;
    }

    entry.context = context;
    return true;
  }

  /**
   * Get agent context.
   */
  getContext(id: string): AgentContext | undefined {
    return this.agentEntries.get(id)?.context;
  }

  // ============================================================================
  // Capability Registry
  // ============================================================================

  /**
   * Register agent capabilities.
   */
  private registerCapabilities(agentId: string, metadata: AgentMetadata): void {
    const capability: AgentCapabilityEntry = {
      agentId,
      metadata,
      capabilities: [], // In a real implementation, this would extract capabilities from metadata
      health: {
        healthy: true,
        lastCheck: new Date().toISOString(),
      },
      metrics: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTimeMs: 0,
        lastExecution: new Date().toISOString(),
      },
    };

    this.capabilityRegistry.set(agentId, capability);
  }

  /**
   * Get agent capabilities.
   */
  getCapabilities(id: string): AgentCapabilityEntry | undefined {
    return this.capabilityRegistry.get(id);
  }

  /**
   * List all agent capabilities.
   */
  listCapabilities(): AgentCapabilityEntry[] {
    return Array.from(this.capabilityRegistry.values());
  }

  /**
   * Find agents by capability.
   */
  findByCapability(capabilityId: string): AgentCapabilityEntry[] {
    return Array.from(this.capabilityRegistry.values()).filter(entry =>
      entry.capabilities.some(cap => cap.id === capabilityId)
    );
  }

  // ============================================================================
  // Execution
  // ============================================================================

  /**
   * Execute an agent.
   */
  async execute<T, R>(
    id: string, 
    input: T, 
    context?: AgentContext
  ): Promise<AgentResult<R>> {
    const agentEntry = this.agentEntries.get(id);
    if (!agentEntry || !agentEntry.enabled) {
      return {
        ok: false,
        error: {
          type: "DEPENDENCY_ERROR",
          message: `Agent ${id} not found or disabled`,
        },
      };
    }

    // Use provided context or agent's stored context
    const agentContext = context || agentEntry.context;
    if (!agentContext) {
      return {
        ok: false,
        error: {
          type: "DEPENDENCY_ERROR",
          message: `No context available for agent ${id}`,
        },
      };
    }

    // Update metrics
    const capability = this.capabilityRegistry.get(id);
    if (capability) {
      capability.metrics.totalExecutions++;
      capability.metrics.lastExecution = new Date().toISOString();
    }

    try {
      const startTime = Date.now();
      const result = await agentEntry.agent.execute(input, agentContext);
      const executionTime = Date.now() - startTime;

      // Update execution metrics
      if (capability) {
        if (result.ok) {
          capability.metrics.successfulExecutions++;
        } else {
          capability.metrics.failedExecutions++;
        }

        // Update average execution time
        const currentAvg = capability.metrics.averageExecutionTimeMs;
        const total = capability.metrics.totalExecutions;
        capability.metrics.averageExecutionTimeMs = 
          (currentAvg * (total - 1) + executionTime) / total;
      }

      return result as AgentResult<R>;
    } catch (error) {
      // Update error metrics
      if (capability) {
        capability.metrics.failedExecutions++;
      }

      this.emit("agent.error", { 
        agentId: id, 
        error: error instanceof Error ? error.message : String(error) 
      });

      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Initialize all agents.
   */
  async initializeAll(): Promise<void> {
    const initPromises = Array.from(this.agentEntries.entries()).map(async ([id, entry]) => {
      if (entry.enabled && entry.agent.initialize && entry.context) {
        try {
          await entry.agent.initialize(entry.context);
        } catch (error) {
          this.emit("agent.error", { 
            agentId: id, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    });

    await Promise.all(initPromises);
  }

  /**
   * Cleanup all agents.
   */
  async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.agentEntries.entries()).map(async ([id, entry]) => {
      if (entry.agent.cleanup) {
        try {
          await entry.agent.cleanup();
        } catch (error) {
          this.emit("agent.error", { 
            agentId: id, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    });

    await Promise.all(cleanupPromises);
  }

  /**
   * Get agent health status.
   */
  getHealthStatus(id: string): { healthy: boolean; lastCheck: string; error?: string } | undefined {
    const capability = this.capabilityRegistry.get(id);
    return capability?.health;
  }

  /**
   * Update agent health status.
   */
  updateHealthStatus(id: string, healthy: boolean, error?: string): boolean {
    const capability = this.capabilityRegistry.get(id);
    if (!capability) {
      return false;
    }

    capability.health = {
      healthy,
      lastCheck: new Date().toISOString(),
      error,
    };

    return true;
  }

  /**
   * Clear all agents (for testing).
   */
  clear(): void {
    this.agents.clear();
    this.agentEntries.clear();
    this.capabilityRegistry.clear();
  }
}
