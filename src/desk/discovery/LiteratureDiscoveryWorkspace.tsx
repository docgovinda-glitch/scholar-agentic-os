import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Network,
  Sparkles,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Share2,
  BookmarkPlus,
  Check,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Layers,
  Filter,
  ExternalLink,
  BookOpen,
  HelpCircle,
  BarChart3,
  RefreshCw,
  X,
} from "lucide-react";
import {
  type CitationGraphNode,
  type CitationGraphEdge,
  type CitationGraphState,
  type CitationGraphCluster,
  type ResearchGap,
  buildInitialCitationGraph,
  performSnowballExpansion,
  layoutForceDirectedGraph,
  exportGraphToJson,
  exportGraphToBibtex,
  exportGraphToGraphML,
} from "../../services/discovery/snowballSamplingService";

export interface LiteratureDiscoveryWorkspaceProps {
  projectId?: string;
  seedPapers?: Array<Partial<CitationGraphNode> & { title: string }>;
  initialQuery?: string;
  onOpenEvidenceSynthesis?: (papers: CitationGraphNode[]) => void;
  onClose?: () => void;
  onSaveToVault?: (paper: CitationGraphNode) => void;
}

export default function LiteratureDiscoveryWorkspace({
  projectId,
  seedPapers = [],
  initialQuery = "",
  onOpenEvidenceSynthesis,
  onClose,
  onSaveToVault,
}: LiteratureDiscoveryWorkspaceProps) {
  // Graph state
  const [graphState, setGraphState] = useState<CitationGraphState>(() =>
    buildInitialCitationGraph(
      seedPapers.length > 0
        ? seedPapers
        : [
            {
              title: initialQuery || "Deep Empirical Foundations of Modern Artificial Intelligence Systems",
              authors: ["Vaswani, A.", "LeCun, Y.", "Bengio, Y."],
              year: 2021,
              journal: "Nature Machine Intelligence",
              citationCount: 420,
              doi: "10.1038/s42256-021-00389-9",
              abstract: "A comprehensive investigation into the scaling laws, causal reasoning capabilities, and empirical architectural boundaries of deep representation networks.",
            },
            {
              title: "Causal Inference and Empirical Counterfactual Modeling in Automated Decision Systems",
              authors: ["Pearl, J.", "Mackenzie, D."],
              year: 2019,
              journal: "Communications of the ACM",
              citationCount: 280,
              doi: "10.1145/3241036",
              abstract: "Formal structural equations establishing non-confounded causal DAG estimation across observational cohorts.",
            },
          ]
    )
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeClusterFilter, setActiveClusterFilter] = useState<string>("all");
  const [minCitations, setMinCitations] = useState<number>(0);
  const [isExpanding, setIsExpanding] = useState(false);
  const [snowballDirection, setSnowballDirection] = useState<"backward" | "forward" | "bidirectional">("bidirectional");
  const [snowballBreadth, setSnowballBreadth] = useState<number>(6);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [savedNodeIds, setSavedNodeIds] = useState<Set<string>>(new Set());
  const [selectedPaperIdsForSynthesis, setSelectedPaperIdsForSynthesis] = useState<Set<string>>(new Set());

  // Viewport transforms (Zoom & Pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Compute positioned nodes via force layout
  const positionedNodes = useMemo(() => {
    return layoutForceDirectedGraph(graphState.nodes, graphState.edges, 900, 560);
  }, [graphState.nodes, graphState.edges]);

  // Map for quick position lookups
  const nodePositionMap = useMemo(() => {
    const map = new Map<string, CitationGraphNode>();
    for (const n of positionedNodes) {
      map.set(n.id, n);
    }
    return map;
  }, [positionedNodes]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return positionedNodes.filter((node) => {
      if (activeClusterFilter !== "all" && node.clusterId !== activeClusterFilter) {
        return false;
      }
      if (node.citationCount < minCitations) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = node.title.toLowerCase().includes(q);
        const matchesAuthor = node.authors.some((a) => a.toLowerCase().includes(q));
        const matchesJournal = (node.journal || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesAuthor && !matchesJournal) return false;
      }
      return true;
    });
  }, [positionedNodes, activeClusterFilter, minCitations, searchQuery]);

  // Currently selected node object
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return positionedNodes[0] || null;
    return positionedNodes.find((n) => n.id === selectedNodeId) || positionedNodes[0] || null;
  }, [selectedNodeId, positionedNodes]);

  // Set default selection
  useEffect(() => {
    if (!selectedNodeId && positionedNodes.length > 0) {
      setSelectedNodeId(positionedNodes[0].id);
    }
  }, [positionedNodes, selectedNodeId]);

  // Snowball Expansion Handler
  const handleSnowballExpand = async (targetId?: string) => {
    const idToExpand = targetId || selectedNode?.id;
    if (!idToExpand || isExpanding) return;

    setIsExpanding(true);
    setStatusMessage("Harvesting forward and backward citation networks...");

    try {
      const nextState = await performSnowballExpansion(graphState, idToExpand, {
        breadth: snowballBreadth,
        direction: snowballDirection,
        onProgress: (p) => setStatusMessage(p.message),
      });

      setGraphState(nextState);
      setSelectedNodeId(idToExpand);
      setStatusMessage(`Expanded successfully: ${nextState.nodes.length} total papers catalogued.`);
    } catch {
      setStatusMessage("Snowball sampling encountered a network exception. Fallback synthesized.");
    } finally {
      setIsExpanding(false);
      setTimeout(() => setStatusMessage(""), 5000);
    }
  };

  const handleToggleSelectForSynthesis = (nodeId: string) => {
    setSelectedPaperIdsForSynthesis((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleSaveNode = (node: CitationGraphNode) => {
    setSavedNodeIds((prev) => new Set([...prev, node.id]));
    onSaveToVault?.(node);
  };

  const handleExport = (format: "json" | "bibtex" | "graphml") => {
    let content = "";
    let filename = `scholar_citation_network_${Date.now()}`;
    let mime = "text/plain";

    if (format === "json") {
      content = exportGraphToJson(graphState);
      filename += ".json";
      mime = "application/json";
    } else if (format === "bibtex") {
      content = exportGraphToBibtex(graphState);
      filename += ".bib";
      mime = "application/x-bibtex";
    } else if (format === "graphml") {
      content = exportGraphToGraphML(graphState);
      filename += ".graphml";
      mime = "application/xml";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleProceedToEvidenceSynthesis = () => {
    const selectedNodes =
      selectedPaperIdsForSynthesis.size > 0
        ? graphState.nodes.filter((n) => selectedPaperIdsForSynthesis.has(n.id))
        : graphState.nodes.slice(0, 8); // Default to top papers

    if (onOpenEvidenceSynthesis) {
      onOpenEvidenceSynthesis(selectedNodes);
    }
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(2.5, z + 0.2));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, z - 0.2));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  return (
    <div className="flex flex-col h-full bg-[color:var(--surface-canvas,#f8fafc)] dark:bg-[color:var(--surface-canvas,#090d16)] text-neutral-900 dark:text-neutral-100 overflow-hidden font-sans">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-white/10 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-neutral-900 dark:text-white leading-none">
                Literature Discovery Workspace
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300/40">
                Layer B · Citation Graph
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Automated Snowball Sampling, Citation Networks & Bibliographic Clustering
            </p>
          </div>
        </div>

        {/* Global Action Handlers */}
        <div className="flex items-center gap-2">
          {/* Export Dropdown */}
          <div className="relative group">
            <button
              type="button"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-neutral-500" />
              <span>Export Graph</span>
            </button>
            <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 shadow-lg py-1 z-30 hidden group-hover:block">
              <button
                type="button"
                onClick={() => handleExport("bibtex")}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-2"
              >
                <BookOpen className="w-3.5 h-3.5 text-sky-500" />
                <span>BibTeX (.bib)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport("json")}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-2"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>JSON Network Data</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport("graphml")}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-2"
              >
                <Network className="w-3.5 h-3.5 text-emerald-500" />
                <span>GraphML (Gephi / Cytoscape)</span>
              </button>
            </div>
          </div>

          {/* Proceed to Evidence Synthesis (Layer C) */}
          <button
            type="button"
            onClick={handleProceedToEvidenceSynthesis}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            title="Transfer discovered studies to Evidence Synthesis & Forest Plot Engine"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>
              Synthesize Evidence (
              {selectedPaperIdsForSynthesis.size > 0 ? selectedPaperIdsForSynthesis.size : graphState.nodes.length}
              )
            </span>
            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
              title="Close Workspace"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Secondary Controls Bar: Snowballing Controls, Filtering & Search */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-neutral-200/80 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.01] gap-3 text-xs flex-wrap shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search within graph */}
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter graph papers..."
              className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800/80 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Cluster filter */}
          <select
            value={activeClusterFilter}
            onChange={(e) => setActiveClusterFilter(e.target.value)}
            className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800/80 text-xs cursor-pointer focus:outline-hidden"
          >
            <option value="all">All Thematic Clusters ({graphState.clusters.length})</option>
            {graphState.clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.nodeIds.length})
              </option>
            ))}
          </select>

          {/* Min citations filter */}
          <select
            value={minCitations}
            onChange={(e) => setMinCitations(Number(e.target.value))}
            className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800/80 text-xs cursor-pointer focus:outline-hidden"
          >
            <option value={0}>All Citations</option>
            <option value={20}>20+ Citations</option>
            <option value={50}>50+ Citations (Landmarks)</option>
            <option value={100}>100+ Citations (Seminal)</option>
          </select>
        </div>

        {/* Snowball Sampling Action Trigger */}
        <div className="flex items-center gap-2">
          {/* Direction */}
          <div className="flex items-center rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 p-0.5">
            <button
              type="button"
              onClick={() => setSnowballDirection("backward")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                snowballDirection === "backward"
                  ? "bg-sky-500 text-white font-semibold"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
              title="Backward Citation Search (Foundations & References)"
            >
              Backward
            </button>
            <button
              type="button"
              onClick={() => setSnowballDirection("bidirectional")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                snowballDirection === "bidirectional"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
              title="Bidirectional Snowball Expansion"
            >
              Bidirectional
            </button>
            <button
              type="button"
              onClick={() => setSnowballDirection("forward")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                snowballDirection === "forward"
                  ? "bg-emerald-500 text-white font-semibold"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
              title="Forward Citation Search (Citing Works & Extensions)"
            >
              Forward
            </button>
          </div>

          {/* Breadth */}
          <select
            value={snowballBreadth}
            onChange={(e) => setSnowballBreadth(Number(e.target.value))}
            className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 text-[11px] cursor-pointer"
            title="Snowball expansion breadth per node"
          >
            <option value={4}>4 papers/node</option>
            <option value={6}>6 papers/node</option>
            <option value={10}>10 papers/node</option>
            <option value={15}>15 papers/node</option>
          </select>

          {/* 1-Click Snowball Button */}
          <button
            type="button"
            disabled={isExpanding || !selectedNode}
            onClick={() => handleSnowballExpand()}
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all ${
              isExpanding
                ? "bg-indigo-400 text-white cursor-wait"
                : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${isExpanding ? "animate-spin" : ""}`} />
            <span>{isExpanding ? "Snowballing..." : "Snowball Selected Node"}</span>
          </button>
        </div>
      </div>

      {/* Progress / Status Banner */}
      {statusMessage && (
        <div className="bg-indigo-50 dark:bg-indigo-950/60 border-b border-indigo-200 dark:border-indigo-800/40 px-5 py-1.5 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Main Content Area: SVG Graph Canvas + Detail Inspector Drawer */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* SVG Canvas Container */}
        <div
          className="flex-1 relative bg-white dark:bg-neutral-900 overflow-hidden cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Canvas Floating Controls */}
          <div className="absolute left-4 top-4 z-20 flex flex-col gap-1.5 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-md p-1.5 rounded-xl border border-neutral-200/80 dark:border-white/10 shadow-sm">
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 transition-colors"
              title="Reset View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Network Legend */}
          <div className="absolute left-4 bottom-4 z-20 flex items-center gap-3 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-neutral-200/80 dark:border-white/10 text-[10.5px] shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Seed Paper</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              <span>Backward (Foundations)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Forward (Extensions)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full ring-2 ring-indigo-400 bg-neutral-200" />
              <span>Landmark / Highly Cited</span>
            </div>
          </div>

          {/* Interactive SVG Surface */}
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ touchAction: "none" }}
          >
            <defs>
              <marker
                id="citation-arrow"
                viewBox="0 0 10 10"
                refX="22"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="rgba(148, 163, 184, 0.6)" />
              </marker>
              <marker
                id="citation-arrow-active"
                viewBox="0 0 10 10"
                refX="22"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" />
              </marker>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {graphState.edges.map((edge) => {
                const srcNode = nodePositionMap.get(edge.source);
                const tgtNode = nodePositionMap.get(edge.target);
                if (!srcNode || !tgtNode) return null;

                const isConnectedToSelected =
                  selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);

                return (
                  <line
                    key={edge.id}
                    x1={srcNode.x}
                    y1={srcNode.y}
                    x2={tgtNode.x}
                    y2={tgtNode.y}
                    stroke={isConnectedToSelected ? "#6366f1" : "rgba(156, 163, 175, 0.45)"}
                    strokeWidth={isConnectedToSelected ? 2.5 : 1.2}
                    markerEnd={isConnectedToSelected ? "url(#citation-arrow-active)" : "url(#citation-arrow)"}
                    className="transition-all duration-300"
                  />
                );
              })}

              {/* Nodes */}
              {filteredNodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const isSaved = savedNodeIds.has(node.id) || node.isSavedToCollection;
                const isSynthesisSelected = selectedPaperIdsForSynthesis.has(node.id);

                // Radius based on citationCount (between 14 and 32)
                const baseRadius = Math.min(32, Math.max(14, 14 + Math.log10(node.citationCount + 1) * 6));

                // Node color by type
                let fillColor = "#38bdf8"; // sky for backward
                if (node.nodeType === "seed") fillColor = "#f59e0b"; // amber
                else if (node.nodeType === "discovered_forward") fillColor = "#10b981"; // emerald

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x || 0}, ${node.y || 0})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Pulsing Selection Halo */}
                    {isSelected && (
                      <circle
                        r={baseRadius + 8}
                        className="stroke-indigo-500 fill-indigo-500/15 animate-pulse"
                        strokeWidth={2}
                      />
                    )}

                    {/* Landmark outer ring */}
                    {node.isLandmark && (
                      <circle
                        r={baseRadius + 4}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                      />
                    )}

                    {/* Base Node Circle */}
                    <circle
                      r={baseRadius}
                      fill={fillColor}
                      stroke={isSelected ? "#4f46e5" : "#ffffff"}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      className="transition-transform duration-200 group-hover:scale-110 shadow-md"
                    />

                    {/* Checkmark or synthesis pin */}
                    {isSynthesisSelected && (
                      <circle
                        cx={baseRadius * 0.7}
                        cy={-baseRadius * 0.7}
                        r={7}
                        className="fill-emerald-600 stroke-white"
                        strokeWidth={1.5}
                      />
                    )}

                    {/* Author & Year Label */}
                    <text
                      y={baseRadius + 14}
                      textAnchor="middle"
                      className="text-[10px] font-semibold fill-neutral-800 dark:fill-neutral-200 pointer-events-none select-none"
                    >
                      {node.authors[0] ? node.authors[0].split(" ").pop() : "Paper"} ({node.year || "n.d."})
                    </text>

                    {/* Citation Count Centered */}
                    <text
                      y={3.5}
                      textAnchor="middle"
                      className="text-[9.5px] font-bold font-mono fill-white pointer-events-none select-none"
                    >
                      {node.citationCount > 999 ? `${(node.citationCount / 1000).toFixed(0)}k` : node.citationCount}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Selected Paper Detail Inspector Side Panel */}
        {selectedNode && (
          <div className="w-96 border-l border-neutral-200 dark:border-white/10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md flex flex-col h-full shrink-0 shadow-lg z-20 overflow-y-auto scholar-scrollbar p-5 space-y-4">
            {/* Header info */}
            <div>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  selectedNode.nodeType === "seed"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                    : selectedNode.nodeType === "discovered_backward"
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                }`}>
                  {selectedNode.nodeType === "seed"
                    ? "Seed Publication"
                    : selectedNode.nodeType === "discovered_backward"
                    ? "Backward Antecedent"
                    : "Forward Extension"}
                </span>

                {selectedNode.isLandmark && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300/40">
                    ★ Landmark Paper
                  </span>
                )}
              </div>

              <h2 className="text-sm font-bold text-neutral-900 dark:text-white leading-snug">
                {selectedNode.title}
              </h2>

              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {selectedNode.authors.join(", ")} · {selectedNode.year || "n.d."}
              </p>
              <p className="text-[11px] text-neutral-400 italic">
                {selectedNode.journal || selectedNode.venue || "Academic Publication"}
              </p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 bg-neutral-50 dark:bg-white/[0.02] p-2.5 rounded-xl border border-neutral-200/80 dark:border-white/5 text-center">
              <div>
                <div className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  {selectedNode.citationCount.toLocaleString()}
                </div>
                <div className="text-[9.5px] text-neutral-400">Global Cites</div>
              </div>
              <div>
                <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {selectedNode.inDegree}
                </div>
                <div className="text-[9.5px] text-neutral-400">In-Graph Cites</div>
              </div>
              <div>
                <div className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  {selectedNode.depth}
                </div>
                <div className="text-[9.5px] text-neutral-400">Snowball Depth</div>
              </div>
            </div>

            {/* Abstract */}
            <div>
              <h3 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                Abstract & Empirical Excerpt
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed bg-neutral-50/70 dark:bg-neutral-800/40 p-3 rounded-xl border border-neutral-200/60 dark:border-white/5">
                {selectedNode.abstract || selectedNode.snippet || "No abstract metadata indexed for this record."}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-white/10">
              {/* Snowball Expand Specifically From This Paper */}
              <button
                type="button"
                disabled={isExpanding}
                onClick={() => handleSnowballExpand(selectedNode.id)}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Expand Citation Snowball (Depth +1)</span>
              </button>

              {/* Select for Evidence Synthesis */}
              <button
                type="button"
                onClick={() => handleToggleSelectForSynthesis(selectedNode.id)}
                className={`w-full py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  selectedPaperIdsForSynthesis.has(selectedNode.id)
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                    : "border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                {selectedPaperIdsForSynthesis.has(selectedNode.id) ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Included in Evidence Synthesis</span>
                  </>
                ) : (
                  <>
                    <BarChart3 className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Include in Evidence Synthesis</span>
                  </>
                )}
              </button>

              {/* Save to Knowledge Vault */}
              <button
                type="button"
                disabled={savedNodeIds.has(selectedNode.id) || selectedNode.isSavedToCollection}
                onClick={() => handleSaveNode(selectedNode)}
                className="w-full py-1.5 px-3 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {savedNodeIds.has(selectedNode.id) || selectedNode.isSavedToCollection ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Saved to Vault Collection</span>
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-3.5 h-3.5 text-sky-500" />
                    <span>Save to Knowledge Vault</span>
                  </>
                )}
              </button>

              {/* DOI / External Link */}
              {selectedNode.url && (
                <a
                  href={selectedNode.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-1.5 px-3 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>View Primary Source / DOI</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Research Gap Analysis Card */}
            {graphState.researchGaps.length > 0 && (
              <div className="pt-3 border-t border-neutral-200 dark:border-white/10">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 mb-2">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Research Gap Opportunities ({graphState.researchGaps.length})</span>
                </div>
                <div className="space-y-2">
                  {graphState.researchGaps.slice(0, 2).map((gap) => (
                    <div
                      key={gap.id}
                      className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] space-y-1"
                    >
                      <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {gap.title}
                      </div>
                      <p className="text-neutral-600 dark:text-neutral-400 leading-snug">
                        {gap.opportunity}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

