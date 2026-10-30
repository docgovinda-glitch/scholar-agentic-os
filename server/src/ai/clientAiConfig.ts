import type { CandidateProvider } from "../../../src/platform/gateway/types.ts";
import { LOCAL_RUNNERS } from "../../../src/config/localRunnerCatalog.ts";

/** Transient AI settings a client sends with one request (never stored). */
export interface ClientAiSettings {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ClientAiConfig extends ClientAiSettings {
  candidates: CandidateProvider[];
  /**
   * The user's AI is a model on their own computer, which this server cannot
   * reach. The request can only be answered by running the prompt in the
   * browser (the 426 requireFrontendLLM flow).
   */
  localModelBrowserOnly: boolean;
}

type HeaderBag = Record<string, string | string[] | undefined> | undefined;

/** Providers that run on the user's own machine and need no API key (the local-runner catalog). */
export const LOCAL_AI_PROVIDERS: ReadonlySet<string> = new Set(LOCAL_RUNNERS.map((r) => r.id));

/**
 * A deployed server can never reach a model on the user's computer: its own
 * "localhost" is the server. Only a server running on the user's machine
 * (development) can, or one explicitly configured with ALLOW_SERVER_LOCAL_AI.
 */
export function serverCanReachLocalModels(): boolean {
  if (process.env.ALLOW_SERVER_LOCAL_AI === "true") return true;
  if (process.env.ALLOW_SERVER_LOCAL_AI === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** Placeholder key for providers that need none (matches the browser client). */
export const NO_CREDENTIAL_PLACEHOLDER = "local-no-credential-required";

function header(headers: HeaderBag, name: string): string | undefined {
  const value = headers?.[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.length > 0 ? first : undefined;
}

/**
 * The single parser for client-owned AI credentials (B3 step 1).
 * Reads x-ai-* headers (legacy x-* aliases accepted); explicit overrides win.
 * Never reads server env keys and never persists anything.
 */
export function resolveClientAiConfig(headers: HeaderBag, overrides?: ClientAiSettings): ClientAiConfig {
  const provider = overrides?.provider || header(headers, "x-ai-provider") || header(headers, "x-provider");
  const model = overrides?.model || header(headers, "x-ai-model") || header(headers, "x-model");
  const apiKey = overrides?.apiKey || header(headers, "x-ai-api-key") || header(headers, "x-api-key");
  const baseUrl = overrides?.baseUrl || header(headers, "x-ai-base-url") || header(headers, "x-base-url");

  const candidates: CandidateProvider[] = [];
  const isLocal = Boolean(provider && LOCAL_AI_PROVIDERS.has(provider));
  if (isLocal && !serverCanReachLocalModels()) {
    return { provider, model, apiKey, baseUrl, candidates, localModelBrowserOnly: true };
  }
  if (provider && (apiKey || baseUrl || isLocal)) {
    candidates.push({
      provider: provider as CandidateProvider["provider"],
      model: model || undefined,
      apiKey: apiKey || NO_CREDENTIAL_PLACEHOLDER,
      baseUrl: baseUrl || undefined,
    });
  }
  return { provider, model, apiKey, baseUrl, candidates, localModelBrowserOnly: false };
}
