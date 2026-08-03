/**
 * platform/gateway — server-side model provider abstraction.
 *
 * Spec: docs/04-architecture/41-AI-ARCHITECTURE.md,
 *       docs/01-product/13-MODULE-SPECIFICATIONS.md `platform/gateway`.
 *
 * This is deliberately distinct from src/services/aiGateway.ts, which is a
 * BROWSER module that posts to /api/generate. platform/gateway runs in the
 * service tier (Node) and is what server-side app/* modules — the Studio,
 * the Mesh, the Rubric's extraction agent — call directly. It never bypasses
 * the Warden: every call to complete()/stream() evaluates egress policy
 * first and refuses to proceed on anything but "allow".
 */

import type { TaskClass } from "../warden/types";

export interface CompletionRequest {
  taskClass: TaskClass;
  /** Provider id from src/config/providerCatalog.ts, e.g. "openai", "anthropic". */
  provider: string;
  apiKey: string;
  model?: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Egress classification inputs — what the Warden sees before this call is
   * allowed to leave. Callers MUST break their payload into labelled
   * segments (docs 41-AI-ARCHITECTURE.md §5.4 egress preview) rather than
   * pass one opaque blob, so classification and minimisation are meaningful.
   */
  segments: { label: string; text: string }[];
  scopeId?: string;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
  latencyMs: number;
}

export interface GatewayDeniedError {
  kind: "gateway_denied";
  reason: string;
  requiresConsent: boolean;
}

export class GatewayDenied extends Error {
  readonly requiresConsent: boolean;
  constructor(reason: string, requiresConsent: boolean) {
    super(reason);
    this.name = "GatewayDenied";
    this.requiresConsent = requiresConsent;
  }
}

/** One provider's calling convention. Adding a provider = one adapter + a registry entry. */
export interface ProviderAdapter {
  id: string;
  complete(req: CompletionRequest): Promise<{ text: string; model: string }>;
}
