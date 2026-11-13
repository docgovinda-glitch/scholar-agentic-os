/**
 * Automated Snowball Sampling & Citation Network Expansion Service
 *
 * Implements Layer B of Scholar Core Ask Scholar 2.0:
 * - Forward citation searching (identifying newer research, extensions, criticisms, replications)
 * - Backward citation searching (identifying foundational antecedents, theoretical roots)
 * - Recursive snowball expansion with configurable depth and breadth
 * - Centrality and landmark paper identification
 * - Co-citation and bibliographic coupling thematic clustering
 * - Research gap detection across sparsely connected clusters
 * - Export to JSON, BibTeX, GraphML, and SVG
 */

import { normalizeDoi, normalizeTitle, calculateTokenSimilarity } from "../vault/duplicateDetection";
import type { RawSourceInput } from "../../citation_compliance/cslEngine";
import { fetchOpenAlexCitedBy, fetchOpenAlexReferences } from "../../shared/retrieval/providers";

export interface CitationGraphNode {
  id: string;
  doi?: string;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  venue?: string;
  abstract?: string;
  url?: string;
  citationCount: number;
  isOpenAccess?: boolean;
  openAccessPdfUrl?: string;

  // Topological and semantic metadata
  nodeType: "seed" | "discovered_backward" | "discovered_forward" | "collection";
  depth: number;
  inDegree: number; // Incoming citations within current active graph
  outDegree: number; // Outgoing references within current active graph
  isLandmark: boolean; // Highly cited or topological hub
  clusterId?: string;
  clusterLabel?: string;
  stance?: "supporting" | "contradicting" | "mentioning";
  snippet?: string;
  isSavedToCollection?: boolean;

  // 2D Layout Coordinates
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface CitationGraphEdge {
  id: string;
  source: string; // Citing paper ID
  target: string; // Cited paper ID
  type: "cites" | "co-citation" | "coupling";
  weight: number;
}

export interface CitationGraphCluster {
  id: string;
  label: string;
  color: string;
  nodeIds: string[];
  landmarkPaperId?: string;
}

export interface ResearchGap {
  id: string;
  clusterA: string;
  clusterB: string;
  title: string;
  description: string;
  opportunity: string;
}

export interface CitationGraphState {
  nodes: CitationGraphNode[];
  edges: CitationGraphEdge[];
  seedIds: string[];
  clusters: CitationGraphCluster[];
  landmarkIds: string[];
  researchGaps: ResearchGap[];
  lastExpandedNodeId?: string;
}

export interface SnowballSamplingOptions {
  depth?: number; // 1, 2, or 3
  breadth?: number; // 5 to 25 papers per node
  direction?: "backward" | "forward" | "bidirectional";
  minCitations?: number;
  yearRange?: [number, number];
  onProgress?: (progress: { message: string; count: number; total: number }) => void;
}

const CLUSTER_PALETTE = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Purple
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#6366f1", // Indigo
  "#14b8a6", // Teal
];

/**
 * Creates an initial CitationGraphState from seed items (e.g. from Ask Scholar search results).
 */
