import type { ExecutionRecord } from "./types";

export class ExecutionHistoryService {
  private records: Map<string, ExecutionRecord> = new Map();
  private history: ExecutionRecord[] = [];

  async appendRecord(record: ExecutionRecord): Promise<void> {
    const frozen = JSON.parse(JSON.stringify(record)) as ExecutionRecord;
    this.records.set(record.executionId, frozen);
    this.history.push(frozen);
  }

  async getRecord(executionId: string): Promise<ExecutionRecord | undefined> {
    return this.records.get(executionId);
  }

  async getRecordsByWorkflow(workflowId: string): Promise<ExecutionRecord[]> {
    return this.history.filter((r) => r.workflowId === workflowId);
  }

  async getRecordsByUser(userId: string): Promise<ExecutionRecord[]> {
    return this.history.filter((r) => r.userId === userId);
  }

  async getRecordsByState(state: string): Promise<ExecutionRecord[]> {
    return this.history.filter((r) => r.state === state);
  }

  async updateRecord(executionId: string, updates: Partial<ExecutionRecord>): Promise<boolean> {
    const existing = this.records.get(executionId);
    if (!existing) return false;
    const updated = { ...existing, ...updates } as ExecutionRecord;
    this.records.set(executionId, updated);
    const idx = this.history.findIndex((r) => r.executionId === executionId);
    if (idx >= 0) this.history[idx] = updated;
    return true;
  }

  listAll(): ExecutionRecord[] {
    return [...this.history];
  }

  getCount(): number {
    return this.history.length;
  }

  clear(): void {
    this.records.clear();
    this.history = [];
  }
}
