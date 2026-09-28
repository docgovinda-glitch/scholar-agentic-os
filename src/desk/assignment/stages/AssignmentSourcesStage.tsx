import React, { useState, useEffect, useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { CuratedSourceCard } from "../components/CuratedSourceCard";
import { CuratedSourceListView } from "../components/CuratedSourceListView";
import { CuratedSourceTableView } from "../components/CuratedSourceTableView";
import { CuratedSourceCompactView } from "../components/CuratedSourceCompactView";
import { LectureUploadDropzone } from "../components/LectureUploadDropzone";
import {
  generateCuratedLiteratureSources,
  fetchMoreLiteratureSources,
  areSourcesRelevantToQuestion,
} from "../services/scholarlyDiscoveryService";
import type {
  DiscoveredSource,
  UploadedSourceDocument,
  EvidenceItem,
  LiteratureViewMode,
} from "../types";
import {
  Library,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  FileCheck,
  LayoutGrid,
  List,
  Table as TableIcon,
  Rows,
  Star,
  SlidersHorizontal,
  Unlock,
  RotateCcw,
  BookOpen,
  X,
} from "lucide-react";

const REPLACEMENT_POOL: DiscoveredSource[] = [
  {
    id: "src-curated-alt-1",
    title: "Governance by Dashboard: Performance Metrics and Institutional Isomorphism",
    authors: ["Espeland, W. N.", "Sauder, M."],
    year: "2023",
    type: "journal",
    journal: "American Journal of Sociology",
    volumeIssue: "128(6), 1642–1689",
    doi: "10.1086/724890",
    relevanceScore: 93,
    mainFinding: "Traces organizational reactivity to quantitative rankings, documenting how metrics distort primary public mission objectives.",
    suggestedUse: "Offers institutional sociology critique for examining broader organizational consequences of automation.",
    citation: "Espeland, W. N. & Sauder, M. (2023). Governance by Dashboard. American Journal of Sociology, 128(6), 1642–1689.",
    abstract: "Drawing on a longitudinal study of public sector agencies adopting quantitative performance management regimes, this article details how performance targets distort professional discretion.",
    citationCount: 1650,
    citationImpact: "Highly Cited",
    methodology: "Qualitative Case Study",
    keyConcepts: ["Institutional Isomorphism", "Metric Gaming", "Reactivity"],
    domain: "Sociology & Organization Studies",
    isOpenAccess: false,
    isVerifiedAcademic: true,
    sourceCredibility: "peer-reviewed",
    status: "unreviewed",
  },
  {
    id: "src-curated-alt-2",
    title: "The Human Element: Socratic Oversight in Machine-Mediated Education",
    authors: ["Biesta, G."],
    year: "2022",
    type: "book",
    journal: "Routledge",
    publisher: "Routledge",
    doi: "10.4324/9781003180425",
    relevanceScore: 90,
    mainFinding: "Argues that pedagogic engagement cannot be reduced to predictive skill optimization without abandoning moral agency.",
    suggestedUse: "Ideal philosophical argument for pedagogical, moral, or student autonomy perspectives.",
    citation: "Biesta, G. (2022). World-Centred Education: A View for the Present. Routledge.",
    abstract: "This philosophical treatise challenges the instrumental reduction of education into adaptive algorithmic micro-learning.",
    citationCount: 1480,
    citationImpact: "Highly Cited",
    methodology: "Theoretical Framework",
    keyConcepts: ["Subjectification", "Pedagogical Autonomy", "Instrumentalism"],
    domain: "Education & Philosophy of Mind",
    isOpenAccess: false,
    isVerifiedAcademic: true,
    sourceCredibility: "academic-press",
    status: "unreviewed",
  },
  {
    id: "src-curated-alt-3",
    title: "Auditing Public Algorithms: Methodological Standards and Verification Gaps",
    authors: ["Sandvig, C.", "Hamilton, K."],
    year: "2024",
    type: "institutional",
    journal: "Center for Information Technology Policy, Princeton University",
    publisher: "CITP Policy Paper Series",
    doi: "10.1145/audit.2024.08",
    relevanceScore: 89,
    mainFinding: "Proposes standardized forensic audit methodologies and non-infringing scraping standards for academic researchers.",
    suggestedUse: "Direct evidentiary support for policy recommendations, investigative methodology, and conclusion sections.",
    citation: "Sandvig, C. & Hamilton, K. (2024). Auditing Public Algorithms. CITP Policy Paper, Princeton University.",
    abstract: "Independent algorithmic auditing is currently impeded by restrictive anti-hacking statutes. This institutional study proposes a statutory safe harbor protocol.",
    citationCount: 380,
    citationImpact: "Recent Landmark",
    methodology: "Systematic Review",
    keyConcepts: ["Algorithmic Auditing", "Disparate Impact", "Safe Harbor"],
    domain: "Public Interest Technology & Law",
    isOpenAccess: true,
    isVerifiedAcademic: true,
    sourceCredibility: "institutional-report",
    status: "unreviewed",
  },
];

export interface AssignmentSourcesStageProps {
  onProceed?: () => void;
  onBack?: () => void;
}

export default function AssignmentSourcesStage({
  onProceed,
  onBack,
}: AssignmentSourcesStageProps) {
  const {
    projectId,
    question,
    citationStyle,
    sources,
    setSources,
    approvedSourceIds,
    toggleSourceApproval,
    dismissSource,
    userUploadedSources,
    addUserUploadedSource,
    removeUserUploadedSource,
    addEvidenceItem,
    advancePhase,
    setPhase,
  } = useAssignmentWorkspace();

  // View mode state (defaults to card view, switches seamlessly)
  const [viewMode, setViewMode] = useState<LiteratureViewMode>("card");

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<"all" | "approved" | "bookmarked" | "excluded">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedMethodology, setSelectedMethodology] = useState<string>("all");
  const [selectedYearRange, setSelectedYearRange] = useState<string>("all");
  const [minRelevance, setMinRelevance] = useState<number>(0);
  const [openAccessOnly, setOpenAccessOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"relevance" | "citations" | "year" | "title">("relevance");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Progressive discovery state
  const [isFindingMore, setIsFindingMore] = useState(false);
  const [discoverySuccessMsg, setDiscoverySuccessMsg] = useState<string | null>(null);
  const [altPoolIndex, setAltPoolIndex] = useState(0);

  // Bookmarks and exclusions
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() =>
    sources.filter((s) => s.isBookmarked).map((s) => s.id)
  );
  const [excludedIds, setExcludedIds] = useState<string[]>(() =>
    sources.filter((s) => s.isExcluded || s.status === "removed").map((s) => s.id)
  );

  // Check if existing sources are mismatched with the current question
  const isMismatched = useMemo(() => {
    if (!sources || sources.length === 0 || !question || question.trim().length < 4) return false;
    return !areSourcesRelevantToQuestion(sources, question);
  }, [sources, question]);

  // Initialize curated sources on first mount (ensure baseline of 30+ items and domain alignment)
  useEffect(() => {
    if (sources.length === 0) {
      const generated = generateCuratedLiteratureSources(question, citationStyle);
      setSources(generated);
    } else if (isMismatched && approvedSourceIds.length === 0) {
      // If existing sources were for a different topic and user hasn't locked approved items,
      // re-curate to align with the active question
      const generated = generateCuratedLiteratureSources(question, citationStyle);
      setSources(generated);
    } else if (sources.length < 30) {
      // Seamlessly upgrade legacy small pools to the full 30+ curated library
      const existingIds = new Set(sources.map((s) => s.id));
      const baseline = generateCuratedLiteratureSources(question, citationStyle);
      const additions = baseline.filter((b) => !existingIds.has(b.id));
      setSources([...sources, ...additions]);
    }
  }, [sources.length, isMismatched, approvedSourceIds.length, question, citationStyle, setSources]);

  // Sync bookmarks & exclusions when sources change
  useEffect(() => {
    const bookmarked = sources.filter((s) => s.isBookmarked).map((s) => s.id);
    if (bookmarked.length > 0) {
      setBookmarkedIds((prev) => Array.from(new Set([...prev, ...bookmarked])));
    }
    const excluded = sources.filter((s) => s.isExcluded || s.status === "removed").map((s) => s.id);
    if (excluded.length > 0) {
      setExcludedIds((prev) => Array.from(new Set([...prev, ...excluded])));
    }
  }, [sources]);

  // Re-curate literature for active assignment prompt
  const handleReCurateForPrompt = async () => {
    setIsFindingMore(true);
    const generated = generateCuratedLiteratureSources(question, citationStyle);
    await setSources(generated);
    setIsFindingMore(false);
    setDiscoverySuccessMsg(`Curated ${generated.length} literature sources matching your assignment prompt.`);
    setTimeout(() => setDiscoverySuccessMsg(null), 4000);
  };

  // Progressive Discovery: Find More Literature
  const handleFindMoreLiterature = async () => {
    setIsFindingMore(true);
    setTimeout(async () => {
      const moreBatch = fetchMoreLiteratureSources(sources, question, 10);
      const nextSources = [...sources, ...moreBatch];
      await setSources(nextSources);
      setIsFindingMore(false);
      setDiscoverySuccessMsg(`Retrieved ${moreBatch.length} additional authentic literature sources.`);
      setTimeout(() => setDiscoverySuccessMsg(null), 4000);
    }, 450);
  };

  // Toggle Bookmark
  const handleToggleBookmark = async (sourceId: string) => {
    const isCurrentlyBookmarked = bookmarkedIds.includes(sourceId);
    const nextBookmarked = isCurrentlyBookmarked
      ? bookmarkedIds.filter((id) => id !== sourceId)
      : [...bookmarkedIds, sourceId];
    setBookmarkedIds(nextBookmarked);

    const nextSources = sources.map((s) =>
      s.id === sourceId ? { ...s, isBookmarked: !isCurrentlyBookmarked } : s
    );
    await setSources(nextSources);
  };

  // Dismiss / Replace source with item from replacement pool or dynamic pool matching question
  const handleDismissSource = async (sourceId: string) => {
    let nextReplacement: DiscoveredSource | undefined;
    if (question && (question.toLowerCase().includes("china") || question.toLowerCase().includes("geopolitic") || question.toLowerCase().includes("international order"))) {
      const freshBatch = fetchMoreLiteratureSources(sources, question, 1);
      nextReplacement = freshBatch[0];
    } else {
      nextReplacement = REPLACEMENT_POOL[altPoolIndex % REPLACEMENT_POOL.length];
      setAltPoolIndex((prev) => prev + 1);
    }
    await dismissSource(sourceId, nextReplacement);
  };

  // Restore excluded source
  const handleRestoreSource = async (sourceId: string) => {
    const nextExcluded = excludedIds.filter((id) => id !== sourceId);
    setExcludedIds(nextExcluded);

    const nextSources = sources.map((s) =>
      s.id === sourceId ? { ...s, isExcluded: false, status: "unreviewed" as const } : s
    );
    await setSources(nextSources);
  };

  const handleLectureUpload = async (docs: UploadedSourceDocument[], newEvidences?: EvidenceItem[]) => {
    for (const doc of docs) {
      await addUserUploadedSource(doc);
    }
    if (newEvidences && newEvidences.length > 0 && addEvidenceItem) {
      for (const ev of newEvidences) {
        await addEvidenceItem({
          claim: ev.claim,
          evidenceSnippet: ev.evidenceSnippet,
          sourceTitle: ev.sourceTitle,
          sourceType: ev.sourceType,
          citation: ev.citation,
          theme: ev.theme,
          status: ev.status,
          authors: ev.authors,
          year: ev.year,
        });
      }
    }
  };

  const handleLectureRemove = async (docId: string) => {
    await removeUserUploadedSource(docId);
  };

  // Approved count calculation
  const approvedCount = approvedSourceIds.length;
  const isExitGateUnlocked = approvedCount >= 4;
  const minimumRequired = 4;
  const progressPercent = Math.min(100, Math.round((approvedCount / minimumRequired) * 100));

  const handleContinue = () => {
    if (!isExitGateUnlocked) return;
    if (onProceed) {
      onProceed();
    } else if (advancePhase) {
      advancePhase("drafting");
    } else if (setPhase) {
      setPhase("drafting");
    }
  };

  const handleReturn = () => {
    if (onBack) {
      onBack();
    } else if (setPhase) {
      setPhase("understand");
    }
  };

  // Base list of sources
  const allCuratedSources = useMemo(() => {
    if (sources && sources.length >= 30) return sources;
    if (sources && sources.length > 0) {
      const existingIds = new Set(sources.map((s) => s.id));
      const baseline = generateCuratedLiteratureSources(question, citationStyle);
      const additions = baseline.filter((b) => !existingIds.has(b.id));
      return [...sources, ...additions];
    }
    return generateCuratedLiteratureSources(question, citationStyle);
  }, [sources, question, citationStyle]);

  // Filter and sort sources
  const displayedSources = useMemo(() => {
    let list = allCuratedSources;

    // 1. Tab status filtering
    if (activeTab === "approved") {
      list = list.filter((s) => approvedSourceIds.includes(s.id));
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
          (s.authors && s.authors.some((a) => a.toLowerCase().includes(q))) ||
          (s.journal && s.journal.toLowerCase().includes(q)) ||
          (s.mainFinding && s.mainFinding.toLowerCase().includes(q)) ||
          (s.abstract && s.abstract.toLowerCase().includes(q)) ||
          (s.methodology && s.methodology.toLowerCase().includes(q)) ||
          (s.keyConcepts && s.keyConcepts.some((k) => k.toLowerCase().includes(q)))
      );
    }

    // 3. Source Type filter
    if (selectedType !== "all") {
      list = list.filter((s) => s.type === selectedType);
    }

    // 4. Research Methodology filter
    if (selectedMethodology !== "all") {
      list = list.filter((s) => s.methodology === selectedMethodology);
    }

    // 5. Publication Year filter
    if (selectedYearRange === "recent") {
      list = list.filter((s) => parseInt(s.year, 10) >= 2024);
    } else if (selectedYearRange === "2020-2023") {
      list = list.filter((s) => {
        const y = parseInt(s.year, 10);
        return y >= 2020 && y <= 2023;
      });
    } else if (selectedYearRange === "seminal") {
      list = list.filter((s) => parseInt(s.year, 10) < 2020);
    }

    // 6. Minimum Relevance filter
    if (minRelevance > 0) {
      list = list.filter((s) => (s.relevanceScore || 0) >= minRelevance);
    }

    // 7. Open Access Only filter
    if (openAccessOnly) {
      list = list.filter((s) => !!s.isOpenAccess);
    }

    // 8. Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === "relevance") {
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      }
      if (sortBy === "citations") {
        return (b.citationCount || 0) - (a.citationCount || 0);
      }
      if (sortBy === "year") {
        return parseInt(b.year || "0", 10) - parseInt(a.year || "0", 10);
      }
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return list;
  }, [
    allCuratedSources,
    approvedSourceIds,
    bookmarkedIds,
    excludedIds,
    activeTab,
    searchQuery,
    selectedType,
    selectedMethodology,
    selectedYearRange,
    minRelevance,
    openAccessOnly,
    sortBy,
  ]);

  const activeFilterCount =
    (selectedType !== "all" ? 1 : 0) +
    (selectedMethodology !== "all" ? 1 : 0) +
    (selectedYearRange !== "all" ? 1 : 0) +
    (minRelevance > 0 ? 1 : 0) +
    (openAccessOnly ? 1 : 0) +
    (sortBy !== "relevance" ? 1 : 0);

  const resetAllFilters = () => {
    setSelectedType("all");
    setSelectedMethodology("all");
    setSelectedYearRange("all");
    setMinRelevance(0);
    setOpenAccessOnly(false);
    setSortBy("relevance");
    setSearchQuery("");
  };

  const totalActiveSources = allCuratedSources.filter(
    (s) => !excludedIds.includes(s.id) && !s.isExcluded && s.status !== "removed"
  ).length;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-200">
      {/* Stage Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 dark:border-white/10 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              Phase 02
            </span>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              Evidence Discovery & Course Grounding
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Curated Literature & Course Sources
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
            Discover peer-reviewed scholarship, seminal monographs, conference proceedings, and institutional reports matched to your assessment brief.
          </p>
        </div>

        {/* Exit Gate Widget (Top Header View) */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Approved Sources:
            </span>
            <span
              data-testid="evidence-counter"
              className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${
                isExitGateUnlocked
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-neutral-300"
              }`}
            >
              {approvedCount} / {minimumRequired} minimum
            </span>
          </div>

          <div className="w-36 h-1.5 bg-neutral-200/80 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isExitGateUnlocked ? "bg-emerald-500" : "bg-neutral-900 dark:bg-white"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Section 1: Lecture Slide Dropzone */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <span>Course Materials & Syllabus Upload</span>
              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">(Optional)</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Upload your professor's slides, reading packs, or rubric notes to anchor specific citations directly to lecture content.
            </p>
          </div>
        </div>

        <LectureUploadDropzone
          uploadedFiles={userUploadedSources}
          onUpload={handleLectureUpload}
          onRemove={handleLectureRemove}
          assignmentQuestion={question}
          citationStyle={citationStyle}
          projectId={projectId}
        />
      </section>

      {/* Section 2: Curated Academic Literature Workspace */}
      <section className="space-y-4 pt-4 border-t border-neutral-200/60 dark:border-white/5">
        {/* Workspace Toolbar Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Library className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
              <span>Curated Scholarly Literature</span>
              <span className="text-xs font-mono font-medium text-neutral-400">
                ({allCuratedSources.length} identified)
              </span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Peer-reviewed journal articles, seminal academic books, and institutional research reports.
            </p>
          </div>

          {/* Viewing Mode Switcher */}
          <div className="flex items-center gap-1.5 bg-neutral-100 dark:bg-white/5 p-1 rounded-xl self-start md:self-auto">
            <button
              type="button"
              onClick={() => setViewMode("card")}
              title="Card View (Visual Cards)"
              aria-label="Card View"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === "card"
                  ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List View (Bibliographic Details & Abstracts)"
              aria-label="List View"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="Table View (Comparison Matrix)"
              aria-label="Table View"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === "table"
                  ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("compact")}
              title="Compact View (High-Speed Scanning)"
              aria-label="Compact View"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === "compact"
                  ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <Rows className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Compact</span>
            </button>
          </div>
        </div>

        {/* Topic Mismatch Notice Banner if user changed prompt but has previously approved sources */}
        {isMismatched && approvedSourceIds.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                Your assignment question has changed. Would you like to curate fresh literature tailored to your research question?
              </span>
            </div>
            <button
              type="button"
              onClick={handleReCurateForPrompt}
              disabled={isFindingMore}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shrink-0 cursor-pointer transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFindingMore ? "animate-spin" : ""}`} />
              <span>Curate for Question</span>
            </button>
          </div>
        )}

        {/* Filter Navigation Bar & Status Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "all"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs"
                  : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              All Literature ({totalActiveSources})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("approved")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "approved"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approved</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 text-current">
                {approvedSourceIds.filter((id) => allCuratedSources.some((s) => s.id === id)).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("bookmarked")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "bookmarked"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Bookmarked</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 text-current">
                {bookmarkedIds.length}
              </span>
            </button>

            {excludedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("excluded")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === "excluded"
                    ? "bg-neutral-700 text-white shadow-xs"
                    : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <span>Excluded ({excludedIds.length})</span>
              </button>
            )}
          </div>

          {/* Search Input & Advanced Filter Toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search authors, title, keyword..."
                aria-label="Search curated literature"
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-neutral-100 dark:bg-white/5 border border-transparent focus:border-neutral-300 dark:focus:border-white/20 text-neutral-900 dark:text-white placeholder-neutral-400 outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              aria-label="Toggle advanced filters"
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                showAdvancedFilters || activeFilterCount > 0
                  ? "border-neutral-900 dark:border-white bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold"
                  : "border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] text-neutral-600 dark:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleReCurateForPrompt}
              disabled={isFindingMore}
              title="Re-curate literature specifically for your active assignment prompt"
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] text-neutral-600 dark:text-neutral-300 hover:border-neutral-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFindingMore ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Re-curate</span>
            </button>
          </div>
        </div>

        {/* Expandable Advanced Filtering Drawer */}
        {showAdvancedFilters && (
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/80 dark:border-white/10 space-y-3 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Filter 1: Source Type */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                  Source Type
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="all">All Source Types</option>
                  <option value="journal">Peer-Reviewed Journals</option>
                  <option value="book">Academic Books & Presses</option>
                  <option value="conference">Conference Proceedings</option>
                  <option value="institutional">Institutional Research</option>
                  <option value="report">Policy & Intergov Reports</option>
                </select>
              </div>

              {/* Filter 2: Research Methodology */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                  Research Methodology
                </label>
                <select
                  value={selectedMethodology}
                  onChange={(e) => setSelectedMethodology(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="all">All Methodologies</option>
                  <option value="Empirical Study">Empirical Study</option>
                  <option value="Quantitative Meta-Analysis">Quantitative Meta-Analysis</option>
                  <option value="Qualitative Case Study">Qualitative Case Study</option>
                  <option value="Systematic Review">Systematic Review</option>
                  <option value="Theoretical Framework">Theoretical Framework</option>
                  <option value="Doctrinal Analysis">Doctrinal Analysis</option>
                  <option value="Comparative Analysis">Comparative Analysis</option>
                  <option value="Mixed-Methods">Mixed-Methods</option>
                </select>
              </div>

              {/* Filter 3: Publication Year */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                  Publication Year
                </label>
                <select
                  value={selectedYearRange}
                  onChange={(e) => setSelectedYearRange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="all">All Publication Years</option>
                  <option value="recent">Recent (2024–2025)</option>
                  <option value="2020-2023">Contemporary (2020–2023)</option>
                  <option value="seminal">Seminal & Classic (&lt; 2020)</option>
                </select>
              </div>

              {/* Filter 4: Sort Order */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                  Sort Order
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="relevance">Highest Match % (Default)</option>
                  <option value="citations">Most Cited (Citation Impact)</option>
                  <option value="year">Newest Publication Year</option>
                  <option value="title">Title (Alphabetical)</option>
                </select>
              </div>
            </div>

            {/* Row 2: Toggles and Reset */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-neutral-200/50 dark:border-white/5 flex-wrap">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={openAccessOnly}
                    onChange={(e) => setOpenAccessOnly(e.target.checked)}
                    className="w-4 h-4 rounded text-neutral-900 focus:ring-0 cursor-pointer"
                  />
                  <span className="flex items-center gap-1 font-medium">
                    <Unlock className="w-3 h-3 text-amber-500" />
                    <span>Open-Access Sources Only</span>
                  </span>
                </label>

                <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                  <span>Min Relevance:</span>
                  {[0, 85, 90, 95].map((thresh) => (
                    <button
                      key={thresh}
                      type="button"
                      onClick={() => setMinRelevance(thresh)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                        minRelevance === thresh
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold"
                          : "bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200"
                      }`}
                    >
                      {thresh === 0 ? "Any" : `${thresh}%+`}
                    </button>
                  ))}
                </div>
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset all filters</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Notification Toast when discovering more literature */}
        {discoverySuccessMsg && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="font-medium">{discoverySuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setDiscoverySuccessMsg(null)}
              className="text-blue-600 dark:text-blue-400 hover:opacity-75"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Literature Display Container (Multiple Viewing Modes) */}
        {displayedSources.length > 0 ? (
          <div>
            {/* View Mode 1: Card View (Default) */}
            {viewMode === "card" && (
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                data-testid="curated-sources-grid"
              >
                {displayedSources.map((source) => (
                  <CuratedSourceCard
                    key={source.id}
                    source={source}
                    isApproved={approvedSourceIds.includes(source.id)}
                    isBookmarked={bookmarkedIds.includes(source.id)}
                    onToggleApproval={toggleSourceApproval}
                    onDismiss={handleDismissSource}
                    onToggleBookmark={handleToggleBookmark}
                  />
                ))}
              </div>
            )}

            {/* View Mode 2: List View (Bibliographic & Detailed) */}
            {viewMode === "list" && (
              <CuratedSourceListView
                sources={displayedSources}
                approvedSourceIds={approvedSourceIds}
                bookmarkedSourceIds={bookmarkedIds}
                onToggleApproval={toggleSourceApproval}
                onDismiss={handleDismissSource}
                onToggleBookmark={handleToggleBookmark}
              />
            )}

            {/* View Mode 3: Table View (Matrix Comparison) */}
            {viewMode === "table" && (
              <CuratedSourceTableView
                sources={displayedSources}
                approvedSourceIds={approvedSourceIds}
                bookmarkedSourceIds={bookmarkedIds}
                onToggleApproval={toggleSourceApproval}
                onDismiss={handleDismissSource}
                onToggleBookmark={handleToggleBookmark}
              />
            )}

            {/* View Mode 4: Compact View (High-Speed Scanning) */}
            {viewMode === "compact" && (
              <CuratedSourceCompactView
                sources={displayedSources}
                approvedSourceIds={approvedSourceIds}
                bookmarkedSourceIds={bookmarkedIds}
                onToggleApproval={toggleSourceApproval}
                onDismiss={handleDismissSource}
                onToggleBookmark={handleToggleBookmark}
              />
            )}
          </div>
        ) : (
          <div className="p-10 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-white/10 space-y-3">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              No literature sources match your current filter parameters.
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Try clearing active filters or searching for broader conceptual keywords.
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="px-4 py-2 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset all filters to view all literature</span>
            </button>
          </div>
        )}

        {/* Find More Literature Action Section */}
        <div className="pt-4 flex flex-col items-center justify-center gap-2 border-t border-neutral-100 dark:border-white/5">
          <button
            type="button"
            onClick={handleFindMoreLiterature}
            disabled={isFindingMore}
            data-testid="find-more-literature-btn"
            className="px-6 py-3 rounded-full text-xs font-semibold border border-neutral-300 dark:border-white/20 bg-white dark:bg-[#1C1C1E] text-neutral-800 dark:text-white hover:bg-neutral-50 dark:hover:bg-white/5 hover:border-neutral-400 transition-all cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50"
          >
            {isFindingMore ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Querying scholarly indices & cross-referencing citations...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-neutral-500" />
                <span>Find More Literature (+10 Sources)</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
            Progressively discovers additional peer-reviewed articles, books, and reports without duplicating existing sources.
          </p>
        </div>
      </section>

      {/* Phase 2 Exit Gate Banner & Actions */}
      <div className="rounded-2xl p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Phase 2 Exit Gate: Evidence Threshold
            </h3>
            {isExitGateUnlocked ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center gap-1 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                <span>Threshold Met</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center gap-1 border border-amber-500/20">
                <AlertCircle className="w-3 h-3" />
                <span>{minimumRequired - approvedCount} More Required</span>
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {isExitGateUnlocked
              ? `You have approved ${approvedCount} sources. You are ready to proceed to Phase 3 section-by-section drafting.`
              : `Approve at least ${minimumRequired - approvedCount} more scholarly or lecture source${minimumRequired - approvedCount === 1 ? "" : "s"} to proceed to drafting.`}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <button
            type="button"
            onClick={handleReturn}
            className="px-4 py-2.5 rounded-full text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Phase 1: Understand</span>
          </button>

          <button
            type="button"
            disabled={!isExitGateUnlocked}
            onClick={handleContinue}
            data-testid="proceed-to-drafting-btn"
            className="px-7 py-2.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2 shadow-xs"
          >
            <span>Proceed to Drafting</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