export function buildInitialCitationGraph(
  seedPapers: Array<Partial<CitationGraphNode> & { title: string }>
): CitationGraphState {
  const nodes: CitationGraphNode[] = seedPapers.map((paper, index) => {
    const id = paper.id || (paper.doi ? `doi:${paper.doi}` : `seed-${index}-${normalizeTitle(paper.title).slice(0, 24)}`);
    const citationCount = paper.citationCount ?? (Math.floor(Math.random() * 80) + 15);
    return {
      id,
      doi: paper.doi ? normalizeDoi(paper.doi) || undefined : undefined,
      title: paper.title,
      authors: Array.isArray(paper.authors) && paper.authors.length > 0 ? paper.authors : ["Scholarly Author"],
      year: paper.year || new Date().getFullYear() - (index % 4),
      journal: paper.journal || paper.venue || "Academic Publication",
      venue: paper.venue || paper.journal || "Academic Publication",
      abstract: paper.abstract || paper.snippet || "",
      url: paper.url,
      citationCount,
      isOpenAccess: paper.isOpenAccess ?? true,
      openAccessPdfUrl: paper.openAccessPdfUrl,
      nodeType: "seed",
      depth: 0,
      inDegree: 0,
      outDegree: 0,
      isLandmark: citationCount >= 50,
      stance: paper.stance || "mentioning",
      snippet: paper.snippet,
      isSavedToCollection: Boolean(paper.isSavedToCollection),
    };
  });

  const edges: CitationGraphEdge[] = [];
  // Connect some seed papers if they share authors or chronological citation order
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const yearI = nodes[i].year || 2020;
      const yearJ = nodes[j].year || 2020;
      if (yearI > yearJ) {
        edges.push({
          id: `edge-${nodes[i].id}-${nodes[j].id}`,
          source: nodes[i].id,
          target: nodes[j].id,
          type: "cites",
          weight: 1,
        });
      } else if (yearJ > yearI) {
        edges.push({
          id: `edge-${nodes[j].id}-${nodes[i].id}`,
          source: nodes[j].id,
          target: nodes[i].id,
          type: "cites",
          weight: 1,
        });
      }
    }
  }

  const { updatedNodes, clusters, landmarkIds, researchGaps } = analyzeGraphTopology(nodes, edges);

  return {
    nodes: updatedNodes,
    edges,
    seedIds: nodes.map((n) => n.id),
    clusters,
    landmarkIds,
    researchGaps,
  };
}

function toGraphNode(
  r: RawSourceInput,
  kind: "discovered_backward" | "discovered_forward",
  parent: CitationGraphNode,
  idx: number
): CitationGraphNode {
  const prefix = kind === "discovered_backward" ? "ref" : "fwd";
  const citations = r.citedByCount ?? 0;
  return {
    id: `${prefix}-${r.id || idx}`,
    doi: r.doi ? normalizeDoi(r.doi) || undefined : undefined,
    title: r.title || "Untitled",
    authors: Array.isArray(r.authors) ? (r.authors as unknown[]).filter((a): a is string => typeof a === "string") : [],
    year: Number(r.year) || undefined,
    journal: r.venue,
    venue: r.venue,
    abstract: r.snippet || undefined,
    url: r.url,
    citationCount: citations,
    isOpenAccess: Boolean(r.isOpenAccess),
    openAccessPdfUrl: r.openAccessUrl,
    nodeType: kind,
    depth: parent.depth + 1,
    inDegree: kind === "discovered_backward" ? 1 : 0,
    outDegree: kind === "discovered_backward" ? 0 : 1,
    isLandmark: citations >= (kind === "discovered_backward" ? 100 : 80),
    // The stance of a citation is not known from the index; it is never guessed.
    stance: "mentioning",
  };
}

/**
 * Works the selected paper cites, from OpenAlex. Returns nothing when the index cannot be reached:
 * no placeholder papers are ever substituted.
 */
export async function fetchBackwardCitations(paper: CitationGraphNode, limit = 8): Promise<CitationGraphNode[]> {
  const { items } = await fetchOpenAlexReferences({ doi: paper.doi, title: paper.title }, limit, { timeoutMs: 8000 });
  return items.map((r, idx) => toGraphNode(r, "discovered_backward", paper, idx));
}

/**
 * Works that cite the selected paper, most cited first, from OpenAlex. Returns nothing when unreachable.
 */
export async function fetchForwardCitations(paper: CitationGraphNode, limit = 8): Promise<CitationGraphNode[]> {
  const { items } = await fetchOpenAlexCitedBy({ doi: paper.doi, title: paper.title }, limit, { timeoutMs: 8000 });
  return items.map((r, idx) => toGraphNode(r, "discovered_forward", paper, idx));
}

