import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectUserOS,
  detectUserBrowser,
  getOllamaOriginSetupCommand,
  categorizeModel,
  isModelCloudRemote,
  parseOllamaModels,
  selectRecommendedModel,
  normalizeOllamaEndpoint,
  diagnoseOllamaConnection,
  generateDiagnosticReport,
  DEFAULT_OLLAMA_ENDPOINT,
} from "../ollamaService";

describe("ollamaService — Architecture, Parsing & Diagnostics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("URL normalization & environment commands", () => {
    it("normalizes blank, localhost, and custom endpoints", () => {
      expect(normalizeOllamaEndpoint("")).toBe(DEFAULT_OLLAMA_ENDPOINT);
      expect(normalizeOllamaEndpoint("localhost:11434")).toBe("http://localhost:11434");
      expect(normalizeOllamaEndpoint("http://127.0.0.1:11434/")).toBe("http://127.0.0.1:11434");
      expect(normalizeOllamaEndpoint("http://192.168.1.100:11434")).toBe("http://192.168.1.100:11434");
    });

    it("generates exact OS-tailored commands for OLLAMA_ORIGINS", () => {
      const origin = "https://scholar.gkshah.com.np";
      const macCmd = getOllamaOriginSetupCommand("macos", origin);
      expect(macCmd).toContain(`launchctl setenv OLLAMA_ORIGINS "${origin}"`);
      expect(macCmd).toContain("open -a Ollama");

      const linuxCmd = getOllamaOriginSetupCommand("linux", origin);
      expect(linuxCmd).toContain(`OLLAMA_ORIGINS="${origin}"`);

      const winCmd = getOllamaOriginSetupCommand("windows", origin);
      expect(winCmd).toContain(`setx OLLAMA_ORIGINS "${origin}"`);
    });
  });

  describe("Model parsing, categorization & recommendation", () => {
    it("categorizes coding, reasoning, vision, and general models accurately", () => {
      expect(categorizeModel("qwen2.5-coder:1.5b")).toBe("coding");
      expect(categorizeModel("deepseek-coder:1.3b")).toBe("coding");
      expect(categorizeModel("stable-code:3b-code-q4_0")).toBe("coding");
      expect(categorizeModel("deepseek-r1:8b")).toBe("reasoning");
      expect(categorizeModel("qwq:32b")).toBe("reasoning");
      expect(categorizeModel("llava:7b")).toBe("vision");
      expect(categorizeModel("llama3.1:8b")).toBe("general");
      expect(categorizeModel("mistral:7b")).toBe("general");
    });

    it("distinguishes local models from remote/cloud models", () => {
      expect(isModelCloudRemote("llama3:cloud", {})).toBe(true);
      expect(isModelCloudRemote("qwen2.5-coder:1.5b", { size: 1500000000, digest: "abc123" })).toBe(false);
      expect(isModelCloudRemote("remote-ptr", { size: 0, digest: "" })).toBe(true);
    });

    it("parses and enriches Ollama /api/tags payload", () => {
      const payload = {
        models: [
          {
            name: "qwen2.5-coder:1.5b",
            size: 986000000,
            digest: "sha256:d123456",
            details: { family: "qwen2", parameter_size: "1.5B", quantization_level: "Q4_K_M" },
          },
          {
            name: "deepseek-coder:1.3b",
            size: 780000000,
            digest: "sha256:d789012",
            details: { family: "deepseek", parameter_size: "1.3B", quantization_level: "Q4_0" },
          },
          {
            name: "stable-code:3b-code-q4_0",
            size: 1800000000,
            digest: "sha256:d345678",
            details: { family: "stable-code", parameter_size: "3B", quantization_level: "Q4_0" },
          },
        ],
      };

      const parsed = parseOllamaModels(payload);
      expect(parsed).toHaveLength(3);
      expect(parsed[0].name).toBe("qwen2.5-coder:1.5b");
      expect(parsed[0].category).toBe("coding");
      expect(parsed[0].isLocal).toBe(true);
      expect(parsed[0].formattedSize).toBe("940 MB");
    });

    it("recommends the highest-priority coding/academic model for Scholar Core", () => {
      const models = parseOllamaModels({
        models: [
          { name: "llama3.1:8b", size: 4500000000, digest: "abc" },
          { name: "qwen2.5-coder:1.5b", size: 986000000, digest: "def" },
          { name: "mistral:7b", size: 4000000000, digest: "ghi" },
        ],
      });

      const recommended = selectRecommendedModel(models);
      expect(recommended).toBe("qwen2.5-coder:1.5b");
    });
  });

  describe("diagnoseOllamaConnection & Reporting", () => {
    it("returns SUCCESS when Ollama is running and models are returned", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/version")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: "0.32.0" }),
          });
        }
        if (url.includes("/api/tags")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: "qwen2.5-coder:1.5b", size: 986000000, digest: "abc" }],
            }),
          });
        }
        return Promise.reject(new Error("unhandled url"));
      });

      globalThis.fetch = mockFetch;

      const diag = await diagnoseOllamaConnection("http://localhost:11434");
      expect(diag.ok).toBe(true);
      expect(diag.errorKind).toBe("SUCCESS");
      expect(diag.version).toBe("0.32.0");
      expect(diag.models).toHaveLength(1);
      expect(diag.recommendedModel).toBe("qwen2.5-coder:1.5b");
      expect(diag.checks.every((c) => c.status === "pass")).toBe(true);
    });

    it("generates markdown diagnostic report for developer support", () => {
      const dummyDiag = {
        ok: true,
        errorKind: "SUCCESS" as const,
        activeEndpoint: "http://localhost:11434",
        testedEndpoints: ["http://localhost:11434"],
        version: "0.32.0",
        models: [
          {
            name: "qwen2.5-coder:1.5b",
            model: "qwen2.5-coder:1.5b",
            size: 986000000,
            digest: "abc",
            isLocal: true,
            isCloud: false,
            category: "coding" as const,
            formattedSize: "940 MB",
          },
        ],
        recommendedModel: "qwen2.5-coder:1.5b",
        checks: [
          { id: "server", label: "Ollama server active", status: "pass" as const, detail: "Responding" },
        ],
        os: "macos" as const,
        browser: "chrome" as const,
        browserVersion: "130.0",
        currentOrigin: "https://scholar.gkshah.com.np",
        requiredOriginCommand: 'launchctl setenv OLLAMA_ORIGINS "https://scholar.gkshah.com.np"',
        guidance: "Connected to Ollama",
        actionableSteps: [],
        latencyMs: 14,
      };

      const report = generateDiagnosticReport(dummyDiag);
      expect(report).toContain("Scholar Core — Ollama Diagnostics Report");
      expect(report).toContain("https://scholar.gkshah.com.np");
      expect(report).toContain("qwen2.5-coder:1.5b");
      expect(report).toContain("launchctl setenv OLLAMA_ORIGINS");
    });
  });
});
