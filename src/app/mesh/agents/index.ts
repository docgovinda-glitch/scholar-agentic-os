/**
 * Every built-in agent manifest, and a helper to register them all.
 *
 * Nothing calls `registerBuiltinAgents()` yet — no HTTP route or
 * `app/conductor` integration reaches into `app/mesh`'s registry today
 * (see executor.ts's module comment). This module exists so that whenever
 * such a caller does exist, populating the registry is one call rather
 * than four separate imports scattered across the codebase.
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
