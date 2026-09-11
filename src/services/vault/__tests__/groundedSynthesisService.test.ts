import { describe, it, expect } from "vitest";
import type { VaultItem } from "../../vaultContents";
import { askSelectedSources, SYNTHESIS_PRESETS } from "../groundedSynthesisService";

describe("groundedSynthesisService", () => {
  const mockVault: VaultItem[] = [
    {
      id: "src-1",
      title: "Sample Study on Latency",
      content: "This paper measures token latency across edge devices.",
      authors: ["Alice Adams"],
      year: "2024",
      metadata: {
        keyPoints: ["Edge inference achieved 14ms per token.", "Quantization preserved 98% accuracy."],
        notes: { whySaved: "Benchmark for hardware latency" },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "src-2",
      title: "Comparative Study on Memory Footprint",
      content: "This paper evaluates memory pressure under continuous generation.",
      authors: ["Bob Baker", "Charlie Clark"],
      year: "2023",
      metadata: {
        keyPoints: ["KV-cache compression reduced DRAM usage by 40%.", "Slight degradation under 8k context."],
        notes: { whySaved: "Memory optimization reference" },
      },
      createdAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "src-3",
      title: "Unrelated Third Paper",
      content: "Unselected paper in vault.",
      createdAt: "2026-01-03T00:00:00.000Z",
    },
  ];

  it("exports standard presets", () => {
    expect(SYNTHESIS_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(SYNTHESIS_PRESETS[0].label).toContain("Compare Methodologies");
  });

  it("rejects whole-vault query to enforce AI boundary", async () => {
    await expect(askSelectedSources(mockVault, ["src-1", "src-2", "src-3"], "Compare them")).rejects.toThrow(
      /selection covers the entire Vault/i
    );
  });

  it("synthesizes answer grounded in selected sources", async () => {
    const result = await askSelectedSources(mockVault, ["src-1", "src-2"], "What are the common findings?");
    expect(result.referencedSources).toHaveLength(2);
    expect(result.referencedSources[0].inTextCitation).toBe("Adams (2024)");
    expect(result.referencedSources[1].inTextCitation).toBe("Baker & Clark (2023)");
    expect(result.answer).toContain("Adams (2024)");
    expect(result.answer).toContain("Baker & Clark (2023)");
    expect(result.consensusDegree).toBeDefined();
  });
});
