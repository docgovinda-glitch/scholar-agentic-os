/**
 * Maps every runner in `localRunnerCatalog.ts` onto the router's two local wire
 * protocols, so a new runner is one catalog entry and nothing else:
 *
 *   apiStyle "ollama-native"      → provider "ollama"   (`ollamaAdapter`, /api/chat)
 *   apiStyle "openai-compatible"  → provider "lmstudio" (`openAiCompatibleAdapter`, /chat/completions)
 *
 * `via` keeps the catalog id ("jan", "vllm", ...) so two runners never share a
 * candidate id, circuit or cache entry. A runner's address is the one the
 * person saved, else the catalog default; a public https address (a Cloudflare
 * Tunnel to a Kaggle/Colab/Modal GPU, a LiteLLM gateway) is reachable by the
 * server too, so such a runner is called from the server through the SSRF guard
 * instead of from the browser (whose CSP names only loopback runner ports).
 *
 * Pure: imported by the browser (keyring, routing) and the server (candidates).
 */
import { getLocalRunner, LOCAL_RUNNERS, resolveRunnerEndpoint } from "../../config/localRunnerCatalog";
import type { ProviderId } from "./types";

export type LocalWireProvider = Extract<ProviderId, "ollama" | "lmstudio">;

export interface LocalRunnerTarget {
  provider: LocalWireProvider;
  /** The catalog runner id. */
  via: string;
  baseUrl: string;
  name: string;
}

/** Catalog runner ids, in catalog order. */
export const LOCAL_RUNNER_IDS: readonly string[] = LOCAL_RUNNERS.map((r) => r.id);

export const isLocalRunnerId = (id: string): boolean => getLocalRunner(id) !== undefined;

/** The wire protocol a runner speaks, or undefined when `id` is not a catalog runner. */
export function localRunnerTarget(id: string, endpointOverride?: string): LocalRunnerTarget | undefined {
  const spec = getLocalRunner(id);
  if (!spec) return undefined;
  return {
    provider: spec.apiStyle === "ollama-native" ? "ollama" : "lmstudio",
    via: spec.id,
    baseUrl: resolveRunnerEndpoint(spec, endpointOverride),
    name: spec.name,
  };
}
