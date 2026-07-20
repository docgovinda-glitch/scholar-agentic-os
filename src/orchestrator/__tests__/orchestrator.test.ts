import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { ExecutionMode } from "../../agents/types";
import { DependencyResolver } from "../DependencyResolver";
import { AgentCapabilityRegistry } from "../AgentCapabilityRegistry";
import { ExecutionQueue } from "../ExecutionQueue";
import { RetryManager } from "../RetryManager";
import { CheckpointManager } from "../CheckpointManager";
import { ApprovalGateManager } from "../ApprovalGateManager";
import { ArtifactRouter } from "../ArtifactRouter";
import { ExecutionAuditService } from "../ExecutionAuditService";
import { ExecutionHistoryService } from "../ExecutionHistoryService";
import { MetricsCollector } from "../MetricsCollector";
import { HealthMonitor } from "../HealthMonitor";
import { NotificationManager } from "../NotificationManager";
import { FailureRecoveryManager } from "../FailureRecoveryManager";
import { WorkflowVisualizerModel } from "../WorkflowVisualizerModel";
import { WorkflowEngine } from "../WorkflowEngine";
import { ExecutionScheduler } from "../ExecutionScheduler";
import { WorkflowDefinitionBuilder, WorkflowDefinitionManager } from "../WorkflowDefinition";
import type { WorkflowDefinition, WorkflowStage, AnyArtifact } from "../types";

const makeStage = (overrides: Partial<WorkflowStage> & { id: string }): WorkflowStage => ({
  name: overrides.id,
  description: `Stage ${overrides.id}`,
  type: "processing",
  agentId: "test-agent",
  dependencies: [],
  config: {},
  ...overrides,
});

const sampleWorkflow: WorkflowDefinition = {
  id: "test-workflow",
  name: "Test Workflow",
  description: "A test workflow",
  version: "1.0.0",
  executionMode: "sequential",
  stages: [
    makeStage({ id: "stage-1" }),
    makeStage({ id: "stage-2", dependencies: ["stage-1"] }),
    makeStage({ id: "stage-3", dependencies: ["stage-1"] }),
    makeStage({ id: "stage-4", dependencies: ["stage-2", "stage-3"] }),
  ],
  config: { timeout: 5000 },
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
};

// ============================================================================
// Dependency Resolver Tests
// ============================================================================
describe("DependencyResolver", () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  it("should resolve linear dependencies in correct order", () => {
    const result = resolver.resolve(sampleWorkflow);
    expect(result.valid).toBe(true);
    expect(result.order).toEqual(["stage-1", "stage-2", "stage-3", "stage-4"]);
  });

  it("should detect missing dependencies", () => {
    const wf: WorkflowDefinition = {
      ...sampleWorkflow,
      stages: [
        makeStage({ id: "a" }),
        makeStage({ id: "b", dependencies: ["missing"] }),
      ],
    };
    const result = resolver.resolve(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "missing")).toBe(true);
  });

  it("should detect cycles", () => {
    const wf: WorkflowDefinition = {
      ...sampleWorkflow,
      stages: [
        makeStage({ id: "a", dependencies: ["c"] }),
        makeStage({ id: "b", dependencies: ["a"] }),
        makeStage({ id: "c", dependencies: ["b"] }),
      ],
    };
    const result = resolver.resolve(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "cycle")).toBe(true);
  });

  it("should detect self-references", () => {
    const wf: WorkflowDefinition = {
      ...sampleWorkflow,
      stages: [
        makeStage({ id: "a", dependencies: ["a"] }),
      ],
    };
    const result = resolver.resolve(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "self-reference")).toBe(true);
  });

  it("should detect duplicate stage IDs", () => {
    const wf: WorkflowDefinition = {
      ...sampleWorkflow,
      stages: [
        makeStage({ id: "a" }),
        makeStage({ id: "a" }),
      ],
    };
    const result = resolver.resolve(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "duplicate")).toBe(true);
  });

  it("should compute parallel groups correctly", () => {
    const result = resolver.resolve(sampleWorkflow);
    expect(result.parallelGroups.length).toBe(3);
    expect(result.parallelGroups[0]).toEqual(["stage-1"]);
    expect(result.parallelGroups[1]).toEqual(["stage-2", "stage-3"]);
    expect(result.parallelGroups[2]).toEqual(["stage-4"]);
  });

  it("should compute levels for ordering", () => {
    const result = resolver.resolve(sampleWorkflow);
    expect(result.levels.get("stage-1")).toBe(0);
    expect(result.levels.get("stage-2")).toBe(1);
    expect(result.levels.get("stage-3")).toBe(1);
    expect(result.levels.get("stage-4")).toBe(2);
  });

  it("should handle empty workflow", () => {
    const result = resolver.resolve({ ...sampleWorkflow, stages: [] });
    expect(result.valid).toBe(true);
    expect(result.order).toEqual([]);
  });

  it("should provide meaningful error messages", () => {
    const wf: WorkflowDefinition = {
      ...sampleWorkflow,
      stages: [
        makeStage({ id: "a", dependencies: ["z"] }),
        makeStage({ id: "b", dependencies: ["a"] }),
      ],
    };
    const result = resolver.resolve(wf);
    expect(result.errors[0].message).toContain("z");
  });
});