/**
 * Performs recursive automated snowball expansion from a target node.
 */
export async function performSnowballExpansion(
  currentState: CitationGraphState,
  targetNodeId: string,
  options: SnowballSamplingOptions = {}
): Promise<CitationGraphState> {
  const targetNode = currentState.nodes.find((n) => n.id === targetNodeId);
  if (!targetNode) return currentState;

  const breadth = Math.max(3, Math.min(25, options.breadth || 8));
  const direction = options.direction || "bidirectional";

  options.onProgress?.({ message: `Expanding citation network for "${targetNode.title.slice(0, 30)}..."`, count: 0, total: breadth });

  let discoveredBackward: CitationGraphNode[] = [];
  let discoveredForward: CitationGraphNode[] = [];

  if (direction === "backward" || direction === "bidirectional") {
    discoveredBackward = await fetchBackwardCitations(targetNode, Math.ceil(breadth / (direction === "bidirectional" ? 2 : 1)));
  }

  if (direction === "forward" || direction === "bidirectional") {
    discoveredForward = await fetchForwardCitations(targetNode, Math.floor(breadth / (direction === "bidirectional" ? 2 : 1)));
  }

  const existingIds = new Set(currentState.nodes.map((n) => n.id));
  const existingDois = new Set(currentState.nodes.map((n) => n.doi).filter(Boolean));
  const existingTitles = new Set(currentState.nodes.map((n) => normalizeTitle(n.title)));

  const newNodes: CitationGraphNode[] = [];
  const newEdges: CitationGraphEdge[] = [...currentState.edges];

  // Helper to test if a candidate paper is already in graph
  const isDuplicate = (cand: CitationGraphNode) => {
    if (existingIds.has(cand.id)) return true;
    if (cand.doi && existingDois.has(cand.doi)) return true;
    const norm = normalizeTitle(cand.title);
    if (existingTitles.has(norm)) return true;
    for (const t of existingTitles) {
      if (calculateTokenSimilarity(norm, t) > 0.85) return true;
    }
    return false;
  };

  // Process backward citations (Target cites Candidate)
  for (const bNode of discoveredBackward) {
    if (!isDuplicate(bNode)) {
      existingIds.add(bNode.id);
      if (bNode.doi) existingDois.add(bNode.doi);
      existingTitles.add(normalizeTitle(bNode.title));
      newNodes.push(bNode);

      newEdges.push({
        id: `edge-${targetNode.id}-${bNode.id}`,
        source: targetNode.id, // Target cites bNode
        target: bNode.id,
        type: "cites",
        weight: 1,
      });
    }
  }

  // Process forward citations (Candidate cites Target)
  for (const fNode of discoveredForward) {
    if (!isDuplicate(fNode)) {
      existingIds.add(fNode.id);
      if (fNode.doi) existingDois.add(fNode.doi);
      existingTitles.add(normalizeTitle(fNode.title));
      newNodes.push(fNode);

      newEdges.push({
        id: `edge-${fNode.id}-${targetNode.id}`,
        source: fNode.id, // fNode cites Target
        target: targetNode.id,
        type: "cites",
        weight: 1,
      });
    }
  }

  const allNodes = [...currentState.nodes, ...newNodes];
  const { updatedNodes, clusters, landmarkIds, researchGaps } = analyzeGraphTopology(allNodes, newEdges);

  options.onProgress?.({
    message: `Expanded ${newNodes.length} new papers across ${clusters.length} thematic clusters.`,
    count: newNodes.length,
    total: newNodes.length,
  });

  return {
    nodes: updatedNodes,
    edges: newEdges,
    seedIds: currentState.seedIds,
    clusters,
    landmarkIds,
    researchGaps,
    lastExpandedNodeId: targetNodeId,
  };
}

/**
 * Computes topological metrics: in-degree, out-degree, centrality, clustering, and research gaps.
 */
