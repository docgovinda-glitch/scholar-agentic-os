/**
 * Telemetry Collector
 * 
 * Collects metrics and telemetry for AI infrastructure operations.
 */

import type { TelemetryEvent, TaskType, ExecutionMode } from '../types';

export class TelemetryCollector {
  private static instance: TelemetryCollector;
  private events: TelemetryEvent[] = [];
  private maxEvents = 10000;

  private constructor() {}

  static getInstance(): TelemetryCollector {
    if (!TelemetryCollector.instance) {
      TelemetryCollector.instance = new TelemetryCollector();
    }
    return TelemetryCollector.instance;
  }

  /**
   * Record a telemetry event
   */
  record(params: {
    provider: string;
    model: string;
    taskType: TaskType;
    executionMode: ExecutionMode;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    success: boolean;
    errorMessage?: string;
    estimatedCost: number;
  }): void {
    const event: TelemetryEvent = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      ...params
    };

    this.events.push(event);
    
    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Get events for a provider
   */
  getByProvider(providerId: string): TelemetryEvent[] {
    return this.events.filter(e => e.provider === providerId);
  }

  /**
   * Get events for a model
   */
  getByModel(providerId: string, modelName: string): TelemetryEvent[] {
    return this.events.filter(e => e.provider === providerId && e.model === modelName);
  }

  /**
   * Get events for a task type
   */
  getByTaskType(taskType: TaskType): TelemetryEvent[] {
    return this.events.filter(e => e.taskType === taskType);
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): {
    totalRequests: number;
    successRate: number;
    averageLatency: number;
    totalCost: number;
    providerUsage: Record<string, { requests: number; cost: number }>;
    taskUsage: Record<string, { requests: number; avgLatency: number }>;
  } {
    const providerUsage: Record<string, { requests: number; cost: number }> = {};
    const taskUsage: Record<string, { requests: number; totalLatency: number }> = {};
    
    for (const event of this.events) {
      // Provider usage
      if (!providerUsage[event.provider]) {
        providerUsage[event.provider] = { requests: 0, cost: 0 };
      }
      providerUsage[event.provider].requests++;
      providerUsage[event.provider].cost += event.estimatedCost;

      // Task usage
      if (!taskUsage[event.taskType]) {
        taskUsage[event.taskType] = { requests: 0, totalLatency: 0 };
      }
      taskUsage[event.taskType].requests++;
      taskUsage[event.taskType].totalLatency += event.latencyMs;
    }

    const successful = this.events.filter(e => e.success).length;
    const totalLatency = this.events.reduce((sum, e) => sum + e.latencyMs, 0);

    return {
      totalRequests: this.events.length,
      successRate: this.events.length > 0 ? successful / this.events.length : 1,
      averageLatency: this.events.length > 0 ? totalLatency / this.events.length : 0,
      totalCost: this.events.reduce((sum, e) => sum + e.estimatedCost, 0),
      providerUsage: Object.entries(providerUsage).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
      taskUsage: Object.entries(taskUsage).reduce((acc, [k, v]) => ({
        ...acc,
        [k]: { requests: v.requests, avgLatency: v.totalLatency / (v.requests || 1) }
      }), {})
    };
  }

  /**
   * Clear telemetry data
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Export telemetry as JSON
   */
  export(): string {
    return JSON.stringify({
      events: this.events,
      metrics: this.getMetrics()
    }, null, 2);
  }
}