// ============================================================================
// Agent Capability Registry Tests
// ============================================================================
describe("AgentCapabilityRegistry", () => {
  let registry: AgentCapabilityRegistry;

  beforeEach(() => {
    registry = new AgentCapabilityRegistry();
  });

  it("should register capabilities", () => {
    registry.registerCapability("agent-1", {
      id: "agent-1",
      name: "Test Agent",
      description: "test",
      version: "1.0.0",
      category: "Document",
      author: "test",
      offlineCapable: true,
      aiEnhanced: false,
      supportedModes: ["deterministic"],
      defaultMode: "deterministic",
    }, []);

    const caps = registry.getCapabilities("agent-1");
    expect(caps).toBeDefined();
    expect(caps!.agentId).toBe("agent-1");
  });

  it("should find by output type", () => {
    registry.registerCapability("agent-1", {
      id: "agent-1", name: "Test", description: "test",
      version: "1.0.0", category: "Document", author: "test",
      offlineCapable: true, aiEnhanced: false,
      supportedModes: ["deterministic"], defaultMode: "deterministic",
    }, [{
      id: "cap-1", name: "generate", description: "generates documents",
      inputTypes: [], outputTypes: ["document"],
    }]);

    const found = registry.findByOutputType("document");
    expect(found.length).toBe(1);
    expect(found[0].agentId).toBe("agent-1");
  });

  it("should update metrics", () => {
    registry.registerCapability("agent-1", {
      id: "agent-1", name: "Test", description: "test",
      version: "1.0.0", category: "Document", author: "test",
      offlineCapable: true, aiEnhanced: false,
      supportedModes: ["deterministic"], defaultMode: "deterministic",
    }, []);

    const ok = registry.updateMetrics("agent-1", { totalExecutions: 5 });
    expect(ok).toBe(true);
    expect(registry.getCapabilities("agent-1")!.metrics.totalExecutions).toBe(5);
  });

  it("should update health", () => {
    registry.registerCapability("agent-1", {
      id: "agent-1", name: "Test", description: "test",
      version: "1.0.0", category: "Document", author: "test",
      offlineCapable: true, aiEnhanced: false,
      supportedModes: ["deterministic"], defaultMode: "deterministic",
    }, []);

    registry.updateHealth("agent-1", false, "Agent crashed");
    const caps = registry.getCapabilities("agent-1");
    expect(caps!.health.healthy).toBe(false);
    expect(caps!.health.error).toBe("Agent crashed");
  });

  it("should remove capabilities", () => {
    registry.registerCapability("agent-1", {
      id: "agent-1", name: "Test", description: "test",
      version: "1.0.0", category: "Document", author: "test",
      offlineCapable: true, aiEnhanced: false,
      supportedModes: ["deterministic"], defaultMode: "deterministic",
    }, []);
    expect(registry.remove("agent-1")).toBe(true);
    expect(registry.getCapabilities("agent-1")).toBeUndefined();
  });

  it("should clear all", () => {
    registry.registerCapability("agent-1", {
      id: "agent-1", name: "Test", description: "test",
      version: "1.0.0", category: "Document", author: "test",
      offlineCapable: true, aiEnhanced: false,
      supportedModes: ["deterministic"], defaultMode: "deterministic",
    }, []);
    registry.clear();
    expect(registry.list().length).toBe(0);
  });
});

// ============================================================================
// Execution Queue Tests
// ============================================================================
describe("ExecutionQueue", () => {
  let queue: ExecutionQueue;

  beforeEach(() => {
    queue = new ExecutionQueue();
  });

  it("should enqueue and dequeue items", () => {
    queue.enqueue({
      executionId: "exec-1", priority: "normal", timestamp: new Date().toISOString(), data: {},
    });
    expect(queue.getPendingCount()).toBe(1);
    const item = queue.dequeue();
    expect(item).toBeDefined();
    expect(item!.executionId).toBe("exec-1");
  });

  it("should respect priority ordering", () => {
    queue.enqueue({
      executionId: "low", priority: "low", timestamp: "2024-01-01T00:00:00Z", data: {},
    });
    queue.enqueue({
      executionId: "critical", priority: "critical", timestamp: "2024-01-01T00:00:01Z", data: {},
    });
    queue.enqueue({
      executionId: "high", priority: "high", timestamp: "2024-01-01T00:00:02Z", data: {},
    });

    expect(queue.dequeue()!.executionId).toBe("critical");
    expect(queue.dequeue()!.executionId).toBe("high");
    expect(queue.dequeue()!.executionId).toBe("low");
  });

  it("should reprioritize items", () => {
    queue.enqueue({
      executionId: "exec-1", priority: "low", timestamp: new Date().toISOString(), data: {},
    });
    expect(queue.reprioritize("exec-1", "critical")).toBe(true);
    expect(queue.dequeue()!.priority).toBe("critical");
  });

  it("should remove items", () => {
    queue.enqueue({
      executionId: "exec-1", priority: "normal", timestamp: new Date().toISOString(), data: {},
    });
    expect(queue.remove("exec-1")).toBe(true);
    expect(queue.getPendingCount()).toBe(0);
  });

  it("should track running items", () => {
    queue.enqueue({
      executionId: "exec-1", priority: "normal", timestamp: new Date().toISOString(), data: {},
    });
    const item = queue.dequeue();
    expect(queue.isRunning("exec-1")).toBe(true);
    queue.markCompleted("exec-1");
    expect(queue.isRunning("exec-1")).toBe(false);
  });

  it("should clear all items", () => {
    queue.enqueue({
      executionId: "exec-1", priority: "normal", timestamp: new Date().toISOString(), data: {},
    });
    queue.clear();
    expect(queue.getPendingCount()).toBe(0);
  });
});

