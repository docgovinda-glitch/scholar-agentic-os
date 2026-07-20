import type { ExecutionPriority } from "./types";

export interface QueueEntry {
  executionId: string;
  priority: ExecutionPriority;
  timestamp: string;
  data: unknown;
}

const PRIORITY_ORDER: Record<ExecutionPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class ExecutionQueue {
  private queue: QueueEntry[] = [];
  private running: Map<string, QueueEntry> = new Map();

  enqueue(entry: QueueEntry): void {
    this.queue.push(entry);
    this.queue.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority];
      const pb = PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      return a.timestamp.localeCompare(b.timestamp);
    });
  }

  dequeue(): QueueEntry | undefined {
    const entry = this.queue.shift();
    if (entry) {
      this.running.set(entry.executionId, entry);
    }
    return entry;
  }

  peek(): QueueEntry | undefined {
    return this.queue[0];
  }

  remove(executionId: string): boolean {
    const idx = this.queue.findIndex((e) => e.executionId === executionId);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      return true;
    }
    this.running.delete(executionId);
    return false;
  }

  getPendingCount(): number {
    return this.queue.length;
  }

  getRunningCount(): number {
    return this.running.size;
  }

  isRunning(executionId: string): boolean {
    return this.running.has(executionId);
  }

  markRunning(executionId: string, data?: unknown): boolean {
    const existing = this.queue.find((e) => e.executionId === executionId);
    if (existing) {
      this.queue = this.queue.filter((e) => e.executionId !== executionId);
      if (data) existing.data = data;
      this.running.set(executionId, existing);
      return true;
    }
    return false;
  }

  markCompleted(executionId: string): void {
    this.running.delete(executionId);
  }

  clear(): void {
    this.queue = [];
    this.running.clear();
  }

  getAll(): QueueEntry[] {
    return [...this.queue];
  }

  getRunning(): QueueEntry[] {
    return Array.from(this.running.values());
  }

  reprioritize(executionId: string, newPriority: ExecutionPriority): boolean {
    const entry = this.queue.find((e) => e.executionId === executionId);
    if (entry) {
      entry.priority = newPriority;
      this.queue.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority];
        const pb = PRIORITY_ORDER[b.priority];
        if (pa !== pb) return pa - pb;
        return a.timestamp.localeCompare(b.timestamp);
      });
      return true;
    }
    return false;
  }
}
