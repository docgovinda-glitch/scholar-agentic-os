import type { SystemHealthMetrics } from "./types";

export interface HealthCheckResult {
  healthy: boolean;
  checks: Array<{
    name: string;
    healthy: boolean;
    error?: string;
    timestamp: string;
  }>;
  timestamp: string;
}

export interface HealthCheck {
  name: string;
  check: () => Promise<{ healthy: boolean; error?: string }>;
  intervalMs: number;
  timeoutMs: number;
}

export class HealthMonitor {
  private checks: Map<string, HealthCheck> = new Map();
  private results: Map<string, { healthy: boolean; error?: string; lastCheck: string }> = new Map();
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
    this.runCheck(check.name).catch(() => {});

    const interval = setInterval(() => {
      this.runCheck(check.name).catch((err) => {
        this.results.set(check.name, {
          healthy: false,
          error: err instanceof Error ? err.message : String(err),
          lastCheck: new Date().toISOString(),
        });
      });
    }, check.intervalMs);

    this.intervals.set(check.name, interval);
  }

  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.results.delete(name);
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const promises = Array.from(this.checks.keys()).map((name) => this.runCheck(name));
    await Promise.allSettled(promises);

    const checks = Array.from(this.results.entries()).map(([name, result]) => ({
      name,
      healthy: result.healthy,
      error: result.error,
      timestamp: result.lastCheck,
    }));

    const allHealthy = checks.every((c) => c.healthy);

    return {
      healthy: allHealthy,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  getSystemHealthMetrics(
    agentCounts: { total: number; healthy: number; unhealthy: number },
    workflowCounts: { total: number; running: number; failed: number; completed: number },
    resourceUsage: { cpu: number; memory: number; disk: number },
    queueCounts: { pending: number; running: number; failed: number }
  ): SystemHealthMetrics {
    const health = this.getOverallHealth(agentCounts, workflowCounts);
    return {
      status: health,
      timestamp: new Date().toISOString(),
      agents: agentCounts,
      workflows: workflowCounts,
      resources: resourceUsage,
      queues: queueCounts,
    } as SystemHealthMetrics;
  }

  getCheckResult(name: string): { healthy: boolean; error?: string; lastCheck: string } | undefined {
    return this.results.get(name);
  }

  clear(): void {
    for (const interval of this.intervals.values()) clearInterval(interval);
    this.intervals.clear();
    this.checks.clear();
    this.results.clear();
  }

  private async runCheck(name: string): Promise<void> {
    const check = this.checks.get(name);
    if (!check) return;

    const timeoutPromise = new Promise<{ healthy: boolean; error?: string }>((_, reject) =>
      setTimeout(() => reject(new Error(`Health check "${name}" timed out after ${check.timeoutMs}ms`)), check.timeoutMs)
    );

    try {
      const result = await Promise.race([check.check(), timeoutPromise]);
      this.results.set(name, { ...result, lastCheck: new Date().toISOString() });
    } catch (error) {
      this.results.set(name, {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        lastCheck: new Date().toISOString(),
      });
    }
  }

  private getOverallHealth(
    agentCounts: { total: number; healthy: number; unhealthy: number },
    _workflowCounts: { total: number; running: number; failed: number; completed: number }
  ): "healthy" | "degraded" | "unhealthy" {
    if (agentCounts.total > 0 && agentCounts.healthy === 0) return "unhealthy";
    if (agentCounts.unhealthy > agentCounts.total / 2) return "unhealthy";
    if (agentCounts.unhealthy > 0) return "degraded";

    const checkResults = Array.from(this.results.values());
    if (checkResults.length > 0 && checkResults.every((r) => !r.healthy)) return "unhealthy";
    if (checkResults.some((r) => !r.healthy)) return "degraded";

    return "healthy";
  }
}