// ============================================================================
// Retry Manager Tests
// ============================================================================
describe("RetryManager", () => {
  let retryManager: RetryManager;

  beforeEach(() => {
    retryManager = new RetryManager();
  });

  it("should not retry without config", () => {
    const result = retryManager.shouldRetry(new Error("fail"), "exec-1", undefined);
    expect(result.retry).toBe(false);
  });

  it("should retry with exponential backoff", () => {
    const config = { maxRetries: 3, initialDelayMs: 100, backoffMultiplier: 2 };
    const r1 = retryManager.shouldRetry(new Error("fail"), "exec-1", config);
    expect(r1.retry).toBe(true);
    expect(r1.delayMs).toBe(100);

    const r2 = retryManager.shouldRetry(new Error("fail"), "exec-1", config);
    expect(r2.retry).toBe(true);
    expect(r2.delayMs).toBe(200);

    const r3 = retryManager.shouldRetry(new Error("fail"), "exec-1", config);
    expect(r3.retry).toBe(true);
    expect(r3.delayMs).toBe(400);

    const r4 = retryManager.shouldRetry(new Error("fail"), "exec-1", config);
    expect(r4.retry).toBe(false);
    expect(r4.delayMs).toBe(0);
  });

  it("should respect maxDelayMs", () => {
    const config = { maxRetries: 5, initialDelayMs: 1000, backoffMultiplier: 4, maxDelayMs: 5000 };
    const r = retryManager.shouldRetry(new Error("fail"), "exec-1", config);
    expect(r.delayMs).toBeLessThanOrEqual(5000);
  });

  it("should filter by retryOnErrors", () => {
    const config = { maxRetries: 3, initialDelayMs: 100, backoffMultiplier: 2, retryOnErrors: ["timeout"] };
    const r1 = retryManager.shouldRetry(new Error("timeout error"), "exec-1", config);
    expect(r1.retry).toBe(true);

    const r2 = retryManager.shouldRetry(new Error("permission denied"), "exec-1", config);
    expect(r2.retry).toBe(false);
  });

  it("should apply jitter", () => {
    const config = { maxRetries: 3, initialDelayMs: 1000, backoffMultiplier: 2, jitter: { enabled: true, min: 0, max: 50 } };
    const r = retryManager.shouldRetry(new Error("fail"), "exec-1", config);
    expect(r.delayMs).toBeGreaterThanOrEqual(1000);
  });

  it("should reset retry state", () => {
    const config = { maxRetries: 3, initialDelayMs: 100, backoffMultiplier: 2 };
    retryManager.shouldRetry(new Error("fail"), "exec-1", config);
    retryManager.resetRetryState("exec-1");
    const r = retryManager.shouldRetry(new Error("fail"), "exec-1", config);
    expect(r.retry).toBe(true);
  });
});

// ============================================================================
// Checkpoint Manager Tests
// ============================================================================
describe("CheckpointManager", () => {
  let checkpointManager: CheckpointManager;

  beforeEach(() => {
    checkpointManager = new CheckpointManager();
  });

  it("should create and restore checkpoints", async () => {
    const state = {
      executionId: "exec-1",
      state: "running" as const,
      currentStage: "stage-1",
      completedStages: ["init"],
      failedStages: [],
      artifacts: {},
      metrics: { startTime: new Date().toISOString() },
      timestamps: { startedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() },
      log: [],
    };

    await checkpointManager.createCheckpoint({
      executionId: "exec-1",
      stageId: "stage-1",
      state,
    });

    const restored = await checkpointManager.restoreCheckpoint("exec-1");
    expect(restored).toBeDefined();
    expect(restored!.executionId).toBe("exec-1");
    expect(restored!.stageId).toBe("stage-1");
    expect(restored!.state.state).toBe("running");
  });

  it("should return undefined for missing execution", async () => {
    const restored = await checkpointManager.restoreCheckpoint("nonexistent");
    expect(restored).toBeUndefined();
  });

  it("should list checkpoints", async () => {
    const state = {
      executionId: "exec-1",
      state: "running" as const,
      completedStages: [],
      failedStages: [],
      artifacts: {},
      metrics: { startTime: new Date().toISOString() },
      timestamps: { startedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() },
      log: [],
    };

    await checkpointManager.createCheckpoint({ executionId: "exec-1", stageId: "s1", state });
    await checkpointManager.createCheckpoint({ executionId: "exec-1", stageId: "s2", state });

    const list = await checkpointManager.listCheckpoints("exec-1");
    expect(list.length).toBe(2);
  });

  it("should remove checkpoints", async () => {
    const state = {
      executionId: "exec-1",
      state: "running" as const,
      completedStages: [],
      failedStages: [],
      artifacts: {},
      metrics: { startTime: new Date().toISOString() },
      timestamps: { startedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() },
      log: [],
    };

    await checkpointManager.createCheckpoint({ executionId: "exec-1", stageId: "s1", state });
    expect(await checkpointManager.removeCheckpoints("exec-1")).toBe(true);
    expect(await checkpointManager.listCheckpoints("exec-1")).toEqual([]);
  });
});

