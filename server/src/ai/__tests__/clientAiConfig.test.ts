import { describe, it, expect } from "vitest";
import { resolveClientAiConfig, NO_CREDENTIAL_PLACEHOLDER } from "../clientAiConfig.ts";
import { resolveRequestAiConfig } from "../../../utils/llm.ts";
import { extractTransientClientAiConfig } from "../../services/scholarBrain.ts";

const byok = { "x-ai-provider": "openai", "x-ai-model": "gpt-x", "x-ai-api-key": "sk-test-not-real" };

describe("resolveClientAiConfig (single AI header parser)", () => {
  it("builds one candidate from x-ai-* headers", () => {
    const cfg = resolveClientAiConfig(byok);
    expect(cfg.candidates).toEqual([{ provider: "openai", model: "gpt-x", apiKey: "sk-test-not-real", baseUrl: undefined }]);
  });

  it("accepts the legacy x-* aliases", () => {
    const cfg = resolveClientAiConfig({ "x-provider": "gemini", "x-api-key": "k" });
    expect(cfg.candidates[0]).toMatchObject({ provider: "gemini", apiKey: "k" });
  });

  it("returns no candidate without credentials, a base URL or a local provider", () => {
    expect(resolveClientAiConfig({ "x-ai-provider": "openai" }).candidates).toEqual([]);
    expect(resolveClientAiConfig({}).candidates).toEqual([]);
    expect(resolveClientAiConfig(undefined).candidates).toEqual([]);
  });

  it("lets local runners through without a key", () => {
    for (const provider of ["ollama", "lmstudio", "localai", "vllm"]) {
      const [c] = resolveClientAiConfig({ "x-ai-provider": provider }).candidates;
      expect(c).toMatchObject({ provider, apiKey: NO_CREDENTIAL_PLACEHOLDER });
    }
  });

  it("takes the first value of a repeated header and ignores empty strings", () => {
    const cfg = resolveClientAiConfig({ "x-ai-provider": ["anthropic", "openai"], "x-ai-api-key": "", "x-api-key": "k2" });
    expect(cfg.candidates[0]).toMatchObject({ provider: "anthropic", apiKey: "k2" });
  });

  it("lets explicit overrides win over headers", () => {
    const cfg = resolveClientAiConfig(byok, { model: "override-model" });
    expect(cfg.candidates[0].model).toBe("override-model");
  });

  it("never reads server environment keys", () => {
    const saved = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "server-key-must-not-be-used";
    try {
      expect(resolveClientAiConfig({ "x-ai-provider": "gemini" }).candidates).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = saved;
    }
  });

  it("llm.ts and scholarBrain now resolve identical candidates", () => {
    const cases = [byok, { "x-ai-provider": "ollama" }, { "x-ai-provider": "openai", "x-ai-base-url": "http://proxy.local" }, {}];
    for (const headers of cases) {
      expect(extractTransientClientAiConfig({ headers }).candidates).toEqual(resolveRequestAiConfig({ headers }).candidates);
    }
  });
});
