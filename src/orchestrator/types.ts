/**
 * Multi-Agent Orchestrator - Type Definitions
 *
 * Defines core types for the orchestration system including workflows,
 * artifacts, execution models, and agent contracts.
 */

import type { Agent, AgentMetadata, AgentContext } from "../agents/types";
import type { SkillMetadata } from "../skills/types";

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Workflow states.
 */
export type WorkflowState = 
  | "draft"
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "awaiting_approval";

/**
 * Workflow execution modes.
 */
export type WorkflowExecutionMode = 
  | "sequential"
  | "parallel"
  | "conditional";

/**
 * Workflow stage types.
 */
export type WorkflowStageType = 
  | "input"
  | "processing"
  | "decision"
  | "output"
  | "approval"
  | "validation";

/**
 * Workflow stage definition.
 */
export interface WorkflowStage {
  /** Unique stage identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Stage description */
  description: string;
  /** Type of stage */
  type: WorkflowStageType;
  /** Associated agent ID */
  agentId: string;
  /** Input artifact schema */
  inputSchema?: string;
  /** Output artifact schema */
  outputSchema?: string;
  /** Stage dependencies */
  dependencies: string[];
  /** Timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retryConfig?: RetryConfig;
  /** Approval required */
  requiresApproval?: boolean;
  /** Conditional execution logic */
  condition?: string;
  /** Stage configuration */
  config?: Record<string, unknown>;
}

/**
 * Workflow definition.
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier */
  id: string;
  /** Workflow name */
  name: string;
  /** Workflow description */
  description: string;
  /** Workflow version */
  version: string;
  /** Execution mode */
  executionMode: WorkflowExecutionMode;
  /** Stages in the workflow */
  stages: WorkflowStage[];
  /** Global configuration */
  config: Record<string, unknown>;
  /** Required permissions */
  requiredPermissions?: string[];
  /** Estimated duration in milliseconds */
  estimatedDurationMs?: number;
  /** Author information */
  author?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Creation timestamp */
  createdAt: string;
  /** Last modified timestamp */
  modifiedAt: string;
}

// ============================================================================
// Artifact Types
// ============================================================================

/**
 * Artifact types.
 */
export type ArtifactType = 
  | "document"
  | "research-plan"
  | "literature-review"
  | "knowledge-graph"
  | "evidence"
  | "manuscript"
  | "publication"
  | "quality-report"
  | "approval"
  | "notification"
  | "audit"
  | "metrics"
  | "error"
  | "checkpoint";

/**
 * Artifact status.
 */
export type ArtifactStatus = 
  | "draft"
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

/**
 * Artifact metadata.
 */