// ============================================================================
// Approval Gate Manager Tests
// ============================================================================
describe("ApprovalGateManager", () => {
  let manager: ApprovalGateManager;

  beforeEach(() => {
    manager = new ApprovalGateManager();
  });

  it("should create approval requests", () => {
    const artifact = manager.createApprovalRequest({
      approvalId: "gate-1",
      stageId: "stage-1",
      agentId: "agent-1",
      request: { data: "test" },
      approver: "user-1",
      decisionRequired: true,
    });

    expect(artifact.metadata.type).toBe("approval");
    expect(artifact.metadata.status).toBe("pending");
  });

  it("should approve", () => {
    manager.createApprovalRequest({
      approvalId: "gate-1", stageId: "s1", agentId: "a1",
      request: {}, approver: "user-1", decisionRequired: true,
    });
    const result = manager.approve("gate-1", "user-1", "Looks good");
    expect(result.success).toBe(true);
    expect(result.state.status).toBe("approved");
  });

  it("should reject", () => {
    manager.createApprovalRequest({
      approvalId: "gate-1", stageId: "s1", agentId: "a1",
      request: {}, approver: "user-1", decisionRequired: true,
    });
    const result = manager.reject("gate-1", "user-1", "Needs work");
    expect(result.success).toBe(true);
    expect(result.state.status).toBe("rejected");
  });

  it("should handle revision requests", () => {
    manager.createApprovalRequest({
      approvalId: "gate-1", stageId: "s1", agentId: "a1",
      request: {}, approver: "user-1", decisionRequired: true,
    });
    const result = manager.requestRevision("gate-1", "user-1", "Revise methodology");
    expect(result.success).toBe(true);
  });

  it("should escalate", () => {
    manager.createApprovalRequest({
      approvalId: "gate-1", stageId: "s1", agentId: "a1",
      request: {}, approver: "user-1", decisionRequired: true,
    });
    const result = manager.escalate("gate-1", "senior-user");
    expect(result.success).toBe(true);
    expect(result.state!.pendingApprovers).toContain("senior-user");
  });

  it("should record approval history", () => {
    manager.createApprovalRequest({
      approvalId: "gate-1", stageId: "s1", agentId: "a1",
      request: {}, approver: "user-1", decisionRequired: true,
    });
    manager.approve("gate-1", "user-1", "OK");
    const history = manager.getApprovalHistory("gate-1");
    expect(history.length).toBe(1);
    expect(history[0].decision).toBe("approved");
  });

  it("should not allow duplicate decisions", () => {
    manager.createApprovalRequest({
      approvalId: "gate-1", stageId: "s1", agentId: "a1",
      request: {}, approver: "user-1", decisionRequired: true,
    });
    manager.approve("gate-1", "user-1", "OK");
    const result = manager.approve("gate-1", "user-1", "Again");
    expect(result.success).toBe(false);
  });

  it("should list pending gates", () => {
    manager.createApprovalRequest({
      approvalId: "gate-1", stageId: "s1", agentId: "a1",
      request: {}, approver: "user-1", decisionRequired: true,
    });
    manager.createApprovalRequest({
      approvalId: "gate-2", stageId: "s2", agentId: "a2",
      request: {}, approver: "user-2", decisionRequired: true,
    });
    manager.approve("gate-1", "user-1", "OK");
    const pending = manager.listPendingGates();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe("gate-2");
  });

  it("should handle timeouts", () => {
    vi.useFakeTimers();
    manager.createApprovalRequest({
      approvalId: "gate-1", stageId: "s1", agentId: "a1",
      request: {}, approver: "user-1", decisionRequired: true,
    });
    const onTimeout = vi.fn();
    manager.setupTimeout("gate-1", 1000, onTimeout);
    vi.advanceTimersByTime(1000);
    expect(onTimeout).toHaveBeenCalledWith("gate-1");
    vi.useRealTimers();
  });
});

// ============================================================================
// Artifact Router Tests
// ============================================================================
describe("ArtifactRouter", () => {
  let router: ArtifactRouter;

  beforeEach(() => {
    router = new ArtifactRouter();
  });

  it("should route artifacts through enrichment", () => {
    const artifact = {
      metadata: {
        id: "art-1", type: "document" as const, version: "1.0.0", status: "completed" as const,
        createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
        originatingAgent: "agent-1",
      },
      data: { content: "test" },
      provenance: {},
      auditTrail: [],
    } as unknown as AnyArtifact;

    const results = router.routeArtifacts([artifact]);
    expect(results.length).toBe(1);
    expect(results[0].auditTrail.length).toBeGreaterThan(0);
    expect(results[0].auditTrail[0].action).toBe("routed");
  });

  it("should validate artifacts", () => {
    const invalid = {
      metadata: {
        id: "", type: "document" as const, version: "", status: "completed" as const,
        createdAt: "", modifiedAt: "", originatingAgent: "",
      },
      data: {},
    } as unknown as AnyArtifact;

    const results = router.routeArtifacts([invalid]);
    expect(results[0].metadata.type).toBe("error");
  });

  it("should register and use routes", () => {
    router.registerRoute("document", ["manuscript"]);
    const artifact = {
      metadata: {
        id: "art-1", type: "document" as const, version: "1.0.0", status: "completed" as const,
        createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
        originatingAgent: "agent-1",
      },
      data: { content: "test" },
      provenance: {},
      auditTrail: [],
    } as unknown as AnyArtifact;

    const results = router.routeArtifacts([artifact], { consumerAgentId: "consumer-1" });
    expect(results[0].metadata.type).not.toBe("error");
  });

  it("should return registered routes", () => {
    router.registerRoute("document", ["manuscript", "publication"]);
    const routes = router.getRoutes();
    expect(routes.has("document")).toBe(true);
    expect(routes.get("document")).toEqual(["manuscript", "publication"]);
  });
});

// ============================================================================
// Execution Audit Service Tests
// ============================================================================
describe("ExecutionAuditService", () => {
  let audit: ExecutionAuditService;

  beforeEach(() => {
    audit = new ExecutionAuditService({ enabled: true });
  });

  it("should create immutable audit records", async () => {
    const artifact = {
      metadata: {
        id: "art-1", type: "document" as const, version: "1.0.0", status: "completed" as const,
        createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
        originatingAgent: "agent-1",
      },
      data: { content: "test" },
      provenance: { executionId: "exec-1" },
      auditTrail: [],
    } as unknown as AnyArtifact;

    const result = await audit.auditArtifact(artifact, {
      executionId: "exec-1", workflowId: "wf-1", userId: "user-1", action: "test",
    });

    expect(result.auditTrail.length).toBe(1);
    expect(result.auditTrail[0].action).toBe("audit:test");
  });

  it("should chain audit records with hashes", () => {
    const r1 = {
      recordId: "r1", executionId: "exec-1", workflowId: "wf-1", userId: "u1",
      agentId: "a1", action: "start", timestamp: new Date().toISOString(),
      recordHash: "",
    };
    audit.appendRecord(r1);

    const records = audit.getRecords();
    expect(records.length).toBe(1);
    expect(records[0].recordHash).toBeTruthy();
  });

  it("should verify audit chain integrity", () => {
    audit.appendRecord({
      recordId: "r1", executionId: "exec-1", workflowId: "wf-1", userId: "u1",
      agentId: "a1", action: "start", timestamp: new Date().toISOString(),
      recordHash: "",
    });
    audit.appendRecord({
      recordId: "r2", executionId: "exec-1", workflowId: "wf-1", userId: "u1",
      agentId: "a1", action: "complete", timestamp: new Date().toISOString(),
      recordHash: "",
    });

    const result = audit.verifyChain();
    expect(result.valid).toBe(true);
  });

  it("should return empty when disabled", async () => {
    const disabled = new ExecutionAuditService({ enabled: false });
    const artifact = {
      metadata: {
        id: "art-1", type: "document" as const, version: "1.0.0", status: "completed" as const,
        createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
        originatingAgent: "agent-1",
      },
      data: {},
      provenance: {},
      auditTrail: [],
    } as unknown as AnyArtifact;
    const result = await disabled.auditArtifact(artifact);
    expect(result.auditTrail.length).toBe(0);
  });
});

