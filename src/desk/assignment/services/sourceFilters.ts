/**
 * Stage 3 source list: which sources a tab, search and filter combination
 * shows, in which order. Pure (no React), so the list logic is testable on its own.
 */
import type { DiscoveredSource } from "../types";

export type SourceTab = "all" | "curated" | "ask_scholar" | "ai_research" | "uploaded" | "approved" | "bookmarked" | "excluded";
export type SourceSort = "relevance" | "citations" | "year" | "title" | "role";

export interface SourceFilterCriteria {
  activeTab: SourceTab;
  searchQuery: string;
  selectedType: string;
  selectedRole: string;
  selectedMethodology: string;
  selectedYearRange: string;
  minRelevance: number;
  openAccessOnly: boolean;
  sortBy: SourceSort;
}

export const DEFAULT_SOURCE_FILTERS: SourceFilterCriteria = {
  activeTab: "all",
  searchQuery: "",
  selectedType: "all",
  selectedRole: "all",
  selectedMethodology: "all",
  selectedYearRange: "all",
  minRelevance: 0,
  openAccessOnly: false,
  sortBy: "relevance",
};

/** Relevance as a 0-100 integer whatever the source scale (0-1 fractions included). */
export function normalizeRelevance(score: number | undefined): number {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return 0;
  return Math.min(100, Math.round(score <= 1 ? score * 100 : score));
}

/** How many filters differ from their defaults (the tab and search are not counted). */
export function countActiveFilters(f: SourceFilterCriteria): number {
  return (
    (f.selectedType !== "all" ? 1 : 0) +
    (f.selectedRole !== "all" ? 1 : 0) +
    (f.selectedMethodology !== "all" ? 1 : 0) +
    (f.selectedYearRange !== "all" ? 1 : 0) +
    (f.minRelevance > 0 ? 1 : 0) +
    (f.openAccessOnly ? 1 : 0) +
    (f.sortBy !== "relevance" ? 1 : 0)
  );
}

export function filterAndSortSources(
  allMasterSources: DiscoveredSource[],
  criteria: SourceFilterCriteria,
  ids: { approvedSourceIds: string[]; bookmarkedIds: string[]; excludedIds: string[] }
): DiscoveredSource[] {
  const { activeTab, searchQuery, selectedType, selectedRole, selectedMethodology, selectedYearRange, minRelevance, openAccessOnly, sortBy } = criteria;
  const { approvedSourceIds, bookmarkedIds, excludedIds } = ids;
  let list = allMasterSources;

  // 1. Tab status filtering
  if (activeTab === "approved") {
    list = list.filter((s) => approvedSourceIds.includes(s.id));
  } else if (activeTab === "uploaded") {
    list = list.filter((s) => s.isUserUploaded || s.sourceOrigin === "user");
  } else if (activeTab === "ask_scholar") {
    list = list.filter((s) => s.sourceOrigin === "ask_scholar" && !excludedIds.includes(s.id) && !s.isExcluded && s.status !== "removed");
  } else if (activeTab === "ai_research") {
    list = list.filter((s) => s.sourceOrigin === "ai_research" && !excludedIds.includes(s.id) && !s.isExcluded && s.status !== "removed");
  } else if (activeTab === "curated") {
    list = list.filter((s) => !s.isUserUploaded && s.sourceOrigin !== "user" && !excludedIds.includes(s.id) && !s.isExcluded && s.status !== "removed");
  } else if (activeTab === "bookmarked") {
    list = list.filter((s) => bookmarkedIds.includes(s.id) || s.isBookmarked);
  } else if (activeTab === "excluded") {
    list = list.filter((s) => excludedIds.includes(s.id) || s.isExcluded || s.status === "removed");
  } else {
    // "all" tab hides excluded sources
    list = list.filter((s) => !excludedIds.includes(s.id) && !s.isExcluded && s.status !== "removed");
  }

  // 2. Search query filtering
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    list = list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.authors && (Array.isArray(s.authors) ? s.authors.some((a) => a.toLowerCase().includes(q)) : String(s.authors).toLowerCase().includes(q))) ||
        (s.journal && s.journal.toLowerCase().includes(q)) ||
        (s.mainFinding && s.mainFinding.toLowerCase().includes(q)) ||
        (s.abstract && s.abstract.toLowerCase().includes(q)) ||
        (s.methodology && s.methodology.toLowerCase().includes(q)) ||
        (s.keyConcepts && (Array.isArray(s.keyConcepts) ? s.keyConcepts.some((k) => k.toLowerCase().includes(q)) : String(s.keyConcepts).toLowerCase().includes(q))) ||
        (s.structuredDataSummary && s.structuredDataSummary.toLowerCase().includes(q)) ||
        (s.extractedEvidences &&
          s.extractedEvidences.some(
            (e) =>
              e.excerpt.toLowerCase().includes(q) ||
              (e.claim && e.claim.toLowerCase().includes(q)) ||
              (e.sourceLocation && e.sourceLocation.toLowerCase().includes(q))
          ))
    );
  }

  // 3. Source Type filter
  if (selectedType !== "all") {
    list = list.filter((s) => s.type === selectedType);
  }

  // 4. Role in Assignment filter
  if (selectedRole !== "all") {
    list = list.filter((s) => s.roleInAssignment === selectedRole);
  }

  // 5. Research Methodology filter
  if (selectedMethodology !== "all") {
    list = list.filter((s) => s.methodology === selectedMethodology);
  }

  // 6. Publication Year filter
  if (selectedYearRange === "2026") {
    list = list.filter((s) => parseInt(s.year, 10) >= 2026);
  } else if (selectedYearRange === "recent") {
    list = list.filter((s) => parseInt(s.year, 10) >= 2024);
  } else if (selectedYearRange === "2020-2023") {
    list = list.filter((s) => {
      const y = parseInt(s.year, 10);
      return y >= 2020 && y <= 2023;
    });
  } else if (selectedYearRange === "seminal") {
    list = list.filter((s) => parseInt(s.year, 10) < 2020 || s.roleInAssignment === "Core theory");
  }

  // 7. Minimum Relevance filter
  if (minRelevance > 0) {
    list = list.filter((s) => normalizeRelevance(s.relevanceScore) >= minRelevance);
  }

  // 8. Open Access Only filter
  if (openAccessOnly) {
    list = list.filter((s) => !!s.isOpenAccess);
  }

  // 9. Sorting
  list = [...list].sort((a, b) => {
    // Keep uploaded sources near the top if on "all"
    if (a.isUserUploaded && !b.isUserUploaded) return -1;
    if (!a.isUserUploaded && b.isUserUploaded) return 1;
    if (a.prescribedInBrief && !b.prescribedInBrief) return -1;
    if (!a.prescribedInBrief && b.prescribedInBrief) return 1;

    if (sortBy === "citations") {
      return (b.citationCount || 0) - (a.citationCount || 0);
    }
    if (sortBy === "year") {
      return parseInt(b.year || "0", 10) - parseInt(a.year || "0", 10);
    }
    if (sortBy === "role") {
      return (a.roleInAssignment || "").localeCompare(b.roleInAssignment || "");
    }
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }
    // "relevance": preserve engine's question-led, recency-first ranking
    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
  });

  return list;
}
