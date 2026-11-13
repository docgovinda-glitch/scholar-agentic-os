import { configureRouterBridge } from "../src/ai/routerBridge.ts";
import { CircuitBreaker, MemoryBreakerStore } from "../../src/platform/router/circuitBreaker.ts";
import type { AdapterChunk, ProviderAdapter } from "../../src/platform/router/types.ts";

const ROUTER_ID: Record<string, string> = { gemini: "google", claude: "anthropic" };

/** The `x-ai-keyring` header a client sends for one connected AI. */
export function keyringHeader(provider: string, model = "test-model", apiKey?: string, baseUrl?: string): Record<string, string> {
  const entry = { provider: ROUTER_ID[provider] ?? provider, model, ...(apiKey ? { apiKey } : {}), ...(baseUrl ? { baseUrl } : {}) };
  return { "x-ai-keyring": Buffer.from(JSON.stringify([entry])).toString("base64url") };
}

/** One connected cloud AI, as a request carries it. */
export const AI_HEADERS = keyringHeader("openai", "test-model", "sk-test");

/**
 * Provider adapter that answers from `global.fetch`, so a route test can keep
 * mocking the provider's reply ({ choices: [{ message: { content } }] }) and
 * still go through the real router and route handlers.
 */
export function fetchBackedAdapter(): ProviderAdapter {
  return {
    async *stream(_c, req): AsyncGenerator<AdapterChunk> {
      const res = await fetch("https://provider.test/v1/chat/completions", { method: "POST", body: JSON.stringify(req.messages) });
      if (!res.ok) throw Object.assign(new Error(`Provider error ${res.status}`), { status: res.status });
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (text) yield { type: "text", text };
      yield { type: "finish", reason: "stop" };
    },
  };
}

/** Routes every cloud provider through `fetchBackedAdapter` with a fresh circuit breaker. */
export function useFetchBackedAi(): void {
  const a = fetchBackedAdapter();
  configureRouterBridge({ adapters: { openai: a, anthropic: a, google: a, groq: a, deepseek: a, mistral: a, custom: a }, breaker: new CircuitBreaker(new MemoryBreakerStore()) });
}
