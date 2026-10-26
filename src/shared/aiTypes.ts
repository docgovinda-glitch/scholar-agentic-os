/**
 * Canonical AI & Task Routing Types
 *
 * Unifies TaskType (server omniRouter), TaskClass (Warden policy),
 * and RoutingTaskType (desk / client router) into a single isomorphic source of truth.
 */

/** Canonical task classes for Warden privacy policy and gateway dispatch. */
export type TaskClass =
  | "drafting"
  | "refinement"
  | "chat"
  | "summarisation"
  | "verification"
  | "rule_extraction"
  | "discovery"
  | "embedding"
  | "classification";

/** Canonical routing task types used across client and server routers. */
export type RoutingTaskType =
  | "simple"
  | "multimodal"
  | "reasoning"
  | "coding"
  | "long-context"
  | "literatureDiscovery";

/** Backward-compatible alias for TaskType. */
export type TaskType = RoutingTaskType;

/**
 * Maps a router task type (or string) to the canonical Warden TaskClass.
 */
export function mapRoutingTaskTypeToTaskClass(taskType?: string | null): TaskClass {
  switch (taskType) {
    case "simple":
    case "chat":
      return "chat";
    case "reasoning":
    case "drafting":
      return "drafting";
    case "coding":
    case "refinement":
      return "refinement";
    case "long-context":
    case "summarisation":
      return "summarisation";
    case "literatureDiscovery":
    case "discovery":
      return "discovery";
    case "verification":
      return "verification";
    case "rule_extraction":
      return "rule_extraction";
    case "embedding":
      return "embedding";
    case "classification":
      return "classification";
    default:
      return "chat";
  }
}