// ============================================================================
// Execution History Service Tests
// ============================================================================
describe("ExecutionHistoryService", () => {
  let history: ExecutionHistoryService;

  beforeEach(() => {
    history = new ExecutionHistoryService();
  });

  it("should store and retrieve records", async () => {
    const record = {
      executionId: "exec-1", workflowId: "wf-1", userId: "user-1",
      state: "queued" as const, priority: "normal" as const,
      startTime: new Date().toISOString(), completedStages: [], failedStages: [], artifacts: [],
      config: {},
    };
    await history.appendRecord(record);
    const retrieved = await history.getRecord("exec-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.executionId).toBe("exec-1");
  });

  it("should filter by workflow", async () => {
    const r1 = {
      executionId: "e1", workflowId: "wf-1", userId: "u1",
      state: "completed" as const, priority: "normal" as const,
      startTime: "", completedStages: [], failedStages: [], artifacts: [], config: {},
    };
    const r2 = {
      executionId: "e2", workflowId: "wf-2", userId: "u1",
      state: "completed" as const, priority: "normal" as const,
      startTime: "", completedStages: [], failedStages: [], artifacts: [], config: {},
    };
    await history.appendRecord(r1);
    await history.appendRecord(r2);
    const wf1 = await history.getRecordsByWorkflow("wf-1");
    expect(wf1.length).toBe(1);
    expect(wf1[0].executionId).toBe("e1");
  });
});

// ============================================================================
// Metrics Collector Tests
// ============================================================================
describe("MetricsCollector", () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  it("should record workflow metrics", async () => {
    await metrics.recordWorkflowMetric({
      workflowId: "wf-1",
      stages: {},
      artifacts: { total: 0, averageSize: 0 },
    });
    const result = metrics.getWorkflowMetrics("wf-1");
    expect(result).toBeDefined();
  });

  it("should record stage metrics", async () => {
    await metrics.recordStageMetric({
      workflowId: "wf-1", stageId: "s1", durationMs: 100, success: true,
    });
    await metrics.recordStageMetric({
      workflowId: "wf-1", stageId: "s1", durationMs: 200, success: true,
    });
    const result = metrics.getWorkflowMetrics("wf-1") as any;
    expect(result.stages["s1"].total).toBe(2);
    expect(result.stages["s1"].averageTimeMs).toBe(150);
  });

  it("should record agent utilization", () => {
    metrics.recordAgentUtilization("agent-1", 1000);
    const rates = metrics.getAgentUtilizationRates();
    expect(typeof rates["agent-1"]).toBe("number");
  });

  it("should take snapshots", () => {
    const snap = metrics.takeSnapshot({
      workflows: new Map([["wf-1", "running" as const]]),
      queueLength: 3,
      agentIds: [],
    });
    expect(snap.runningWorkflows).toBe(1);
    expect(snap.queueLength).toBe(3);
  });

  it("should compute performance metrics", () => {
    const perf = metrics.getPerformanceMetrics();
    expect(perf.timing).toBeDefined();
    expect(perf.throughput).toBeDefined();
  });
});

// ============================================================================
// Health Monitor Tests
// ============================================================================
describe("HealthMonitor", () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    monitor = new HealthMonitor();
  });

  it("should return healthy when no checks registered", async () => {
    const result = await monitor.checkHealth();
    expect(result.healthy).toBe(true);
  });

  it("should register and run checks", async () => {
    monitor.registerCheck({
      name: "test-check",
      check: async () => ({ healthy: true }),
      intervalMs: 10000,
      timeoutMs: 1000,
    });

    await new Promise((r) => setTimeout(r, 50));
    const result = await monitor.checkHealth();
    expect(result.healthy).toBe(true);
    expect(result.checks.length).toBe(1);
  });

  it("should detect unhealthy checks", async () => {
    monitor.registerCheck({
      name: "failing-check",
      check: async () => ({ healthy: false, error: "Something failed" }),
      intervalMs: 10000,
      timeoutMs: 1000,
    });

    await new Promise((r) => setTimeout(r, 50));
    const result = await monitor.checkHealth();
    expect(result.healthy).toBe(false);
  });

  it("should provide system health metrics", () => {
    const metrics = monitor.getSystemHealthMetrics(
      { total: 5, healthy: 4, unhealthy: 1 },
      { total: 10, running: 3, failed: 1, completed: 6 },
      { cpu: 45, memory: 60, disk: 30 },
      { pending: 2, running: 3, failed: 1 }
    );
    expect(metrics.status).toBe("degraded");
    expect(metrics.agents.total).toBe(5);
  });
});