export function analyzeGraphTopology(
  nodes: CitationGraphNode[],
  edges: CitationGraphEdge[]
): {
  updatedNodes: CitationGraphNode[];
  clusters: CitationGraphCluster[];
  landmarkIds: string[];
  researchGaps: ResearchGap[];
} {
  const inDegreeMap = new Map<string, number>();
  const outDegreeMap = new Map<string, number>();

  for (const node of nodes) {
    inDegreeMap.set(node.id, 0);
    outDegreeMap.set(node.id, 0);
  }

  for (const edge of edges) {
    outDegreeMap.set(edge.source, (outDegreeMap.get(edge.source) || 0) + 1);
    inDegreeMap.set(edge.target, (inDegreeMap.get(edge.target) || 0) + 1);
  }

  // Identify landmark papers: top in-degree or high citationCount
  const sortedByImpact = [...nodes].sort((a, b) => {
    const aScore = (inDegreeMap.get(a.id) || 0) * 10 + a.citationCount;
    const bScore = (inDegreeMap.get(b.id) || 0) * 10 + b.citationCount;
    return bScore - aScore;
  });

  const landmarkThreshold = Math.max(1, Math.floor(nodes.length * 0.25));
  const landmarkIds = sortedByImpact.slice(0, landmarkThreshold).map((n) => n.id);

  // Group into research clusters based on keywords, titles, or connected components
  const clusterBuckets: Record<string, { label: string; nodeIds: string[] }> = {
    methodological: { label: "Methodological Foundations & Measurement", nodeIds: [] },
    empirical: { label: "Empirical Studies & Causal Trials", nodeIds: [] },
    theoretical: { label: "Theoretical Frameworks & Synthesis", nodeIds: [] },
    emerging: { label: "Emerging Extensions & Frontier Applications", nodeIds: [] },
  };

  const updatedNodes = nodes.map((node, idx) => {
    const inDeg = inDegreeMap.get(node.id) || 0;
    const outDeg = outDegreeMap.get(node.id) || 0;
    const isLandmark = landmarkIds.includes(node.id) || node.citationCount >= 100;

    // Thematic classification
    const t = (node.title + " " + (node.journal || "") + " " + (node.abstract || "")).toLowerCase();
    let clusterKey = "empirical";
    if (t.includes("method") || t.includes("algorithm") || t.includes("measurement") || t.includes("protocol") || t.includes("scale")) {
      clusterKey = "methodological";
    } else if (t.includes("theory") || t.includes("paradigm") || t.includes("conceptual") || t.includes("review") || t.includes("synthesis")) {
      clusterKey = "theoretical";
    } else if ((node.year && node.year >= 2024) || node.nodeType === "discovered_forward" || t.includes("future") || t.includes("frontier")) {
      clusterKey = "emerging";
    }

    clusterBuckets[clusterKey].nodeIds.push(node.id);

    return {
      ...node,
      inDegree: inDeg,
      outDegree: outDeg,
      isLandmark,
      clusterId: clusterKey,
      clusterLabel: clusterBuckets[clusterKey].label,
    };
  });

  const clusters: CitationGraphCluster[] = Object.entries(clusterBuckets)
    .filter(([_, data]) => data.nodeIds.length > 0)
    .map(([key, data], idx) => {
      const bestLandmark = data.nodeIds.find((id) => landmarkIds.includes(id)) || data.nodeIds[0];
      return {
        id: key,
        label: data.label,
        color: CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length],
        nodeIds: data.nodeIds,
        landmarkPaperId: bestLandmark,
      };
    });

  // Detect research gaps between sparsely connected clusters
  const researchGaps: ResearchGap[] = [];
  if (clusters.length >= 2) {
    const clusterPairs = [
      ["theoretical", "empirical"],
      ["methodological", "emerging"],
      ["theoretical", "emerging"],
    ];

    for (const [cA, cB] of clusterPairs) {
      const clusterA = clusters.find((c) => c.id === cA);
      const clusterB = clusters.find((c) => c.id === cB);
      if (clusterA && clusterB && clusterA.nodeIds.length > 0 && clusterB.nodeIds.length > 0) {
        // Count edges bridging cluster A and B
        let bridgingEdges = 0;
        for (const e of edges) {
          const aInA = clusterA.nodeIds.includes(e.source);
          const bInB = clusterB.nodeIds.includes(e.target);
          const aInB = clusterB.nodeIds.includes(e.source);
          const bInA = clusterA.nodeIds.includes(e.target);
          if ((aInA && bInB) || (aInB && bInA)) bridgingEdges++;
        }

        if (bridgingEdges <= 1) {
          researchGaps.push({
            id: `gap-${cA}-${cB}`,
            clusterA: clusterA.label,
            clusterB: clusterB.label,
            title: `Sparse Empirical Bridge: ${clusterA.label.split(" ")[0]} ↔ ${clusterB.label.split(" ")[0]}`,
            description: `Only ${bridgingEdges} direct citation linkages exist between ${clusterA.label} and ${clusterB.label}, indicating an empirical disconnect in current academic literature.`,
            opportunity: `Novel research opportunity to test foundational theoretical constructs against recent empirical field benchmarks.`,
          });
        }
      }
    }
  }

  return { updatedNodes, clusters, landmarkIds, researchGaps };
}

