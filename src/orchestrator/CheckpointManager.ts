import type { AnyArtifact, WorkflowExecutionState } from "./types";

export interface CheckpointData {
  id: string;
  executionId: string;
  stageId: string;
  state: WorkflowExecutionState;
  artifacts: Record<string, AnyArtifact>;
  queue: string[];
  runningAgents: string[];
  completedAgents: string[];
  failures: Array<{ stageId: string; error: string; timestamp: string }>;
  timestamp: string;
  version: string;
}

export class CheckpointManager {
  private checkpoints: Map<string, CheckpointData[]> = new Map();
  private readonly maxCheckpoints: number;

  constructor(opts?: { maxCheckpoints?: number }) {
    this.maxCheckpoints = opts?.maxCheckpoints ?? 50;
  }

  async createCheckpoint(params: {
    executionId: string;
    stageId?: string;
    state: WorkflowExecutionState;
    artifacts?: Record<string, AnyArtifact>;
    queue?: string[];
    runningAgents?: string[];
    completedAgents?: string[];
    failures?: Array<{ stageId: string; error: string; timestamp: string }>;
    timestamp?: string;
  }): Promise<void> {
    const existing = this.checkpoints.get(params.executionId) ?? [];
    const now = params.timestamp ?? new Date().toISOString();

    const checkpoint: CheckpointData = {
      id: `cp-${params.executionId}-${now}-${Math.random().toString(16).slice(2, 8)}`,
      executionId: params.executionId,
      stageId: params.stageId ?? params.state.currentStage ?? "",
      state: JSON.parse(JSON.stringify(params.state)) as WorkflowExecutionState,
      artifacts: params.artifacts ? JSON.parse(JSON.stringify(params.artifacts)) : {},
      queue: params.queue ?? [],
      runningAgents: params.runningAgents ?? [],
      completedAgents: params.completedAgents ?? [],
      failures: params.failures ?? [],
      timestamp: now,
      version: "1.0.0",
    };

    existing.push(checkpoint);

    if (existing.length > this.maxCheckpoints) {
      existing.splice(0, existing.length - this.maxCheckpoints);
    }

    this.checkpoints.set(params.executionId, existing);
  }

  async restoreCheckpoint(executionId: string, index?: number): Promise<CheckpointData | undefined> {
    const existing = this.checkpoints.get(executionId);
    if (!existing || existing.length === 0) return undefined;

    const idx = index ?? existing.length - 1;
    if (idx < 0 || idx >= existing.length) return undefined;

    const checkpoint = JSON.parse(JSON.stringify(existing[idx])) as CheckpointData;
    return checkpoint;
  }

  async getLatestCheckpoint(executionId: string): Promise<CheckpointData | undefined> {
    return this.restoreCheckpoint(executionId);
  }

  async listCheckpoints(executionId: string): Promise<CheckpointData[]> {
    return [...(this.checkpoints.get(executionId) ?? [])];
  }

  async listAllCheckpoints(): Promise<Map<string, CheckpointData[]>> {
    return new Map(this.checkpoints);
  }

  async removeCheckpoints(executionId: string): Promise<boolean> {
    return this.checkpoints.delete(executionId);
  }

  async removeAllCheckpoints(): Promise<void> {
    this.checkpoints.clear();
  }
}
