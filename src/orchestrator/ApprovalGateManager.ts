import type { AnyArtifact, ApprovalGateConfig, ApprovalGateState, ArtifactStatus } from "./types";
import { v4 as uuidv4 } from "uuid";

export interface ApprovalAction {
  gateId: string;
  approver: string;
  decision: "approved" | "rejected" | "revision_requested";
  comments?: string;
  timestamp: string;
}

export class ApprovalGateManager {
  private gates: Map<string, ApprovalGateState> = new Map();
  private configs: Map<string, ApprovalGateConfig> = new Map();
  private history: ApprovalAction[] = [];
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  createApprovalRequest(params: {
    approvalId: string;
    stageId: string;
    agentId: string;
    request: unknown;
    approver: string;
    decisionRequired: boolean;
  }): AnyArtifact {
    const gateId = params.approvalId;
    const now = new Date().toISOString();

    this.gates.set(gateId, {
      id: gateId,
      stageId: params.stageId,
      status: "pending",
      requestedAt: now,
      approvals: [],
      pendingApprovers: [params.approver],
    });

    return {
      metadata: {
        id: gateId,
        type: "approval",
        version: "1.0.0",
        status: "pending" as ArtifactStatus,
        createdAt: now,
        modifiedAt: now,
        originatingAgent: params.agentId,
        approvalStatus: "pending",
      },
      data: {
        approvalId: gateId,
        stageId: params.stageId,
        agentId: params.agentId,
        request: params.request,
        decision: "pending",
        approver: params.approver,
        timestamp: now,
      },
      provenance: {
        previousArtifacts: [],
        transformations: [],
        executionId: params.agentId,
      },
      auditTrail: [
        {
          timestamp: now,
          action: "approval_requested",
          agentId: params.agentId,
          details: { gateId, stageId: params.stageId, approver: params.approver },
        },
      ],
      type: "approval",
    } as unknown as AnyArtifact;
  }

  approve(gateId: string, approver: string, comments?: string): { success: boolean; state: ApprovalGateState } {
    return this.recordDecision(gateId, approver, "approved", comments);
  }

  reject(gateId: string, approver: string, comments?: string): { success: boolean; state: ApprovalGateState } {
    return this.recordDecision(gateId, approver, "rejected", comments);
  }

  requestRevision(gateId: string, approver: string, comments?: string): { success: boolean; state: ApprovalGateState } {
    return this.recordDecision(gateId, approver, "revision_requested", comments);
  }

  escalate(gateId: string, newApprover: string): { success: boolean; state?: ApprovalGateState } {
    const gate = this.gates.get(gateId);
    if (!gate) return { success: false };
    if (gate.status !== "pending") return { success: false };

    gate.pendingApprovers.push(newApprover);
    this.gates.set(gateId, gate);
    return { success: true, state: gate };
  }

  getGateState(gateId: string): ApprovalGateState | undefined {
    return this.gates.get(gateId);
  }

  getApprovalHistory(gateId?: string): ApprovalAction[] {
    if (gateId) {
      return this.history.filter((a) => a.gateId === gateId);
    }
    return [...this.history];
  }

  setupTimeout(
    gateId: string,
    timeoutMs: number,
    onTimeout: (gateId: string) => void
  ): void {
    this.clearTimeout(gateId);
    const timer = setTimeout(() => {
      const gate = this.gates.get(gateId);
      if (gate && gate.status === "pending") {
        gate.status = "timeout";
        gate.timeoutAt = new Date().toISOString();
        this.gates.set(gateId, gate);
        onTimeout(gateId);
      }
      this.timers.delete(gateId);
    }, timeoutMs);
    this.timers.set(gateId, timer);
  }

  clearTimeout(gateId: string): void {
    const timer = this.timers.get(gateId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(gateId);
    }
  }

  isPending(gateId: string): boolean {
    return this.gates.get(gateId)?.status === "pending";
  }

  isApproved(gateId: string): boolean {
    return this.gates.get(gateId)?.status === "approved";
  }

  listPendingGates(): ApprovalGateState[] {
    return Array.from(this.gates.values()).filter((g) => g.status === "pending");
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.gates.clear();
    this.configs.clear();
    this.history = [];
  }

  private recordDecision(
    gateId: string,
    approver: string,
    decision: "approved" | "rejected" | "revision_requested",
    comments?: string
  ): { success: boolean; state: ApprovalGateState } {
    const gate = this.gates.get(gateId);
    if (!gate) return { success: false, state: { id: gateId, stageId: "", status: "pending", requestedAt: "", approvals: [], pendingApprovers: [] } };
    if (gate.status !== "pending") return { success: false, state: gate };

    const timestamp = new Date().toISOString();
    const action: ApprovalAction = { gateId, approver, decision, comments, timestamp };
    gate.approvals.push({
      approver,
      decision: decision === "revision_requested" ? "rejected" : decision,
      comments,
      timestamp,
    });
    gate.pendingApprovers = gate.pendingApprovers.filter((a) => a !== approver);
    this.history.push(action);

    if (decision === "rejected" || decision === "revision_requested") {
      gate.status = decision === "rejected" ? "rejected" : "pending";
      gate.rejectedAt = timestamp;
    } else if (gate.pendingApprovers.length === 0) {
      gate.status = "approved";
      gate.approvedAt = timestamp;
    }

    this.gates.set(gateId, gate);
    return { success: true, state: gate };
  }
}
