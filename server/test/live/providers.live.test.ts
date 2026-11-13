/**
 * Live provider checks. They call the real provider APIs with keys taken from
 * the environment, so they cost a few cents and run only for providers whose
 * key is set; with no keys the whole file is skipped. Keys are never printed.
 *
 *   OPENAI_API_KEY  ANTHROPIC_API_KEY  GEMINI_API_KEY  GROQ_API_KEY
 *   DEEPSEEK_API_KEY  MISTRAL_API_KEY
 *
 * They also need LIVE_PROVIDER_TESTS=1, so a key in your .env never makes
 * `npm test` spend money.
 *
 * Run: LIVE_PROVIDER_TESTS=1 npx vitest run server/test/live
 * What they prove, per provider: the live model list works and curates to
 * something usable; a real request answers through the router; a rejected key
 * is reported as a key problem and the next key takes over.
 */
import { describe, it, expect } from "vitest";
import { route } from "../../../src/platform/router/router.ts";
import { CircuitBreaker, MemoryBreakerStore } from "../../../src/platform/router/circuitBreaker.ts";
import { listLiveModels } from "../../../src/platform/router/modelListers.ts";
import { curateModels } from "../../../src/platform/router/modelCuration.ts";
import type { Candidate, ProviderId, RouteRequest, RouterEvent } from "../../../src/platform/router/types.ts";
import { createAiFetch, serverAdapters } from "../../src/ai/aiEndpointGuard.ts";

const PROVIDERS: Array<{ id: ProviderId; env: string }> = [
  { id: "openai", env: "OPENAI_API_KEY" },
  { id: "anthropic", env: "ANTHROPIC_API_KEY" },
  { id: "google", env: "GEMINI_API_KEY" },
  { id: "groq", env: "GROQ_API_KEY" },
  { id: "deepseek", env: "DEEPSEEK_API_KEY" },
  { id: "mistral", env: "MISTRAL_API_KEY" },
];

const TIMEOUT = 60_000;
const LIVE = process.env.LIVE_PROVIDER_TESTS === "1";
const fetchImpl = createAiFetch();
const request = (): RouteRequest => ({
  requestId: "live", task: "fast", messages: [{ role: "user", content: "Reply with the single word OK." }], desiredOutputTokens: 64, minOutputTokens: 1,
});
async function run(chain: Candidate[]): Promise<RouterEvent[]> {
  const out: RouterEvent[] = [];
  for await (const ev of route(request(), chain, new AbortController().signal, {
    site: "server", adapters: serverAdapters(), breaker: new CircuitBreaker(new MemoryBreakerStore()), retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, maxWaitMs: 0 },
  })) out.push(ev);
  return out;
}
const candidate = (provider: ProviderId, model: string, apiKey: string): Candidate => ({
  id: `byok:${provider}:${model}:${apiKey.slice(-4)}`, lane: "byok", provider, model, label: `${model} (${provider})`,
  contextWindow: 32_000, maxOutputTokens: 1_024, runsIn: "server", credential: { apiKey },
});

for (const { id, env } of PROVIDERS) {
  const key = LIVE ? process.env[env] : undefined;
  describe.skipIf(!key)(`live: ${id}`, () => {
    it("lists models from the provider and curates them", async () => {
      const live = await listLiveModels(id, { apiKey: key, fetchImpl });
      expect(live.length).toBeGreaterThan(0);
      const curated = curateModels(id, live);
      expect(curated.length).toBeGreaterThan(0);
    }, TIMEOUT);

    it("answers a real request through the router", async () => {
      const curated = curateModels(id, await listLiveModels(id, { apiKey: key, fetchImpl }));
      const model = (curated.find((m) => m.tier === "fast") ?? curated[0]).id;
      const events = await run([candidate(id, model, key!)]);
      const done = events.find((e) => e.type === "done");
      expect(done, JSON.stringify(events.filter((e) => e.type === "error"))).toBeTruthy();
      expect(events.filter((e) => e.type === "token").map((e) => (e as { text: string }).text).join("").length).toBeGreaterThan(0);
    }, TIMEOUT);

    it("reports a rejected key as a key problem and rotates to the next key", async () => {
      const curated = curateModels(id, await listLiveModels(id, { apiKey: key, fetchImpl }));
      const model = (curated.find((m) => m.tier === "fast") ?? curated[0]).id;

      const onlyBad = await run([candidate(id, model, "invalid-key-for-test-0000")]);
      const failure = onlyBad.at(-1);
      expect(failure?.type).toBe("error");

      const rotated = await run([candidate(id, model, "invalid-key-for-test-0000"), candidate(id, model, key!)]);
      expect(rotated.some((e) => e.type === "fallback" && e.reason === "auth")).toBe(true);
      expect(rotated.at(-1)?.type).toBe("done");
    }, TIMEOUT);
  });
}

describe.skipIf(LIVE && PROVIDERS.some((p) => process.env[p.env]))("live providers", () => {
  it.skip("skipped: set LIVE_PROVIDER_TESTS=1 and at least one provider key to run", () => {});
});