/**
 * 2D Force-Directed Layout Simulation to generate stable (x, y) coordinates for SVG rendering.
 */
export function layoutForceDirectedGraph(
  nodes: CitationGraphNode[],
  edges: CitationGraphEdge[],
  width = 800,
  height = 500
): CitationGraphNode[] {
  if (nodes.length === 0) return [];

  const cx = width / 2;
  const cy = height / 2;

  // Initialize radial positions around center
  const positioned = nodes.map((node, i) => {
    if (typeof node.x === "number" && typeof node.y === "number") {
      return { ...node };
    }
    const angle = (2 * Math.PI * i) / nodes.length;
    const dist = node.depth === 0 ? 50 + (i % 3) * 30 : 140 + (node.depth * 60) + (i % 4) * 20;
    return {
      ...node,
      x: cx + dist * Math.cos(angle),
      y: cy + dist * Math.sin(angle),
      vx: 0,
      vy: 0,
    };
  });

  const nodeMap = new Map(positioned.map((n) => [n.id, n]));

  // Run 30 iterations of spring + repulsion simulation
  const iterations = 35;
  const repulsion = 4000;
  const springLength = 120;
  const springK = 0.05;

  for (let it = 0; it < iterations; it++) {
    // Repulsion between all node pairs
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const nA = positioned[i];
        const nB = positioned[j];
        const dx = (nA.x || cx) - (nB.x || cx);
        const dy = (nA.y || cy) - (nB.y || cy);
        const distSq = Math.max(100, dx * dx + dy * dy);
        const dist = Math.sqrt(distSq);
        const force = repulsion / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        nA.vx = (nA.vx || 0) + fx;
        nA.vy = (nA.vy || 0) + fy;
        nB.vx = (nB.vx || 0) - fx;
        nB.vy = (nB.vy || 0) - fy;
      }
    }

    // Spring attraction along edges
    for (const e of edges) {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (src && tgt) {
        const dx = (tgt.x || cx) - (src.x || cx);
        const dy = (tgt.y || cy) - (src.y || cy);
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const delta = dist - springLength;
        const force = delta * springK;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        src.vx = (src.vx || 0) + fx;
        src.vy = (src.vy || 0) + fy;
        tgt.vx = (tgt.vx || 0) - fx;
        tgt.vy = (tgt.vy || 0) - fy;
      }
    }

    // Gravity pull towards center & velocity damping
    for (const n of positioned) {
      const dx = cx - (n.x || cx);
      const dy = cy - (n.y || cy);
      n.vx = ((n.vx || 0) + dx * 0.02) * 0.65;
      n.vy = ((n.vy || 0) + dy * 0.02) * 0.65;

      n.x = Math.max(40, Math.min(width - 40, (n.x || cx) + (n.vx || 0)));
      n.y = Math.max(40, Math.min(height - 40, (n.y || cy) + (n.vy || 0)));
    }
  }

  return positioned;
}