export interface ArtifactMetadata {
  /** Unique artifact identifier */
  id: string;
  /** Artifact type */
  type: ArtifactType;
  /** Schema version */
  version: string;
  /** Status of the artifact */
  status: ArtifactStatus;
  /** Creation timestamp */
  createdAt: string;
  /** Last modified timestamp */
  modifiedAt: string;
  /** Producer agent */
  originatingAgent: string;
  /** Consumer agent */
  owner?: string;
  /** Approval status */
  approvalStatus?: "pending" | "approved" | "rejected";
  /** Approval comments */
  approvalComments?: string;
  /** Verification status */
  verificationStatus?: "unverified" | "verified" | "failed";
  /** Timestamp */
  timestamp?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Base artifact interface.
 */
export interface Artifact {
  /** Artifact metadata */
  metadata: ArtifactMetadata;
  /** Artifact data payload */
  data: unknown;
  /** Provenance information */
  provenance: {
    /** Execution ID */
    executionId?: string;
    /** Workflow ID */
    workflowId?: string;
    /** Previous artifact IDs */
    previousArtifacts?: string[];
    /** Transformation history */
    transformations?: {
      fromType: ArtifactType;
      toType: ArtifactType;
      agentId: string;
      timestamp: string;
    }[];
  };
  /** Audit trail */
  auditTrail: {
    timestamp: string;
    action: string;
    agentId: string;
    details?: Record<string, unknown>;
  }[];
}

/**
 * Workflow artifact.
 */
export interface WorkflowArtifact extends Artifact {
  type: "workflow";
  data: {
    /** Workflow definition */
    definition: WorkflowDefinition;
    /** Current execution state */
    executionState: WorkflowExecutionState;
  };
}

/**
 * Execution artifact.
 */
export interface ExecutionArtifact extends Artifact {
  type: "execution";
  data: {
    /** Execution ID */
    executionId: string;
    /** Workflow ID */
    workflowId: string;
    /** Stage ID */
    stageId: string;
    /** Agent ID */
    agentId: string;
    /** Input data */
    inputData: unknown;
    /** Output data */
    outputData: unknown;
    /** Execution metrics */
    metrics: ExecutionMetrics;
  };
}

/**
 * Approval artifact.
 */
export interface ApprovalArtifact extends Artifact {
  type: "approval";
  data: {
    /** Approval ID */
    approvalId: string;
    /** Stage ID */
    stageId: string;
    /** Agent ID */
    agentId: string;
    /** Approval request data */
    request: unknown;
    /** Approval decision */
    decision: "approved" | "rejected";
    /** Approval comments */
    comments?: string;
    /** Approver */
    approver: string;
    /** Approval timestamp */
    timestamp: string;
  };
}

/**
 * Error artifact.
 */
export interface ErrorArtifact extends Artifact {
  type: "error";
  data: {
    /** Error ID */
    errorId: string;
    /** Stage ID */
    stageId: string;
    /** Agent ID */
    agentId: string;
    /** Error type */
    errorType: string;
    /** Error message */
    message: string;
    /** Error details */
    details?: Record<string, unknown>;
    /** Timestamp */
    timestamp: string;
    /** Recovery actions */
    recoveryActions?: string[];
  };
}

/**
 * Any artifact type.
 */
export type AnyArtifact = 
  | WorkflowArtifact
  | ExecutionArtifact
  | ApprovalArtifact
  | ErrorArtifact;

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Execution states.
 */
export type ExecutionState = 
  | "queued"
  | "initializing"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "awaiting_approval"
  | "retried"
  | "rolled_back";

/**
 * Execution priority.
 */
export type ExecutionPriority = "low" | "normal" | "high" | "critical";

/**
 * Execution metrics.
 */
export interface ExecutionMetrics {
  /** Start time */
  startTime: string;
  /** End time */
  endTime?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** CPU usage percentage */
  cpuUsage?: number;
  /** Memory usage in bytes */
  memoryUsage?: number;
  /** Input artifact size */
  inputSize?: number;
  /** Output artifact size */
  outputSize?: number;
  /** Number of retries */
  retryCount?: number;
  /** Number of rollbacks */
  rollbackCount?: number;
  /** Error count */
  errorCount?: number;
  /** Warning count */
  warningCount?: number;
}

/**
 * Execution record.
 */
export interface ExecutionRecord {
  /** Execution ID */
  executionId: string;
  /** Workflow ID */
  workflowId: string;
  /** User ID */
  userId: string;
  /** Execution state */
  state: ExecutionState;
  /** Priority */
  priority: ExecutionPriority;
  /** Start time */
  startTime: string;
  /** End time */
  endTime?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Current stage */
  currentStage?: string;
  /** Completed stages */
  completedStages: string[];
  /** Failed stages */
  failedStages: string[];
  /** Artifacts produced */
  artifacts: string[];
  /** Configuration used */
  config: Record<string, unknown>;
  /** Error information */
  error?: {
    type: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Retry information */
  retryInfo?: {
    retryCount: number;
    maxRetries: number;
    retryDelayMs: number;
  };
  /** Approval information */
  approvalInfo?: {
    required: boolean;
    status: "pending" | "approved" | "rejected";
    approver?: string;
    comments?: string;
  };
}

/**
 * Execution state.
 */
export interface WorkflowExecutionState {
  /** Execution ID */
  executionId: string;
  /** Current state */
  state: ExecutionState;
  /** Current stage */
  currentStage?: string;
  /** Completed stages */
  completedStages: string[];
  /** Failed stages */
  failedStages: string[];
  /** Artifacts */
  artifacts: Record<string, AnyArtifact>;
  /** Metrics */
  metrics: ExecutionMetrics;
  /** Timestamps */
  timestamps: {
    startedAt: string;
    completedAt?: string;
    lastUpdated: string;
  };
  /** Execution log */
  log: {
    timestamp: string;
    stage: string;
    message: string;
    level: "debug" | "info" | "warn" | "error";
    data?: unknown;
  }[];
}

// ============================================================================
// Agent Registry Types
// ============================================================================

/**
 * Agent capability information.
 */
export interface AgentCapability {
  /** Capability ID */
  id: string;
  /** Capability name */
  name: string;
  /** Description */
  description: string;
  /** Input artifact types */
  inputTypes: ArtifactType[];
  /** Output artifact types */
  outputTypes: ArtifactType[];
  /** Required permissions */
  requiredPermissions?: string[];
  /** Performance characteristics */
  performance?: {
    /** Estimated execution time in milliseconds */
    estimatedTimeMs?: number;
    /** Memory footprint estimate in bytes */
    memoryEstimate?: number;
    /** CPU intensive operation */
    cpuIntensive?: boolean;
    /** I/O intensive operation */
    ioIntensive?: boolean;
  };
}

/**
 * Agent capability registry entry.
 */
export interface AgentCapabilityEntry {
  /** Agent ID */
  agentId: string;
  /** Agent metadata */
  metadata: AgentMetadata;
  /** Capabilities */
  capabilities: AgentCapability[];
  /** Health status */
  health: {
    /** Is healthy */
    healthy: boolean;
    /** Last check timestamp */
    lastCheck: string;
    /** Error message if not healthy */
    error?: string;
  };
  /** Execution metrics */
  metrics: {
    /** Total executions */
    totalExecutions: number;
    /** Successful executions */
    successfulExecutions: number;
    /** Failed executions */
    failedExecutions: number;
    /** Average execution time in milliseconds */
    averageExecutionTimeMs: number;
    /** Last execution timestamp */
    lastExecution: string;
  };
}

// ============================================================================
// Workflow Registry Types
// ============================================================================

/**
 * Workflow registry entry.
 */
export interface WorkflowRegistryEntry {
  /** Workflow definition */
  definition: WorkflowDefinition;
  /** Usage statistics */
  stats: {
    /** Total executions */
    totalExecutions: number;
    /** Successful executions */
    successfulExecutions: number;
    /** Failed executions */
    failedExecutions: number;
    /** Average execution time in milliseconds */
    averageExecutionTimeMs: number;
    /** Last execution timestamp */
    lastExecution: string;
  };
}

// ============================================================================
// Approval Gate Types
// ============================================================================

/**
 * Approval gate configuration.
 */
export interface ApprovalGateConfig {
  /** Gate ID */
  id: string;
  /** Stage ID */
  stageId: string;
  /** Required approvers */
  approvers: string[];
  /** Approval type */
  type: "single" | "majority" | "unanimous";
  /** Timeout in milliseconds */
  timeout?: number;
  /** Reject on timeout */
  rejectOnTimeout?: boolean;
  /** Configuration */
  config?: Record<string, unknown>;
}

/**
 * Approval gate state.
 */
export interface ApprovalGateState {
  /** Gate ID */
  id: string;
  /** Stage ID */
  stageId: string;
  /** Status */
  status: "pending" | "approved" | "rejected" | "timeout";
  /** Request timestamp */
  requestedAt: string;
  /** Approval timestamp */
  approvedAt?: string;
  /** Rejection timestamp */
  rejectedAt?: string;
  /** Timeout timestamp */
  timeoutAt?: string;
  /** Approvals */
  approvals: {
    /** Approver ID */
    approver: string;
    /** Decision */
    decision: "approved" | "rejected";
    /** Comments */
    comments?: string;
    /** Timestamp */
    timestamp: string;
  }[];
  /** Current pending approvers */
  pendingApprovers: string[];
}

// ============================================================================
// Retry and Recovery Types
// ============================================================================

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Maximum delay in milliseconds */
  maxDelayMs?: number;
  /** Retry on error types */
  retryOnErrors?: string[];
  /** Jitter configuration */
  jitter?: {
    enabled: boolean;
    min: number;
    max: number;
  };
}

/**
 * Recovery action.
 */
export interface RecoveryAction {
  /** Action ID */
  id: string;
  /** Action name */
  name: string;
  /** Action description */
  description: string;
  /** Action type */
  type: "retry" | "rollback" | "compensate" | "skip";
  /** Configuration */
  config: Record<string, unknown>;
  /** Conditions for execution */
  conditions?: string[];
}

/**
 * Recovery configuration.
 */
export interface RecoveryConfig {
  /** Recovery actions */
  actions: RecoveryAction[];
  /** Maximum recovery attempts */
  maxRecoveryAttempts: number;
  /** State preservation */
  preserveState: boolean;
  /** Report generation */
  generateReport: boolean;
}

// ============================================================================
// Monitoring and Metrics Types
// ============================================================================

/**
 * System health metrics.
 */
export interface SystemHealthMetrics {
  /** Overall health status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Timestamp */
  timestamp: string;
  /** Agent health */
  agents: {
    /** Total agents */
    total: number;
    /** Healthy agents */
    healthy: number;
    /** Unhealthy agents */
    unhealthy: number;
  };
  /** Workflow health */
  workflows: {
    /** Total workflows */
    total: number;
    /** Running workflows */
    running: number;
    /** Failed workflows */
    failed: number;
    /** Completed workflows */
    completed: number;
  };
  /** Resource usage */
  resources: {
    /** CPU usage percentage */
    cpu: number;
    /** Memory usage percentage */
    memory: number;
    /** Disk usage percentage */
    disk: number;
  };
  /** Queue metrics */
  queues: {
    /** Pending executions */
    pending: number;
    /** Running executions */
    running: number;
    /** Failed executions */
    failed: number;
  };
}

/**
 * Workflow metrics.
 */
export interface WorkflowMetrics {
  /** Workflow ID */
  workflowId: string;
  /** Stage metrics */
  stages: {
    [stageId: string]: {
      /** Total executions */
      total: number;
      /** Successful executions */
      successful: number;
      /** Failed executions */
      failed: number;
      /** Average execution time in milliseconds */
      averageTimeMs: number;
      /** Last execution timestamp */
      lastExecution: string;
    };
  };
  /** Artifact metrics */
  artifacts: {
    /** Total artifacts */
    total: number;
    /** Average artifact size */
    averageSize: number;
  };
}

/**
 * Performance metrics.
 */
export interface PerformanceMetrics {
  /** Time metrics */
  timing: {
    /** Average workflow execution time */
    workflowAverageTimeMs: number;
    /** 95th percentile execution time */
    workflow95thPercentileTimeMs: number;
    /** Average stage execution time */
    stageAverageTimeMs: number;
  };
  /** Throughput metrics */
  throughput: {
    /** Workflows per minute */
    workflowsPerMinute: number;
    /** Artifacts per minute */
    artifactsPerMinute: number;
  };
  /** Error metrics */
  errors: {
    /** Error rate percentage */
    errorRate: number;
    /** Top error types */
    topErrorTypes: {
      type: string;
      count: number;
    }[];
  };
}

// ============================================================================
// Notification Types
// ============================================================================

/**
 * Notification types.
 */
export type NotificationType = 
  | "workflow_completed"
  | "workflow_failed"
  | "stage_completed"
  | "stage_failed"
  | "approval_required"
  | "approval_completed"
  | "retry_initiated"
  | "recovery_initiated"
  | "system_health_warning"
  | "agent_health_warning";

/**
 * Notification priority.
 */
export type NotificationPriority = "low" | "normal" | "high" | "critical";

/**
 * Notification interface.
 */
export interface Notification {
  /** Notification ID */
  id: string;
  /** Type */
  type: NotificationType;
  /** Priority */
  priority: NotificationPriority;
  /** Title */
  title: string;
  /** Message */
  message: string;
  /** Timestamp */
  timestamp: string;
  /** Recipients */
  recipients: string[];
  /** Data payload */
  data?: Record<string, unknown>;
  /** Read status */
  read: boolean;
  /** Read timestamp */
  readAt?: string;
}

// ============================================================================
// Visualization Types
// ============================================================================

/**
 * Workflow visualization node.
 */
export interface WorkflowNode {
  /** Node ID */
  id: string;
  /** Node type */
  type: "stage" | "decision" | "input" | "output" | "approval";
  /** Position */
  position: {
    x: number;
    y: number;
  };
  /** Size */
  size: {
    width: number;
    height: number;
  };
  /** Data */
  data: {
    /** Label */
    label: string;
    /** Description */
    description?: string;
    /** Status */
    status?: "pending" | "running" | "completed" | "failed";
    /** Progress */
    progress?: number;
  };
}

/**
 * Workflow visualization edge.
 */
export interface WorkflowEdge {
  /** Edge ID */
  id: string;
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Edge type */
  type: "normal" | "conditional";
  /** Label */
  label?: string;
  /** Data */
  data: {
    /** Condition */
    condition?: string;
  };
}

/**
 * Workflow visualization model.
 */
export interface WorkflowVisualizationModel {
  /** Workflow ID */
  workflowId: string;
  /** Nodes */
  nodes: WorkflowNode[];
  /** Edges */
  edges: WorkflowEdge[];
  /** Metadata */
  metadata: {
    /** Title */
    title: string;
    /** Description */
    description?: string;
    /** Version */
    version: string;
    /** Last updated */
    lastUpdated: string;
  };
}