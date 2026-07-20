import type { AgentCapability, AgentCapabilityEntry, ArtifactType } from "./types";
import type { AgentMetadata } from "../agents/types";

export type CapabilityQuery = {
  capabilityId?: string;
  inputType?: ArtifactType;
  outputType?: ArtifactType;
  minHealth?: boolean;
};

export class AgentCapabilityRegistry {
  private entries: Map<string, AgentCapabilityEntry> = new Map();

  registerCapability(agentId: string, metadata: AgentMetadata, capabilities: AgentCapability[]): void {
    const existing = this.entries.get(agentId);
    if (existing) {
      existing.capabilities = capabilities;
      existing.metadata = metadata;
      return;
    }
    this.entries.set(agentId, {
      agentId,
      metadata,
      capabilities,
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
    });
  }

  getCapabilities(agentId: string): AgentCapabilityEntry | undefined {
    return this.entries.get(agentId);
  }

  findByCapabilityType(type: string): AgentCapabilityEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.capabilities.some((c) => c.id === type || c.name === type)
    );
  }

  findByInputType(type: ArtifactType): AgentCapabilityEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.capabilities.some((c) => c.inputTypes.includes(type))
    );
  }

  findByOutputType(type: ArtifactType): AgentCapabilityEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.capabilities.some((c) => c.outputTypes.includes(type))
    );
  }

  query(query: CapabilityQuery): AgentCapabilityEntry[] {
    let results = Array.from(this.entries.values());
    if (query.capabilityId) {
      results = results.filter((e) =>
        e.capabilities.some((c) => c.id === query.capabilityId || c.name === query.capabilityId)
      );
    }
    if (query.inputType) {
      results = results.filter((e) =>
        e.capabilities.some((c) => c.inputTypes.includes(query.inputType!))
      );
    }
    if (query.outputType) {
      results = results.filter((e) =>
        e.capabilities.some((c) => c.outputTypes.includes(query.outputType!))
      );
    }
    if (query.minHealth) {
      results = results.filter((e) => e.health.healthy);
    }
    return results;
  }

  list(): AgentCapabilityEntry[] {
    return Array.from(this.entries.values());
  }

  remove(agentId: string): boolean {
    return this.entries.delete(agentId);
  }

  updateMetrics(agentId: string, partial: Partial<AgentCapabilityEntry["metrics"]>): boolean {
    const entry = this.entries.get(agentId);
    if (!entry) return false;
    entry.metrics = { ...entry.metrics, ...partial };
    return true;
  }

  updateHealth(agentId: string, healthy: boolean, error?: string): boolean {
    const entry = this.entries.get(agentId);
    if (!entry) return false;
    entry.health = { healthy, lastCheck: new Date().toISOString(), error };
    return true;
  }

  clear(): void {
    this.entries.clear();
  }
}
