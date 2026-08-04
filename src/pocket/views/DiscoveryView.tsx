/**
 * Discovery view — source discovery and intake interface (docs 23 §5.6).
 * Search and add new sources to projects via external databases.
 * Phase 4.9 implementation — base discovery interface.
 */

import { useState } from "react";

export interface DiscoverySource {
  id: string;
  title: string;
  authors: string[];
  venue?: string;
  year?: number;
  doi?: string;
  summary?: string;
  source: "arxiv" | "scholar" | "pubmed" | "manual";
  relevanceScore?: number;
}

interface DiscoveryViewProps {
  projectId: string;
  onSourceAdd?: (source: DiscoverySource) => void;
  onBack: () => void;
}

export default function DiscoveryView({ projectId, onSourceAdd, onBack }: DiscoveryViewProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverySource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      // Stub: In production, this would call /api/discovery/search
      // with actual results from arXiv, Google Scholar, PubMed, etc.
      const mockResults: DiscoverySource[] = [
        {
          id: "arxiv-2024-001",
          title: "Advanced Techniques in Query Optimization",
          authors: ["Alice Chen", "Bob Watson"],
          venue: "arXiv",
          year: 2024,
          doi: "10.48550/arXiv.2024.001",
          summary:
            "We present novel approaches to optimizing database queries using machine learning techniques.",
          source: "arxiv",
          relevanceScore: 0.92,
        },
        {
          id: "scholar-2024-002",
          title: "Machine Learning Applications in Academic Research",
          authors: ["Carol Davis", "David Miller"],
          venue: "Journal of AI Research",
          year: 2024,
          doi: "10.1234/jair.2024.002",
          summary:
            "A comprehensive review of machine learning applications in academic research settings.",
          source: "scholar",
          relevanceScore: 0.87,
        },
        {
          id: "pubmed-2024-003",
          title: "Neural Networks in Medical Diagnosis",
          authors: ["Eve Johnson"],
          venue: "Nature Medicine",
          year: 2024,
          doi: "10.1038/nm.2024.003",
          summary:
            "Deep learning approaches for improving medical diagnosis accuracy and speed.",
          source: "pubmed",
          relevanceScore: 0.79,
        },
      ];

      // Filter by query (mock search)
      setResults(
        mockResults.filter(
          (s) =>
            s.title.toLowerCase().includes(query.toLowerCase()) ||
            s.authors.some((a) => a.toLowerCase().includes(query.toLowerCase()))
        )
      );
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSourceSelection = (sourceId: string) => {
    const newSet = new Set(selectedSources);
    if (newSet.has(sourceId)) {
      newSet.delete(sourceId);
    } else {
      newSet.add(sourceId);
    }
    setSelectedSources(newSet);
  };

  const handleAddSelected = () => {
    results
      .filter((r) => selectedSources.has(r.id))
      .forEach((source) => {
        onSourceAdd?.(source);
      });
    setSelectedSources(new Set());
    setQuery("");
    setResults([]);
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="pb-2 border-b border-[color:var(--color-border-subtle)]">
        <h2 className="text-sm font-serif font-bold text-[#F1F5F9]">Discover Sources</h2>
        <p className="text-xs text-[#64748B] mt-1">
          Add sources from arXiv, Google Scholar, PubMed
        </p>
      </div>

      {/* Search Box */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by title, author, or DOI…"
            className="flex-1 px-3 py-2 text-xs rounded-lg bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)] text-[#E2E8F0] placeholder-[#64748B] focus:outline-none focus:border-[color:var(--color-luminous-blue-dim)]"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-xs font-mono uppercase tracking-wide disabled:opacity-50"
          >
            {loading ? "…" : "Search"}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {results.length === 0 && !loading && query && (
          <div className="text-center py-8">
            <p className="text-[#64748B] text-xs">No results found</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="text-[#94A3B8] text-xs">Searching…</div>
          </div>
        )}

        {results.map((result) => (
          <div
            key={result.id}
            onClick={() => toggleSourceSelection(result.id)}
            className={`rounded-lg border p-3 cursor-pointer transition-colors ${
              selectedSources.has(result.id)
                ? "border-[color:var(--color-luminous-blue)] bg-[color:var(--color-luminous-blue)]/10"
                : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] hover:border-[color:var(--color-luminous-blue-dim)]"
            }`}
          >
            {/* Checkbox */}
            <div className="flex gap-2 items-start">
              <input
                type="checkbox"
                checked={selectedSources.has(result.id)}
                onChange={() => {}}
                className="mt-1 w-4 h-4 cursor-pointer accent-[color:var(--color-luminous-blue)]"
              />

              <div className="flex-1 min-w-0">
                {/* Title */}
                <h3 className="text-xs font-serif font-semibold text-[#F1F5F9] mb-1">
                  {result.title}
                </h3>

                {/* Authors & Year */}
                <p className="text-[10px] text-[#94A3B8] mb-2">
                  {result.authors.join(", ")}
                  {result.year && ` · ${result.year}`}
                </p>

                {/* Venue & Source */}
                <div className="flex gap-2 text-[10px] text-[#64748B]">
                  {result.venue && <span>{result.venue}</span>}
                  <span className="text-[#475569]">
                    {result.source.charAt(0).toUpperCase() + result.source.slice(1)}
                  </span>
                </div>

                {/* Relevance Score */}
                {result.relevanceScore && (
                  <div className="mt-2 h-1 bg-[color:var(--color-navy-1)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[color:var(--color-luminous-blue-dim)]"
                      style={{ width: `${result.relevanceScore * 100}%` }}
                    />
                  </div>
                )}

                {/* Summary */}
                {result.summary && (
                  <p className="text-[10px] text-[#94A3B8] mt-2 line-clamp-2">
                    {result.summary}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      {selectedSources.size > 0 && (
        <div className="space-y-2 border-t border-[color:var(--color-border-subtle)] pt-4">
          <button
            onClick={handleAddSelected}
            className="w-full py-2 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-xs font-mono uppercase tracking-wide"
          >
            Add {selectedSources.size} Source{selectedSources.size !== 1 ? "s" : ""}
          </button>
          <button
            onClick={onBack}
            className="w-full py-2 rounded-lg border border-[color:var(--color-border-subtle)] text-[color:var(--color-luminous-blue)] text-xs font-mono uppercase tracking-wide"
          >
            Done
          </button>
        </div>
      )}

      {selectedSources.size === 0 && (
        <div className="flex gap-2 border-t border-[color:var(--color-border-subtle)] pt-4">
          <button
            onClick={onBack}
            className="flex-1 py-2 rounded-lg border border-[color:var(--color-border-subtle)] text-[color:var(--color-luminous-blue)] text-xs font-mono uppercase tracking-wide"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
