/**
 * Document Intelligence Engine - Pipeline Stage Registry
 * 
 * Manages registration and discovery of pipeline stages.
 * Allows stages to be registered and ordered dynamically.
 */

import type { DocumentIntelligenceStage, PipelineStageId } from "./types";

// ============================================================================
// Stage Registry Events
// ============================================================================

export interface PipelineStageRegistryEvents {
  "stage.registered": { stageId: PipelineStageId; order: number };
  "stage.unregistered": { stageId: PipelineStageId };
  "stage.error": { stageId: PipelineStageId; error: string };
}

type EventHandler<T> = (payload: T) => void;

// ============================================================================
// Pipeline Stage Registry
// ============================================================================

export interface StageEntry {
  stage: DocumentIntelligenceStage;
  registeredAt: string;
  order: number;
}

export interface StageRegisterOptions {
  /** Force override existing stage with same ID */
  force?: boolean;
  /** Order in pipeline (lower numbers execute first) */
  order?: number;
}

/**
 * Registry for pipeline stages.
 * Supports dynamic registration and ordering.
 */
export class PipelineStageRegistry {
  private static instance: PipelineStageRegistry;
  private stages: Map<PipelineStageId, StageEntry> = new Map();
  private eventHandlers: Map<string, Set<EventHandler<any>>> = new Map();

  constructor() {}

  static getInstance(): PipelineStageRegistry {
    if (!PipelineStageRegistry.instance) {
      PipelineStageRegistry.instance = new PipelineStageRegistry();
    }
    return PipelineStageRegistry.instance;
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  on<K extends keyof PipelineStageRegistryEvents>(
    event: K,
    handler: EventHandler<PipelineStageRegistryEvents[K]>
  ): () => void {
    const handlers = this.eventHandlers.get(event as string) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(event as string, handlers);
    return () => handlers.delete(handler);
  }

  private emit<K extends keyof PipelineStageRegistryEvents>(event: K, payload: PipelineStageRegistryEvents[K]): void {
    this.eventHandlers.get(event as string)?.forEach((handler) => handler(payload));
  }

  // ============================================================================
  // Registration
  // ============================================================================

  register(
    stage: DocumentIntelligenceStage,
    options?: StageRegisterOptions
  ): { success: true } | { success: false; reason: string } {
    const { stageId } = stage;
    const order = options?.order ?? this.stages.size * 100;

    const existing = this.stages.get(stageId);
    if (existing && !options?.force) {
      return { success: false, reason: `Stage ${stageId} already registered` };
    }

    const entry: StageEntry = {
      stage,
      registeredAt: new Date().toISOString(),
      order,
    };

    this.stages.set(stageId, entry);
    this.emit("stage.registered", { stageId, order });
    return { success: true };
  }

  unregister(stageId: PipelineStageId): boolean {
    if (!this.stages.has(stageId)) {
      return false;
    }
    this.stages.delete(stageId);
    this.emit("stage.unregistered", { stageId });
    return true;
  }

  // ============================================================================
  // Discovery
  // ============================================================================

  get(stageId: PipelineStageId): DocumentIntelligenceStage | undefined {
    return this.stages.get(stageId)?.stage;
  }

  list(): PipelineStageId[] {
    return Array.from(this.stages.keys());
  }

  /**
   * Get stages in execution order.
   */
  getOrdered(): DocumentIntelligenceStage[] {
    return Array.from(this.stages.values())
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.stage);
  }

  has(stageId: PipelineStageId): boolean {
    return this.stages.has(stageId);
  }

  clear(): void {
    this.stages.clear();
  }
}