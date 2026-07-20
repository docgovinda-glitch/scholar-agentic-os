/**
 * Workflow Registry
 *
 * Manages workflow definitions, registration, discovery, and versioning.
 * Provides a centralized repository for all workflow definitions.
 */

import type { WorkflowDefinition, WorkflowRegistryEntry } from "./types";
import { WorkflowDefinitionManager } from "./WorkflowDefinition";

// ============================================================================
// Registry Events
// ============================================================================

/**
 * Workflow registry events.
 */
export type WorkflowRegistryEvent =
  | "workflow.registered"
  | "workflow.unregistered"
  | "workflow.updated"
  | "workflow.error";

// ============================================================================
// Workflow Registry Implementation
// ============================================================================

export interface WorkflowRegistryEvents {
  "workflow.registered": { workflowId: string; version: string };
  "workflow.unregistered": { workflowId: string };
  "workflow.updated": { workflowId: string; oldVersion: string; newVersion: string };
  "workflow.error": { workflowId: string; error: string };
}

type EventHandler<T> = (payload: T) => void;

/**
 * Workflow Registry
 */
export class WorkflowRegistry {
  private static instance: WorkflowRegistry;
  private workflows: Map<string, WorkflowRegistryEntry> = new Map();
  private eventHandlers: Map<string, Set<EventHandler<any>>> = new Map();
  private definitionManager: WorkflowDefinitionManager;

  /**
   * Create a new WorkflowRegistry instance.
   */
  private constructor() {
    this.definitionManager = new WorkflowDefinitionManager();
    // Register the default research workflow
    const defaultWorkflow = this.definitionManager.createDefaultResearchWorkflow();
    this.register(defaultWorkflow);
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): WorkflowRegistry {
    if (!WorkflowRegistry.instance) {
      WorkflowRegistry.instance = new WorkflowRegistry();
    }
    return WorkflowRegistry.instance;
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  on<K extends keyof WorkflowRegistryEvents>(
    event: K,
    handler: EventHandler<WorkflowRegistryEvents[K]>
  ): () => void {
    const handlers = this.eventHandlers.get(event as string) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(event as string, handlers);
    return () => handlers.delete(handler);
  }

  private emit<K extends keyof WorkflowRegistryEvents>(event: K, payload: WorkflowRegistryEvents[K]): void {
    this.eventHandlers.get(event as string)?.forEach((handler) => handler(payload));
  }

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * Register a workflow definition.
   */
  register(workflow: WorkflowDefinition, force = false): { success: boolean; reason?: string } {
    const existing = this.workflows.get(workflow.id);

    if (existing && !force) {
      if (existing.definition.version === workflow.version) {
        return { success: false, reason: `Workflow ${workflow.id} v${workflow.version} already registered` };
      }

      // Update existing workflow
      const oldVersion = existing.definition.version;
      const entry: WorkflowRegistryEntry = {
        definition: workflow,
        stats: existing.stats,
      };

      this.workflows.set(workflow.id, entry);
      this.emit("workflow.updated", { 
        workflowId: workflow.id, 
        oldVersion, 
        newVersion: workflow.version 
      });

      return { success: true };
    }

    // Create new entry
    const entry: WorkflowRegistryEntry = {
      definition: workflow,
      stats: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTimeMs: 0,
        lastExecution: new Date().toISOString(),
      },
    };

    this.workflows.set(workflow.id, entry);
    this.emit("workflow.registered", { workflowId: workflow.id, version: workflow.version });

    return { success: true };
  }

  /**
   * Unregister a workflow definition.
   */
  unregister(id: string): boolean {
    if (!this.workflows.has(id)) {
      return false;
    }

    this.workflows.delete(id);
    this.emit("workflow.unregistered", { workflowId: id });

    return true;
  }

  // ============================================================================
  // Discovery
  // ============================================================================

  /**
   * Get a workflow definition by ID.
   */
  get(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id)?.definition;
  }

  /**
   * Get all workflow definitions.
   */
  list(): WorkflowDefinition[] {
    return Array.from(this.workflows.values()).map(entry => entry.definition);
  }

  /**
   * Find workflows by tags.
   */
  findByTags(tags: string[]): WorkflowDefinition[] {
    return this.list().filter(workflow => 
      workflow.tags && tags.some(tag => workflow.tags!.includes(tag))
    );
  }

  /**
   * Find workflows by author.
   */
  findByAuthor(author: string): WorkflowDefinition[] {
    return this.list().filter(workflow => 
      workflow.author === author
    );
  }

  /**
   * Get workflow statistics.
   */
  getStats(id: string): WorkflowRegistryEntry["stats"] | undefined {
    return this.workflows.get(id)?.stats;
  }

  /**
   * Update workflow statistics.
   */
  updateStats(id: string, stats: Partial<WorkflowRegistryEntry["stats"]>): boolean {
    const entry = this.workflows.get(id);
    if (!entry) {
      return false;
    }

    entry.stats = { ...entry.stats, ...stats };
    return true;
  }

  // ============================================================================
  // Version Management
  // ============================================================================

  /**
   * Get all versions of a workflow.
   */
  getVersions(id: string): WorkflowDefinition[] {
    // For simplicity, we're only storing one version per workflow ID
    // In a real implementation, this would store multiple versions
    const workflow = this.get(id);
    return workflow ? [workflow] : [];
  }

  /**
   * Get the latest version of a workflow.
   */
  getLatestVersion(id: string): WorkflowDefinition | undefined {
    // For simplicity, we're only storing one version per workflow ID
    // In a real implementation, this would return the most recent version
    return this.get(id);
  }

  /**
   * Clone a workflow with a new ID.
   */
  clone(id: string, newId?: string): WorkflowDefinition | undefined {
    const workflow = this.get(id);
    if (!workflow) {
      return undefined;
    }

    const cloned = this.definitionManager.clone(workflow, newId);
    this.register(cloned);

    return cloned;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Serialize a workflow to JSON.
   */
  serialize(id: string): string | undefined {
    const workflow = this.get(id);
    if (!workflow) {
      return undefined;
    }

    return this.definitionManager.serialize(workflow);
  }

  /**
   * Deserialize a workflow from JSON.
   */
  deserialize(json: string): WorkflowDefinition | undefined {
    try {
      const workflow = this.definitionManager.deserialize(json);
      this.register(workflow);
      return workflow;
    } catch (error) {
      console.error("Failed to deserialize workflow:", error);
      return undefined;
    }
  }

  /**
   * Check if a workflow exists.
   */
  has(id: string): boolean {
    return this.workflows.has(id);
  }

  /**
   * Get all workflow IDs.
   */
  getAllIds(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * Clear all workflows (for testing).
   */
  clear(): void {
    this.workflows.clear();
  }
}
