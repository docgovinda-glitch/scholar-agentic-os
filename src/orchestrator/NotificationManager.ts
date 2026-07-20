import type { Notification, NotificationType, NotificationPriority } from "./types";
import { v4 as uuidv4 } from "uuid";

export interface NotificationHandler {
  (notification: Notification): Promise<void>;
}

export type NotificationEvent =
  | "workflow_started"
  | "workflow_completed"
  | "workflow_failed"
  | "stage_completed"
  | "stage_failed"
  | "approval_needed"
  | "approval_completed"
  | "retry_started"
  | "recovery_completed"
  | "publication_ready"
  | "scholar_learning_updated";

export class NotificationManager {
  private handlers: Map<NotificationEvent, Set<NotificationHandler>> = new Map();
  private sentNotifications: Notification[] = [];
  private readonly maxHistory: number;

  constructor(opts?: { maxHistory?: number }) {
    this.maxHistory = opts?.maxHistory ?? 1000;
  }

  on(event: NotificationEvent, handler: NotificationHandler): () => void {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.handlers.delete(event);
    };
  }

  off(event: NotificationEvent, handler: NotificationHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) this.handlers.delete(event);
    }
  }

  async notify(event: NotificationEvent, params: {
    title: string;
    message: string;
    priority?: NotificationPriority;
    recipients?: string[];
    data?: Record<string, unknown>;
  }): Promise<Notification> {
    const notification: Notification = {
      id: uuidv4(),
      type: this.eventToType(event),
      priority: params.priority ?? "normal",
      title: params.title,
      message: params.message,
      timestamp: new Date().toISOString(),
      recipients: params.recipients ?? [],
      data: params.data,
      read: false,
    };

    this.sentNotifications.push(notification);
    if (this.sentNotifications.length > this.maxHistory) {
      this.sentNotifications.shift();
    }

    const handlers = this.handlers.get(event);
    if (handlers) {
      const promises = Array.from(handlers).map((h) => {
        try {
          const result = h(notification);
          if (result && typeof result.catch === "function") {
            return result.catch((err: unknown) =>
              console.error(`Notification handler failed for ${event}:`, err)
            );
          }
        } catch (err) {
          console.error(`Notification handler failed for ${event}:`, err);
        }
        return Promise.resolve();
      });
      await Promise.all(promises);
    }

    return notification;
  }

  async workflowStarted(params: { workflowId: string; executionId: string; userId: string }): Promise<Notification> {
    return this.notify("workflow_started", {
      title: "Workflow Started",
      message: `Workflow ${params.workflowId} execution ${params.executionId} has started`,
      recipients: [params.userId],
      data: params as unknown as Record<string, unknown>,
    });
  }

  async workflowCompleted(params: { workflowId: string; executionId: string; userId: string; durationMs?: number }): Promise<Notification> {
    return this.notify("workflow_completed", {
      title: "Workflow Completed",
      message: `Workflow ${params.workflowId} execution ${params.executionId} completed successfully`,
      recipients: [params.userId],
      data: params as unknown as Record<string, unknown>,
    });
  }

  async workflowFailed(params: { workflowId: string; executionId: string; userId: string; error?: string }): Promise<Notification> {
    return this.notify("workflow_failed", {
      title: "Workflow Failed",
      message: `Workflow ${params.workflowId} execution ${params.executionId} failed`,
      priority: "high",
      recipients: [params.userId],
      data: params as unknown as Record<string, unknown>,
    });
  }

  async approvalNeeded(params: { workflowId: string; executionId: string; stageId: string; gateId: string; approver: string }): Promise<Notification> {
    return this.notify("approval_needed", {
      title: "Approval Required",
      message: `Stage ${params.stageId} in workflow ${params.workflowId} requires approval`,
      priority: "high",
      recipients: [params.approver],
      data: params as unknown as Record<string, unknown>,
    });
  }

  async approvalCompleted(params: { workflowId: string; executionId: string; stageId: string; gateId: string; decision: string }): Promise<Notification> {
    return this.notify("approval_completed", {
      title: "Approval Completed",
      message: `Approval for stage ${params.stageId} was ${params.decision}`,
      recipients: [],
      data: params as unknown as Record<string, unknown>,
    });
  }

  async retryStarted(params: { workflowId: string; executionId: string; stageId: string; attempt: number }): Promise<Notification> {
    return this.notify("retry_started", {
      title: "Retry Started",
      message: `Retry attempt ${params.attempt} for stage ${params.stageId}`,
      priority: "high",
      data: params as unknown as Record<string, unknown>,
    });
  }

  async recoveryCompleted(params: { workflowId: string; executionId: string; stageId: string; action: string }): Promise<Notification> {
    return this.notify("recovery_completed", {
      title: "Recovery Completed",
      message: `Recovery action "${params.action}" completed for stage ${params.stageId}`,
      data: params as unknown as Record<string, unknown>,
    });
  }

  async publicationReady(params: { workflowId: string; executionId: string; userId: string; artifactId: string }): Promise<Notification> {
    return this.notify("publication_ready", {
      title: "Publication Ready",
      message: `Publication artifact ${params.artifactId} is ready from workflow ${params.workflowId}`,
      priority: "normal",
      recipients: [params.userId],
      data: params as unknown as Record<string, unknown>,
    });
  }

  async scholarLearningUpdated(params: { workflowId: string; executionId: string; updateType: string }): Promise<Notification> {
    return this.notify("scholar_learning_updated", {
      title: "Scholar Learning Updated",
      message: `Scholar learning ${params.updateType} updated from workflow ${params.workflowId}`,
      priority: "low",
      data: params as unknown as Record<string, unknown>,
    });
  }

  getHistory(): Notification[] {
    return [...this.sentNotifications];
  }

  clear(): void {
    this.sentNotifications = [];
    this.handlers.clear();
  }

  private eventToType(event: NotificationEvent): NotificationType {
    const mapping: Record<NotificationEvent, NotificationType> = {
      workflow_started: "workflow_completed",
      workflow_completed: "workflow_completed",
      workflow_failed: "workflow_failed",
      stage_completed: "stage_completed",
      stage_failed: "stage_failed",
      approval_needed: "approval_required",
      approval_completed: "approval_completed",
      retry_started: "retry_initiated",
      recovery_completed: "recovery_initiated",
      publication_ready: "workflow_completed",
      scholar_learning_updated: "workflow_completed",
    };
    return mapping[event];
  }
}
