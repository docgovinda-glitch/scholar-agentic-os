import { describe, expect, it } from "vitest";
import { graphNodeLabel } from "../graphLabels";
import { layoutForceDirectedGraph, type CitationGraphNode } from "../snowballSamplingService";

describe("graphNodeLabel", () => {
  it("uses the family name in either order, never the first word", () => {
    expect(graphNodeLabel(["Ama Samarasinghe"], 2025)).toBe("Samarasinghe (2025)");
    expect(graphNodeLabel(["Samarasinghe, Ama"], 2025)).toBe("Samarasinghe (2025)");
    expect(graphNodeLabel(["Samarasinghe AB"], undefined)).toBe("Samarasinghe (n.d.)");
  });
  it("keeps an organisation's name", () => {
    expect(graphNodeLabel(["NBC News"], 2024)).toBe("NBC News (2024)");
  });
});

describe("layout spacing", () => {
  it("keeps node labels apart even when everything starts in the middle", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, title: `T${i}`, authors: [], depth: 0 })) as unknown as CitationGraphNode[];
    const placed = layoutForceDirectedGraph(nodes, [], 900, 560);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const dx = Math.abs(placed[i].x! - placed[j].x!);
        const dy = Math.abs(placed[i].y! - placed[j].y!);
        expect(dx >= 100 || dy >= 60).toBe(true);
      }
    }
  });
});
