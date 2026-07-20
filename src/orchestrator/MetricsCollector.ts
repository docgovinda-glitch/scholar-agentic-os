import type {
  SystemHealthMetrics,
  WorkflowMetrics,
  PerformanceMetrics,
  ExecutionMetrics,
  WorkflowState,
} from "./types";

export interface MetricSnapshot {
  timestamp: string;
  runningWorkflows: number;
  queuedWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  pausedWorkflows: number;
  approvalWaiting: number;
  executionDurationMs: number;
  averageExecutionTimeMs: number;
  queueLength: number;
  throughput: number;
  agentUtilization: Record<string, number>;
  workflowBottlenecks: string[];
  memoryUsage: number;
}

export class MetricsCollector {
  private workflowMetrics: Map<string, WorkflowMetrics> = new Map();
  private executionMetrics: Map<string, ExecutionMetrics> = new Map();
  private snapshots: MetricSnapshot[] = [];
  private agentUtilization: Map<string, { totalTime: number; executionCount: number }> = new Map();
  private stageTimings: Map<string, number[]> = new Map();
  private startTime: number = Date.now();
  private completedCount: number = 0;

  async recordWorkflowMetric(metric: WorkflowMetrics): Promise<void> {
    this.workflowMetrics.set(metric.workflowId, metric);
  }

  async recordStageMetric(metric: { workflowId: string; stageId: string; durationMs: number; success: boolean }): Promise<void> {
    const key = `${metric.workflowId}:${metric.stageId}`;
    const timings = this.stageTimings.get(key) ?? [];
    timings.push(metric.durationMs);
    this.stageTimings.set(key, timings);

    const wm = this.workflowMetrics.get(metric.workflowId) ?? {
      workflowId: metric.workflowId,
      stages: {},
      artifacts: { total: 0, averageSize: 0 },
    };
    const stageData = wm.stages[metric.stageId] ?? {
      total: 0,
      successful: 0,
      failed: 0,
      averageTimeMs: 0,
      lastExecution: "",
    };
    stageData.total++;
    if (metric.success) stageData.successful++;
    else stageData.failed++;
    stageData.averageTimeMs = timings.reduce((a, b) => a + b, 0) / timings.length;
    stageData.lastExecution = new Date().toISOString();
    wm.stages[metric.stageId] = stageData;
    this.workflowMetrics.set(metric.workflowId, wm);
  }

  async recordExecutionMetric(executionId: string, metrics: Partial<ExecutionMetrics>): Promise<void> {
    const existing = this.executionMetrics.get(executionId) ?? {
      startTime: new Date().toISOString(),
    };
    const updated = { ...existing, ...metrics };
    this.executionMetrics.set(executionId, updated);
  }

  recordAgentUtilization(agentId: string, durationMs: number): void {
    const current = this.agentUtilization.get(agentId) ?? { totalTime: 0, executionCount: 0 };
    current.totalTime += durationMs;
    current.executionCount++;
    this.agentUtilization.set(agentId, current);
  }

  getWorkflowMetrics(workflowId?: string): WorkflowMetrics | Map<string, WorkflowMetrics> {
    if (workflowId) {
      return this.workflowMetrics.get(workflowId) ?? {
        workflowId,
        stages: {},
        artifacts: { total: 0, averageSize: 0 },
      };
    }
    return new Map(this.workflowMetrics);
  }

  getExecutionMetrics(executionId: string): ExecutionMetrics | undefined {
    return this.executionMetrics.get(executionId);
  }

  getPerformanceMetrics(): PerformanceMetrics {
    const allTimings: number[] = [];
    for (const timings of this.stageTimings.values()) {
      allTimings.push(...timings);
    }
    const sorted = [...allTimings].sort((a, b) => a - b);
    const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const p95Idx = Math.ceil(sorted.length * 0.95) - 1;
    const p95 = p95Idx >= 0 ? sorted[p95Idx] : 0;
    const elapsed = (Date.now() - this.startTime) / 1000 / 60;
    const wpm = elapsed > 0 ? this.completedCount / elapsed : 0;

    return {
      timing: {
        workflowAverageTimeMs: avg,
        workflow95thPercentileTimeMs: p95,
        stageAverageTimeMs: avg,
      },
      throughput: {
        workflowsPerMinute: wpm,
        artifactsPerMinute: 0,
      },
      errors: {
        errorRate: 0,
        topErrorTypes: [],
      },
    };
  }

  takeSnapshot(state: {
    workflows: Map<string, WorkflowState>;
    queueLength: number;
    agentIds: string[];
  }): MetricSnapshot {
    let running = 0, queued = 0, completed = 0, failed = 0, paused = 0, approval = 0;
    const durations: number[] = [];

    for (const [, workflowState] of state.workflows) {
      switch (workflowState) {
        case "running": running++; break;
        case "pending": queued++; break;
        case "completed": completed++; break;
        case "failed": failed++; break;
        case "paused": paused++; break;
        case "awaiting_approval": approval++; break;
      }
    }

    for (const metrics of this.executionMetrics.values()) {
      if (metrics.durationMs) durations.push(metrics.durationMs);
    }

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const bottlenecks = this.detectBottlenecks();

    const snapshot: MetricSnapshot = {
      timestamp: new Date().toISOString(),
      runningWorkflows: running,
      queuedWorkflows: queued,
      completedWorkflows: completed,
      failedWorkflows: failed,
      pausedWorkflows: paused,
      approvalWaiting: approval,
      executionDurationMs: durations.reduce((a, b) => a + b, 0),
      averageExecutionTimeMs: avgDuration,
      queueLength: state.queueLength,
      throughput: this.completedCount / Math.max(1, (Date.now() - this.startTime) / 1000),
      agentUtilization: this.getAgentUtilizationRates(),
      workflowBottlenecks: bottlenecks,
      memoryUsage: process.memoryUsage?.()?.heapUsed ?? 0,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > 1000) this.snapshots.shift();
    return snapshot;
  }

  getSnapshots(): MetricSnapshot[] {
    return [...this.snapshots];
  }

  getAgentUtilizationRates(): Record<string, number> {
    const rates: Record<string, number> = {};
    const totalTime = Date.now() - this.startTime;
    for (const [agentId, data] of this.agentUtilization) {
      rates[agentId] = totalTime > 0 ? data.totalTime / totalTime : 0;
    }
    return rates;
  }

  incrementCompleted(): void {
    this.completedCount++;
  }

  clear(): void {
    this.workflowMetrics.clear();
    this.executionMetrics.clear();
    this.snapshots = [];
    this.agentUtilization.clear();
    this.stageTimings.clear();
  }

  private detectBottlenecks(): string[] {
    const bottlenecks: string[] = [];
    for (const [key, timings] of this.stageTimings) {
      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      if (avg > 30000) {
        bottlenecks.push(key);
      }
    }
    return bottlenecks;
  }
}
