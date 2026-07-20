import type { AnyArtifact } from "./types";
import { v4 as uuidv4 } from "uuid";

export interface AuditRecord {
  recordId: string;
  executionId: string;
  workflowId: string;
  userId: string;
  agentId: string;
  action: string;
  input?: unknown;
  output?: unknown;
  config?: Record<string, unknown>;
  durationMs?: number;
  retryCount?: number;
  approvalInfo?: {
    status: string;
    approver?: string;
    comments?: string;
    timestamp: string;
  };
  failureInfo?: {
    error: string;
    errorType: string;
    recoveryAction: string;
  };
  timestamp: string;
  previousRecordHash?: string;
  recordHash: string;
}

export class ExecutionAuditService {
  private records: AuditRecord[] = [];
  private enabled: boolean;
  private lastHash: string = "";

  constructor(opts?: { enabled?: boolean }) {
    this.enabled = opts?.enabled ?? true;
  }

  async auditArtifact(
    artifact: AnyArtifact,
    event?: {
      executionId?: string;
      workflowId?: string;
      userId?: string;
      action?: string;
      durationMs?: number;
    }
  ): Promise<AnyArtifact> {
    if (!this.enabled) return artifact;

    const record: AuditRecord = {
      recordId: uuidv4(),
      executionId: event?.executionId ?? artifact.provenance?.executionId ?? "",
      workflowId: event?.workflowId ?? artifact.provenance?.workflowId ?? "",
      userId: event?.userId ?? "",
      agentId: artifact.metadata.originatingAgent,
      action: event?.action ?? "artifact_processed",
      input: artifact.data,
      config: artifact.metadata as unknown as Record<string, unknown>,
      durationMs: event?.durationMs,
      timestamp: new Date().toISOString(),
      previousRecordHash: this.lastHash || undefined,
      recordHash: "",
    };

    record.recordHash = this.computeHash(record);
    this.lastHash = record.recordHash;
    this.records.push(record);

    return {
      ...artifact,
      auditTrail: [
        ...(artifact.auditTrail ?? []),
        {
          timestamp: record.timestamp,
          action: `audit:${record.action}`,
          agentId: "audit-service",
          details: { recordId: record.recordId, hash: record.recordHash },
        },
      ],
    };
  }

  async appendRecord(record: AuditRecord): Promise<void> {
    if (!this.enabled) return;
    record.previousRecordHash = this.lastHash || undefined;
    record.recordHash = this.computeHash(record);
    this.lastHash = record.recordHash;
    this.records.push(record);
  }

  getRecords(executionId?: string): AuditRecord[] {
    if (executionId) {
      return this.records.filter((r) => r.executionId === executionId);
    }
    return [...this.records];
  }

  getRecord(recordId: string): AuditRecord | undefined {
    return this.records.find((r) => r.recordId === recordId);
  }

  verifyChain(): { valid: boolean; breakAtIndex?: number } {
    for (let i = 0; i < this.records.length; i++) {
      const raw = { ...this.records[i], recordHash: "" };
      const expectedHash = this.computeHash(raw);
      if (this.records[i].recordHash !== expectedHash) {
        return { valid: false, breakAtIndex: i };
      }
    }
    return { valid: true };
  }

  clear(): void {
    this.records = [];
    this.lastHash = "";
  }

  private computeHash(record: Omit<AuditRecord, "recordHash">): string {
    const str = JSON.stringify(record, Object.keys(record).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `audit-${Math.abs(hash).toString(16).padStart(8, "0")}`;
  }
}
