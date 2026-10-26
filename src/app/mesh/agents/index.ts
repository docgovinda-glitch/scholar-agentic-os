/**
 * Built-in Mesh Agent Manifests & Registration Pipeline
 *
 * AG-14 Citation Manager, AG-18 Readability Analyst, AG-25 Privacy Guard,
 * and AG-26 Workflow Coordinator are actively integrated into the
 * centralized `scholarBrain` execution pipeline (see `server/src/services/scholarBrain.ts`).
 *
 * `registerBuiltinAgents()` populates the Mesh registry so any orchestrator,
 * conductor, or dynamic router can invoke them by canonical ID.
 */

import { registerAgent } from "../registry";
import { ag14CitationManager } from "./ag14CitationManager";
import { ag18ReadabilityAnalyst } from "./ag18ReadabilityAnalyst";
import { ag25PrivacyGuard } from "./ag25PrivacyGuard";
import { ag26WorkflowCoordinator } from "./ag26WorkflowCoordinator";

export { ag14CitationManager } from "./ag14CitationManager";
export { ag18ReadabilityAnalyst } from "./ag18ReadabilityAnalyst";
export { ag25PrivacyGuard } from "./ag25PrivacyGuard";
export { ag26WorkflowCoordinator } from "./ag26WorkflowCoordinator";

export function registerBuiltinAgents(): void {
  registerAgent(ag14CitationManager);
  registerAgent(ag18ReadabilityAnalyst);
  registerAgent(ag25PrivacyGuard);
  registerAgent(ag26WorkflowCoordinator);
}