// ============================================================================
// Notification Manager Tests
// ============================================================================
describe("NotificationManager", () => {
  let notifications: NotificationManager;

  beforeEach(() => {
    notifications = new NotificationManager();
  });

  it("should send notifications", async () => {
    const n = await notifications.workflowStarted({
      workflowId: "wf-1", executionId: "exec-1", userId: "user-1",
    });
    expect(n.title).toBe("Workflow Started");
    expect(n.recipients).toContain("user-1");
  });

  it("should notify on completion", async () => {
    const n = await notifications.workflowCompleted({
      workflowId: "wf-1", executionId: "exec-1", userId: "user-1", durationMs: 1000,
    });
    expect(n.title).toBe("Workflow Completed");
  });

  it("should notify on failure", async () => {
    const n = await notifications.workflowFailed({
      workflowId: "wf-1", executionId: "exec-1", userId: "user-1", error: "Something broke",
    });
    expect(n.priority).toBe("high");
  });

  it("should notify on approval needed", async () => {
    const n = await notifications.approvalNeeded({
      workflowId: "wf-1", executionId: "exec-1", stageId: "s1", gateId: "g1", approver: "user-1",
    });
    expect(n.title).toBe("Approval Required");
  });

  it("should handle event subscriptions", async () => {
    const handler = vi.fn();
    notifications.on("workflow_completed", handler);

    await notifications.workflowCompleted({
      workflowId: "wf-1", executionId: "exec-1", userId: "user-1",
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should maintain history", async () => {
    await notifications.workflowStarted({
      workflowId: "wf-1", executionId: "exec-1", userId: "user-1",
    });
    await notifications.workflowCompleted({
      workflowId: "wf-1", executionId: "exec-1", userId: "user-1",
    });
    expect(notifications.getHistory().length).toBe(2);
  });
});

// ============================================================================
// Failure Recovery Manager Tests
// ============================================================================
describe("FailureRecoveryManager", () => {
  let retryManager: RetryManager;
  let checkpointManager: CheckpointManager;
  let recovery: FailureRecoveryManager;

  beforeEach(() => {
    retryManager = new RetryManager();
    checkpointManager = new CheckpointManager();
    recovery = new FailureRecoveryManager(retryManager, checkpointManager);
  });

  it("should retry on failure", async () => {
    const result = await recovery.recover({
      executionId: "exec-1",
      stageId: "s1",
      error: new Error("transient failure"),
    });
    expect(result.recovered).toBe(true);
    expect(result.action).toBe("retry");
  });

  it("should dead-letter after max retries", async () => {
    const config = { maxRetries: 0, initialDelayMs: 10, backoffMultiplier: 2 };

    const result = await recovery.recover({
      executionId: "exec-1",
      stageId: "s1",
      error: new Error("persistent failure"),
      retryConfig: config,
    });
    expect(result.action).toBe("dead_letter");
    expect(result.recovered).toBe(false);
  });

  it("should rollback to checkpoint when available", async () => {
    const state = {
      executionId: "exec-1",
      state: "running" as const,
      completedStages: ["s1"],
      failedStages: [],
      artifacts: {},
      metrics: { startTime: new Date().toISOString() },
      timestamps: { startedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() },
      log: [],
    };

    await checkpointManager.createCheckpoint({
      executionId: "exec-1", stageId: "s1", state,
    });

    const result = await recovery.recover({
      executionId: "exec-1", stageId: "s1",
      error: new Error("needs rollback"),
      state,
      retryConfig: { maxRetries: 0, initialDelayMs: 10, backoffMultiplier: 2 },
    });
    expect(result.action).toBe("rollback");
  });

  it("should register and execute compensation actions", async () => {
    let compensated = false;
    recovery.registerCompensationAction("s1", async () => { compensated = true; });

    await recovery.compensate("exec-1", "s1");
    expect(compensated).toBe(true);
  });

  it("should produce recovery reports", async () => {
    await recovery.recover({
      executionId: "exec-1", stageId: "s1", error: new Error("fail"),
    });
    const reports = recovery.getRecoveryReports("exec-1");
    expect(reports.length).toBe(1);
    expect(reports[0].recoveryAction).toBe("retry");
  });

  it("should manage dead letter queue", async () => {
    await recovery.recover({
      executionId: "exec-1", stageId: "s1", error: new Error("fail"),
      retryConfig: { maxRetries: 0, initialDelayMs: 10, backoffMultiplier: 2 },
    });
    expect(recovery.getDeadLetterQueue().length).toBe(1);
  });

  it("should retry from dead letter queue", async () => {
    await recovery.recover({
      executionId: "exec-1", stageId: "s1", error: new Error("fail"),
      retryConfig: { maxRetries: 0, initialDelayMs: 10, backoffMultiplier: 2 },
    });
    expect(recovery.retryDeadLetter("exec-1")).toBe(true);
    expect(recovery.getDeadLetterQueue().length).toBe(0);
  });
});

// ============================================================================
// Workflow Engine Tests
// ============================================================================
describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  it("should evaluate valid workflows", async () => {
    const result = await engine.evaluate(sampleWorkflow, { userId: "user-1" });
    expect(result.valid).toBe(true);
    expect(result.state.state).toBe("pending");
    expect(result.plan.stages.length).toBe(4);
  });

  it("should reject invalid workflows", async () => {
    const bad: WorkflowDefinition = {
      ...sampleWorkflow,
      stages: [
        { ...makeStage({ id: "a" }), dependencies: ["nonexistent"] },
      ],
    };
    const result = await engine.evaluate(bad, { userId: "user-1" });
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("should validate workflows", () => {
    const validation = engine.validateWorkflow(sampleWorkflow);
    expect(validation.valid).toBe(true);

    const bad: WorkflowDefinition = {
      ...sampleWorkflow,
      stages: [
        { ...makeStage({ id: "a" }), dependencies: ["missing"] },
      ],
    };
    const badResult = engine.validateWorkflow(bad);
    expect(badResult.valid).toBe(false);
  });

  it("should expose dependency resolver", () => {
    expect(engine.getDependencyResolver()).toBeDefined();
  });

  it("should expose scheduler", () => {
    expect(engine.getScheduler()).toBeDefined();
  });
});

// ============================================================================
// Execution Scheduler Tests
// ============================================================================
describe("ExecutionScheduler", () => {
  let scheduler: ExecutionScheduler;

  beforeEach(() => {
    scheduler = new ExecutionScheduler(new DependencyResolver());
  });

  it("should create schedule plan", async () => {
    const plan = await scheduler.schedule(sampleWorkflow);
    expect(plan.stages.length).toBe(4);
    expect(plan.parallelGroups.length).toBe(3);
    expect(plan.parallelGroups[0]).toEqual(["stage-1"]);
    expect(plan.parallelGroups[1]).toEqual(["stage-2", "stage-3"]);
    expect(plan.parallelGroups[2]).toEqual(["stage-4"]);
  });

  it("should get next stage", async () => {
    const plan = await scheduler.schedule(sampleWorkflow);
    const state = {
      executionId: "exec-1",
      state: "running" as const,
      completedStages: ["stage-1"],
      failedStages: [],
      artifacts: {},
      metrics: { startTime: new Date().toISOString() },
      timestamps: { startedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() },
      log: [],
    };
    const next = scheduler.getNextStage(plan, state);
    expect(next).toMatch(/^stage-[234]$/);
  });

  it("should detect errors in invalid workflows", () => {
    const bad: WorkflowDefinition = {
      ...sampleWorkflow,
      stages: [
        { ...makeStage({ id: "a" }), dependencies: ["missing"] },
      ],
    };
    const errors = scheduler.hasErrors(bad);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Workflow Visualizer Model Tests
// ============================================================================
describe("WorkflowVisualizerModel", () => {
  let visualizer: WorkflowVisualizerModel;

  beforeEach(() => {
    visualizer = new WorkflowVisualizerModel();
  });

  it("should build visualization from workflow definition", () => {
    const model = visualizer.build({
      workflowId: "wf-1",
      definition: sampleWorkflow,
    });
    expect(model.nodes.length).toBe(4);
    expect(model.edges.length).toBe(4);
    expect(model.metadata.title).toBe("Test Workflow");
  });

  it("should return empty model without definition", () => {
    const model = visualizer.build({ workflowId: "wf-1" });
    expect(model.nodes.length).toBe(0);
    expect(model.edges.length).toBe(0);
  });

  it("should reflect execution state in nodes", () => {
    const model = visualizer.build({
      workflowId: "wf-1",
      definition: sampleWorkflow,
      snapshot: {
        executionId: "exec-1",
        state: "running" as const,
        currentStage: "stage-2",
        completedStages: ["stage-1"],
        failedStages: [],
        artifacts: {},
        metrics: { startTime: new Date().toISOString() },
        timestamps: { startedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() },
        log: [],
      },
    });

    const s1 = model.nodes.find((n) => n.id === "stage-1");
    expect(s1!.data.status).toBe("completed");

    const s2 = model.nodes.find((n) => n.id === "stage-2");
    expect(s2!.data.status).toBe("running");
  });
});

// ============================================================================
// Workflow Definition Builder Tests
// ============================================================================
describe("WorkflowDefinitionBuilder", () => {
  it("should build a valid workflow", () => {
    const wf = new WorkflowDefinitionBuilder("my-wf", "My Workflow", "Test")
      .setVersion("1.0.0")
      .setExecutionMode("sequential")
      .addStage(makeStage({ id: "s1" }))
      .addStage(makeStage({ id: "s2", dependencies: ["s1"] }))
      .build();

    expect(wf.id).toBe("my-wf");
    expect(wf.stages.length).toBe(2);
    expect(wf.version).toBe("1.0.0");
  });

  it("should throw on empty stages", () => {
    expect(() => new WorkflowDefinitionBuilder("empty").build()).toThrow("at least one stage");
  });

  it("should auto-generate missing fields", () => {
    const wf = new WorkflowDefinitionBuilder()
      .addStage(makeStage({ id: "s1" }))
      .build();
    expect(wf.id).toBeTruthy();
    expect(wf.name).toBeTruthy();
    expect(wf.version).toBe("1.0.0");
    expect(wf.executionMode).toBe("sequential");
  });
});

// ============================================================================
// Workflow Definition Manager Tests
// ============================================================================
describe("WorkflowDefinitionManager", () => {
  let manager: WorkflowDefinitionManager;

  beforeEach(() => {
    manager = new WorkflowDefinitionManager();
  });

  it("should register and retrieve workflows", () => {
    const wf = new WorkflowDefinitionBuilder("test-wf")
      .addStage(makeStage({ id: "s1" }))
      .build();
    manager.register(wf);
    expect(manager.get("test-wf")).toBeDefined();
  });

  it("should serialize and deserialize", () => {
    const wf = new WorkflowDefinitionBuilder("test-wf")
      .addStage(makeStage({ id: "s1" }))
      .build();
    const json = manager.serialize(wf);
    const parsed = manager.deserialize(json);
    expect(parsed.id).toBe("test-wf");
    expect(parsed.stages.length).toBe(1);
  });

  it("should create default research workflow", () => {
    const wf = manager.createDefaultResearchWorkflow();
    expect(wf.stages.length).toBe(10);
    expect(wf.tags).toContain("research");
  });

  it("should clone workflows", () => {
    const original = manager.createDefaultResearchWorkflow();
    const clone = manager.clone(original, "cloned-wf");
    expect(clone!.id).toBe("cloned-wf");
    expect(clone!.stages.length).toBe(original.stages.length);
    expect(clone!.version).not.toBe(original.version);
  });
});

// ============================================================================
// Workflow Registry Tests
// ============================================================================
import { WorkflowRegistry } from "../WorkflowRegistry";

describe("WorkflowRegistry", () => {
  let registry: WorkflowRegistry;

  beforeEach(() => {
    registry = WorkflowRegistry.getInstance();
    registry.clear();
  });

  it("should register workflow definitions", () => {
    const wf = new WorkflowDefinitionBuilder("wf-1")
      .setName("Test WF")
      .addStage(makeStage({ id: "s1" }))
      .build();
    const result = registry.register(wf);
    expect(result.success).toBe(true);
    expect(registry.get("wf-1")).toBeDefined();
  });

  it("should reject duplicate registrations", () => {
    const wf = new WorkflowDefinitionBuilder("wf-1")
      .addStage(makeStage({ id: "s1" }))
      .build();
    registry.register(wf);
    const result = registry.register(wf);
    expect(result.success).toBe(false);
  });

  it("should unregister workflows", () => {
    const wf = new WorkflowDefinitionBuilder("wf-1")
      .addStage(makeStage({ id: "s1" }))
      .build();
    registry.register(wf);
    expect(registry.unregister("wf-1")).toBe(true);
    expect(registry.get("wf-1")).toBeUndefined();
  });

  it("should find by tags", () => {
    const wf = new WorkflowDefinitionBuilder("wf-1")
      .setTags(["test", "research"])
      .addStage(makeStage({ id: "s1" }))
      .build();
    registry.register(wf);
    const found = registry.findByTags(["test"]);
    expect(found.length).toBe(1);
  });

  it("should support events", () => {
    const handler = vi.fn();
    registry.on("workflow.registered", handler);
    const wf = new WorkflowDefinitionBuilder("wf-1")
      .addStage(makeStage({ id: "s1" }))
      .build();
    registry.register(wf);
    expect(handler).toHaveBeenCalled();
  });

  it("should serialize workflows", () => {
    const wf = new WorkflowDefinitionBuilder("wf-1")
      .addStage(makeStage({ id: "s1" }))
      .build();
    registry.register(wf);
    const json = registry.serialize("wf-1");
    expect(json).toBeDefined();
    expect(json).toContain("wf-1");
  });

  it("should deserialize workflows", () => {
    const wf = new WorkflowDefinitionBuilder("wf-1")
      .addStage(makeStage({ id: "s1" }))
      .build();
    registry.register(wf);
    const json = registry.serialize("wf-1")!;
    const deserialized = registry.deserialize(json);
    expect(deserialized).toBeDefined();
  });
});

// ============================================================================
// MultiAgentOrchestrator Integration Tests
// ============================================================================
import { MultiAgentOrchestrator } from "../MultiAgentOrchestrator";

describe("MultiAgentOrchestrator", () => {
  let orchestrator: MultiAgentOrchestrator;

  beforeEach(() => {
    orchestrator = new MultiAgentOrchestrator({
      enableAudit: true,
      enableMetrics: true,
      enableNotifications: false,
    });
  });

  it("should create queued execution state", async () => {
    const wf = new WorkflowDefinitionBuilder("test-orch-wf")
      .addStage(makeStage({ id: "s1" }))
      .build();

    const workflowRegistry = orchestrator.getWorkflowRegistry();
    workflowRegistry.register(wf);

    const state = await orchestrator.createAndExecuteWorkflow({
      workflowId: "test-orch-wf",
      userId: "user-1",
      priority: "normal",
    });

    expect(state).toBeDefined();
    expect(state.state).toBe("pending");
    expect(state.executionId).toBeTruthy();
  });

  it("should throw for missing workflow", async () => {
    await expect(
      orchestrator.createAndExecuteWorkflow({
        workflowId: "nonexistent",
        userId: "user-1",
      })
    ).rejects.toThrow("Workflow not found");
  });

  it("should expose registries", () => {
    expect(orchestrator.getAgentRegistry()).toBeDefined();
    expect(orchestrator.getAgentCapabilityRegistry()).toBeDefined();
    expect(orchestrator.getWorkflowRegistry()).toBeDefined();
    expect(orchestrator.getCoordinator()).toBeDefined();
  });

  it("should handle pause and cancel", async () => {
    const wf = new WorkflowDefinitionBuilder("test-pause")
      .addStage(makeStage({ id: "s1" }))
      .build();
    orchestrator.getWorkflowRegistry().register(wf);

    const state = await orchestrator.createAndExecuteWorkflow({
      workflowId: "test-pause",
      userId: "user-1",
    });

    const paused = await orchestrator.pauseExecution(state.executionId);
    expect(typeof paused).toBe("boolean");
  });
});

// ============================================================================
// Agent Registry Tests
// ============================================================================
import { AgentRegistry } from "../AgentRegistry";

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = AgentRegistry.getInstance();
    registry.clear();
  });

  it("should register agents", () => {
    const agent = {
      metadata: {
        id: "agent-1", name: "Test Agent", description: "test",
        version: "1.0.0", category: "Document" as const, author: "test",
        offlineCapable: true, aiEnhanced: false,
        supportedModes: ["deterministic"] as ExecutionMode[], defaultMode: "deterministic" as const,
      },
      async execute(input: unknown, _context: any) {
        return { ok: true, data: input };
      },
    };
    const result = registry.register(agent);
    expect(result.success).toBe(true);
  });

  it("should reject duplicate agents", () => {
    const agent = {
      metadata: {
        id: "agent-1", name: "Test Agent", description: "test",
        version: "1.0.0", category: "Document" as const, author: "test",
        offlineCapable: true, aiEnhanced: false,
        supportedModes: ["deterministic"] as ExecutionMode[], defaultMode: "deterministic" as const,
      },
      async execute(input: unknown, _context: any) {
        return { ok: true, data: input };
      },
    };
    registry.register(agent);
    const result = registry.register(agent);
    expect(result.success).toBe(false);
  });
});