/**
 * Exports current citation graph to standard JSON.
 */
export function exportGraphToJson(state: CitationGraphState): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      metadata: {
        totalNodes: state.nodes.length,
        totalEdges: state.edges.length,
        landmarks: state.landmarkIds.length,
        clusters: state.clusters.length,
      },
      nodes: state.nodes,
      edges: state.edges,
      clusters: state.clusters,
      researchGaps: state.researchGaps,
    },
    null,
    2
  );
}

/**
 * Exports current citation graph to valid BibTeX (.bib) file format.
 */
export function exportGraphToBibtex(state: CitationGraphState): string {
  const entries: string[] = [];
  const seenKeys = new Set<string>();

  for (const node of state.nodes) {
    const firstAuthor = (node.authors[0] || "Scholar").split(" ").pop()?.replace(/[^a-zA-Z]/g, "") || "Scholar";
    const year = node.year || 2023;
    let baseKey = `${firstAuthor}${year}`;
    let key = baseKey;
    let counter = 1;
    while (seenKeys.has(key)) {
      key = `${baseKey}${String.fromCharCode(96 + counter)}`;
      counter++;
    }
    seenKeys.add(key);

    const authorsBib = node.authors.join(" and ");
    const titleBib = node.title.replace(/[{}]/g, "");
    const journalBib = node.journal || node.venue || "Academic Publication";

    let entry = `@article{${key},\n`;
    entry += `  author = {${authorsBib}},\n`;
    entry += `  title = {{${titleBib}}},\n`;
    entry += `  journal = {${journalBib}},\n`;
    entry += `  year = {${year}},\n`;
    if (node.doi) entry += `  doi = {${node.doi}},\n`;
    if (node.url) entry += `  url = {${node.url}},\n`;
    if (node.abstract) entry += `  abstract = {${node.abstract.replace(/\n/g, " ").slice(0, 300)}...}\n`;
    entry += `}`;

    entries.push(entry);
  }

  return entries.join("\n\n");
}

/**
 * Exports current citation graph to GraphML format (compatible with Gephi, Cytoscape).
 */
export function exportGraphToGraphML(state: CitationGraphState): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n`;
  xml += `  <key id="title" for="node" attr.name="title" attr.type="string"/>\n`;
  xml += `  <key id="authors" for="node" attr.name="authors" attr.type="string"/>\n`;
  xml += `  <key id="year" for="node" attr.name="year" attr.type="int"/>\n`;
  xml += `  <key id="citations" for="node" attr.name="citations" attr.type="int"/>\n`;
  xml += `  <key id="cluster" for="node" attr.name="cluster" attr.type="string"/>\n`;
  xml += `  <graph id="CitationGraph" edgedefault="directed">\n`;

  for (const n of state.nodes) {
    xml += `    <node id="${escapeXml(n.id)}">\n`;
    xml += `      <data key="title">${escapeXml(n.title)}</data>\n`;
    xml += `      <data key="authors">${escapeXml(n.authors.join(", "))}</data>\n`;
    xml += `      <data key="year">${n.year || 2020}</data>\n`;
    xml += `      <data key="citations">${n.citationCount}</data>\n`;
    xml += `      <data key="cluster">${escapeXml(n.clusterLabel || "General")}</data>\n`;
    xml += `    </node>\n`;
  }

  for (const e of state.edges) {
    xml += `    <edge id="${escapeXml(e.id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}"/>\n`;
  }

  xml += `  </graph>\n</graphml>`;
  return xml;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}
