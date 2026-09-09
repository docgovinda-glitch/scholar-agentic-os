import React, { useState, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { listVaultItems } from "../../../services/vaultContents";
import { getConnectedCloudDrives } from "../../../services/vault/cloudDriveService";
import { getSupabaseClient } from "../../../services/supabaseClient";
import { authedJsonFetch } from "../../api";
import type { DiscoveredSource } from "../types";

export default function AssignmentResearchStage() {
  const {
    projectId,
    project,
    question,
    academicLevel,
    citationStyle,
    researchPlan,
    sources,
    setSources,
    toggleSourceStatus,
    advanceStage,
  } = useAssignmentWorkspace();

  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "kept" | "vault">("all");
  const [selectedSource, setSelectedSource] = useState<DiscoveredSource | null>(null);
  const [vaultMatches, setVaultMatches] = useState<DiscoveredSource[]>([]);

  useEffect(() => {
    if (sources.length === 0) {
      handleSearch();
    }
    loadVaultSources();
  }, []);

  const loadVaultSources = async () => {
    try {
      const { data: userData } = await getSupabaseClient().auth.getUser();
      const userId = userData?.user?.id || (project as any)?.userId || "default-user";
      const vaultItems = await listVaultItems(userId);
      if (vaultItems && vaultItems.length > 0) {
        const matches: DiscoveredSource[] = vaultItems.map((item, idx) => ({
          id: `vault-${item.id || idx}`,
          title: item.title,
          authors: item.authors && item.authors.length > 0 ? item.authors : ["Vault Author"],
          year: String(item.year || new Date().getFullYear()),
          type: "vault",
          relevanceScore: 92,
          mainFinding: item.content ? item.content.slice(0, 180) + "…" : (item.citation || item.title),
          suggestedUse: "Direct primary/secondary evidence from your personal Source Library.",
          citation: item.citation || `${item.title} (${item.year || "n.d."})`,
          status: "unreviewed",
          fromVault: true,
        }));
        setVaultMatches(matches);
      }
    } catch (e) {
      console.warn("Failed to load vault items for assignment research:", e);
    }
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    try {
      const res = await authedJsonFetch(`/api/projects/${projectId}/assignment/research`, "POST", {
        question,
        academicLevel,
        citationStyle,
        plan: researchPlan,
      });

      if (!res.ok) throw new Error("Failed to search scholarly sources");
      const data = await res.json();
      const fetched: DiscoveredSource[] = data.sources || [];
      await setSources([...fetched, ...vaultMatches]);
    } catch (err: any) {
      setError(err.message || "Failed to search sources");
    } finally {
      setIsSearching(false);
    }
  };

  const allSources = sources.length > 0 ? sources : vaultMatches;
  const keptCount = allSources.filter((s) => s.status === "kept").length;

  const filteredSources =
    activeTab === "kept"
      ? allSources.filter((s) => s.status === "kept")
      : activeTab === "vault"
      ? allSources.filter((s) => s.fromVault)
      : allSources;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-[color:var(--border-subtle)] pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🔬</span>
            <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
              Phase 3: Research Agent & Knowledge Vault
            </h2>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Discover peer-reviewed articles, books, and match relevant materials from your personal Knowledge Vault.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isSearching}
            onClick={handleSearch}
            className="px-3.5 py-1.5 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-semibold hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
          >
            {isSearching ? "Searching…" : "🔍 Search More Sources"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Filter Tabs & Kept Counter */}
      <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === "all"
                ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)]"
                : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            All Discovered ({allSources.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("kept")}
            className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === "kept"
                ? "bg-emerald-600 text-white"
                : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            ✓ Kept for Assignment ({keptCount})
          </button>
          {vaultMatches.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("vault")}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                activeTab === "vault"
                  ? "bg-purple-600 text-white"
                  : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              <span>☁️ From Knowledge Vault</span>
              <span>({vaultMatches.length})</span>
            </button>
          )}
        </div>

        <span className="text-xs font-medium text-[color:var(--text-muted)]">
          {keptCount >= 2 ? "✓ Evidence minimum satisfied" : `Select at least 2 sources to proceed (${keptCount}/2)`}
        </span>
      </div>

      {/* Sources List */}
      {isSearching && allSources.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-3">
          <div className="w-8 h-8 border-3 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-[color:var(--text-secondary)]">
            Searching academic repositories & querying your Knowledge Vault…
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredSources.map((src) => {
            const isKept = src.status === "kept";
            const isRemoved = src.status === "removed";

            return (
              <div
                key={src.id}
                className={`p-4 rounded-[var(--radius-lg)] border transition-all ${
                  isKept
                    ? "border-emerald-500/40 bg-emerald-500/5 shadow-xs"
                    : isRemoved
                    ? "border-neutral-500/20 bg-neutral-500/5 opacity-60"
                    : "border-[color:var(--border-default)] bg-[color:var(--surface-inset)] hover:border-[color:var(--border-control)]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[color:var(--text-primary)]">
                        {src.title}
                      </span>
                      {src.fromVault && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400">
                          ☁️ Personal Vault
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-muted)]">
                        {src.year} • {src.authors?.slice(0, 2).join(", ")}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        {src.relevanceScore}% Match
                      </span>
                    </div>

                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                      💡 <span className="font-semibold text-[color:var(--text-primary)]">Key Finding:</span> {src.mainFinding}
                    </p>
                    <p className="text-xs text-[color:var(--text-muted)] italic">
                      🎯 <span className="font-semibold">How to apply:</span> {src.suggestedUse}
                    </p>
                    <p className="text-[11px] font-mono text-[color:var(--text-muted)] pt-1">
                      Citation: {src.citation}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleSourceStatus(src.id, "kept")}
                      className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold transition-all cursor-pointer ${
                        isKept
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-emerald-600 hover:border-emerald-500"
                      }`}
                    >
                      {isKept ? "✓ Kept" : "✓ Keep"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSourceStatus(src.id, "removed")}
                      className={`px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs font-semibold transition-all cursor-pointer ${
                        isRemoved
                          ? "bg-neutral-500 text-white"
                          : "text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)]"
                      }`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Advance Banner */}
      <div className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[color:var(--accent)]">
            Ready to extract specific evidence & claims?
          </h4>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Proceed to the Evidence Board to organize Claim → Evidence → Source → Citation items.
          </p>
        </div>
        <button
          type="button"
          disabled={keptCount < 2}
          onClick={() => advanceStage("evidence")}
          className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
        >
          Proceed to Evidence Board →
        </button>
      </div>
    </div>
  );
}
