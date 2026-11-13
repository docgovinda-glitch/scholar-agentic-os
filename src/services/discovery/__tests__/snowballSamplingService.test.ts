import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildInitialCitationGraph,
  fetchBackwardCitations,
  fetchForwardCitations,
  performSnowballExpansion,
  analyzeGraphTopology,
  layoutForceDirectedGraph,
  exportGraphToJson,
  exportGraphToBibtex,
  exportGraphToGraphML,
  type CitationGraphNode,
  type CitationGraphEdge,
} from "../snowballSamplingService";

describe("snowballSamplingService", () => {
  const sampleSeeds = [
    {
      title: "Attention Is All You Need",
      authors: ["Vaswani, A.", "Shazeer, N."],
      year: 2017,
      doi: "10.48550/arXiv.1706.03762",
      citationCount: 95000,
      journal: "NeurIPS",
    },
    {
      title: "BERT: Pre-training of Deep Bidirectional Transformers",
      authors: ["Devlin, J.", "Chang, M."],
      year: 2018,
      doi: "10.18653/v1/N19-1423",
      citationCount: 65000,
      journal: "NAACL",
    },
    {
      title: "Language Models are Few-Shot Learners",
      authors: ["Brown, T.", "Mann, B."],
      year: 2020,
      doi: "10.48550/arXiv.2005.14165",
      citationCount: 22000,
      journal: "NeurIPS",
    },
  ];

  it("builds an initial citation graph with landmarks, clusters, and edges", () => {
    const graph = buildInitialCitationGraph(sampleSeeds);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.seedIds).toHaveLength(3);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.landmarkIds.length).toBeGreaterThan(0);
    expect(graph.clusters.length).toBeGreaterThan(0);

    const firstNode = graph.nodes[0];
    expect(firstNode.isLandmark).toBe(true);
    expect(firstNode.nodeType).toBe("seed");
    expect(firstNode.depth).toBe(0);
  });

  it("never invents papers when the citation index is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const seed = buildInitialCitationGraph([sampleSeeds[0]]).nodes[0];

    expect(await fetchBackwardCitations(seed, 4)).toEqual([]);
    expect(await fetchForwardCitations(seed, 4)).toEqual([]);

    const initialGraph = buildInitialCitationGraph(sampleSeeds);
    const expanded = await performSnowballExpansion(initialGraph, initialGraph.nodes[0].id, { breadth: 6, direction: "bidirectional" });
    expect(expanded.nodes).toHaveLength(initialGraph.nodes.length);
    expect(expanded.edges).toHaveLength(initialGraph.edges.length);
    expect(expanded.lastExpandedNodeId).toBe(initialGraph.nodes[0].id);
    vi.restoreAllMocks();
  });

  it("analyzes graph topology, in-degree/out-degree, and research gaps", () => {
    const nodes: CitationGraphNode[] = [
      {
        id: "p1",
        title: "Theoretical Foundations of Causal Inference",
        authors: ["Pearl, J."],
        year: 2000,
        citationCount: 450,
        nodeType: "seed",
        depth: 0,
        inDegree: 0,
        outDegree: 0,
        isLandmark: true,
      },
      {
        id: "p2",
        title: "Empirical Trial of Causal Interventions",
        authors: ["Angrist, J."],
        year: 2015,
        citationCount: 210,
        nodeType: "discovered_forward",
        depth: 1,
        inDegree: 0,
        outDegree: 0,
        isLandmark: false,
      },
    ];

    const edges: CitationGraphEdge[] = [
      { id: "e1", source: "p2", target: "p1", type: "cites", weight: 1 },
    ];

    const { updatedNodes, clusters, landmarkIds } = analyzeGraphTopology(nodes, edges);

    const p1 = updatedNodes.find((n) => n.id === "p1");
    const p2 = updatedNodes.find((n) => n.id === "p2");

    expect(p1?.inDegree).toBe(1);
    expect(p2?.outDegree).toBe(1);
    expect(landmarkIds).toContain("p1");
    expect(clusters.length).toBeGreaterThanOrEqual(1);
  });

  it("simulates force-directed 2D layout without NaN coordinates", () => {
    const initialGraph = buildInitialCitationGraph(sampleSeeds);
    const positioned = layoutForceDirectedGraph(initialGraph.nodes, initialGraph.edges, 800, 600);

    expect(positioned).toHaveLength(3);
    for (const node of positioned) {
      expect(typeof node.x).toBe("number");
      expect(typeof node.y).toBe("number");
      expect(isNaN(node.x!)).toBe(false);
      expect(isNaN(node.y!)).toBe(false);
      expect(node.x!).toBeGreaterThan(0);
      expect(node.y!).toBeGreaterThan(0);
    }
  });

  it("exports graph data to valid JSON, BibTeX, and GraphML formats", () => {
    const initialGraph = buildInitialCitationGraph(sampleSeeds);

    const json = exportGraphToJson(initialGraph);
    expect(json).toContain('"totalNodes": 3');
    expect(JSON.parse(json).nodes).toHaveLength(3);

    const bibtex = exportGraphToBibtex(initialGraph);
    expect(bibtex).toContain("@article{");
    expect(bibtex).toContain("Attention Is All You Need");
    expect(bibtex).toContain("Vaswani, A.");

    const graphml = exportGraphToGraphML(initialGraph);
    expect(graphml).toContain("<graphml");
    expect(graphml).toContain("<graph id=\"CitationGraph\"");
    expect(graphml).toContain("</graphml>");
  });
});

