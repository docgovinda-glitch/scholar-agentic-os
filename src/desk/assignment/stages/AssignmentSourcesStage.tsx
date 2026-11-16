import { DEFAULT_CITATION_STYLE } from "../../../domain/assignment/answerKeys";
import { SourcesAgentPanel } from "../components/AgentPanels";
import { filterAndSortSources,normalizeRelevance } from "../services/sourceFilters";
import { useSourceFilters } from "../components/sources/useSourceFilters";
import { splitAuthorList } from "../services/personName";
import { formatSourceBibliography } from "../services/citationFormatService";
import { useState,useEffect,useMemo,useCallback,useRef } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { ApprovedReferencesShelf } from "../ApprovedReferencesShelf";
import { areSourcesRelevantToBrief } from "../../../utils/briefSourceQueries";
import {
discoverRealScholarlySourcesFromServer,
discoverSourcesForAssignment,
fetchMoreRealSources,
} from "../services/realScholarlyDiscoveryService";
import { SectionAnalysisWorkspace } from "../components/SectionAnalysisWorkspace";
import type {
DiscoveredSource,
UploadedSourceDocument,
EvidenceItem,
SourceAcademicType,
SectionAnalyticalSynthesis,
} from "../types";
import { selectCitedSources } from "../services/exportText";
import { flattenStructureSubheadings } from "../types";
import {
Library,CheckCircle2,
Sparkles,RefreshCw,X,
Copy,Check,LayoutGrid,
List
} from "lucide-react";
import { SourcesFilterDrawer } from "../components/sources/SourcesFilterDrawer";
import { SourcesCustomReferenceForm } from "../components/sources/SourcesCustomReferenceForm";
import { SourcesFilterBar } from "../components/sources/SourcesFilterBar";
import { SourcesExitGate } from "../components/sources/SourcesExitGate";
import { SourcesEmptyState } from "../components/sources/SourcesEmptyState";
import { SourcesDiscoveringState } from "../components/sources/SourcesDiscoveringState";
import { SourcesFindMore } from "../components/sources/SourcesFindMore";
import { SourcesCatalog } from "../components/sources/SourcesCatalog";
import { SourcesQueryBar } from "../components/sources/SourcesQueryBar";
import { SourcesCourseMaterials } from "../components/sources/SourcesCourseMaterials";
import { mergeSearchResults } from "../services/sourceMerge";
import { selectApprovedSources } from "../../../domain/assignment/approvedSources";

/** A source's reference entry in the project's style, from the shared formatter. */
export function formatSourceReference(source: Partial<DiscoveredSource>, style: string): string {
  return formatSourceBibliography(source, style || DEFAULT_CITATION_STYLE);
}


export interface AssignmentSourcesStageProps {
  onProceed?: () => void;
  onBack?: () => void;
}

/** Relevance as a 0-100 integer whatever the source scale (0-1 fractions included). */

export default function AssignmentSourcesStage({
  onProceed,
  onBack,
}: AssignmentSourcesStageProps) {
  const {
    projectId,
    project,
    saveAnswers,
    question,
    assignmentBriefText,
    citationStyle,
    structure,
    sources,
    setSources,
    internalSections,
    approvedSourceIds,
    setApprovedSourceIds,
    toggleSourceApproval,
    userUploadedSources,
    addUserUploadedSource,
    removeUserUploadedSource,
    addEvidenceItem,
    advancePhase,
    setPhase,
  } = useAssignmentWorkspace();

  // Active Main View: Unified Evidence Vault vs AI Analysis Workspace
  const [activeMainView, setActiveMainView] = useState<"vault" | "analysis">("vault");
  const projectAnswers = project?.answers || {};
  const savedSyntheses = (projectAnswers.analytical_syntheses || projectAnswers.analyticalSyntheses || []) as SectionAnalyticalSynthesis[];

  const handleSaveSyntheses = async (newSyntheses: SectionAnalyticalSynthesis[]) => {
    if (saveAnswers) await saveAnswers({ analytical_syntheses: newSyntheses });
  };

  // Outline subheadings & view mode
  const subheadings = useMemo(() => flattenStructureSubheadings(structure), [structure]);
  // Compact list by default; cards are one click away in the view switcher.
  const [viewMode, setViewMode] = useState<"bar" | "card">("bar");


  // Filter & Search states
  const filters = useSourceFilters();
  const {
    activeTab, setActiveTab, searchQuery, setSearchQuery, selectedType, setSelectedType, selectedRole, setSelectedRole,
    selectedMethodology, setSelectedMethodology, selectedYearRange, setSelectedYearRange, minRelevance, setMinRelevance,
    openAccessOnly, setOpenAccessOnly, sortBy, setSortBy, showAdvancedFilters, setShowAdvancedFilters,
    activeFilterCount, resetAllFilters,
  } = filters;

  // Progressive discovery state
  const [isFindingMore, setIsFindingMore] = useState(false);
  const [isDiscoveringInitial, setIsDiscoveringInitial] = useState(false);
  const [discoverySuccessMsg, setDiscoverySuccessMsg] = useState<string | null>(null);
  // A notice that clears itself; a failure stays until the student closes it.
  const flash = (message: string, ms = 5000) => {
    setDiscoverySuccessMsg(message);
    setTimeout(() => setDiscoverySuccessMsg((cur) => (cur === message ? null : cur)), ms);
  };

  // AI Literature Discovery & Search state
  const [aiSearchPrompt, setAiSearchPrompt] = useState("");
  const [isAISearching, setIsAISearching] = useState(false);
  const [recentlyRemovedSource, setRecentlyRemovedSource] = useState<DiscoveredSource | null>(null);

  // Manual reference entry
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customForm, setCustomForm] = useState({
    title: "",
    authors: "",
    year: `${new Date().getFullYear()}`,
    type: "journal" as SourceAcademicType,
    journal: "",
    volumeIssue: "",
    doi: "",
    citation: "",
    roleInAssignment: "Empirical evidence",
  });
  const [copiedAll, setCopiedAll] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);



  const handleSaveSourceUpdates = useCallback(
    async (sourceId: string, updates: Partial<DiscoveredSource>) => {
      const updatedSources = sources.map((s) => {
        if (s.id === sourceId) {
          return {
            ...s,
            ...updates,
          };
        }
        return s;
      });
      await setSources(updatedSources);
      flash("Reference updated successfully.", 3000);
    },
    [sources, setSources]
  );

  // Knowledge Vault channel: chosen vault items join the project as approved sources.
  const handleAddVaultSources = async (vaultSources: DiscoveredSource[]) => {
    const have = new Set(sources.map((s) => s.id));
    const fresh = vaultSources.filter((s) => !have.has(s.id));
    if (fresh.length === 0) return;
    await setSources([...fresh, ...sources]);
    if (setApprovedSourceIds) {
      await setApprovedSourceIds(Array.from(new Set([...approvedSourceIds, ...fresh.map((s) => s.id)])));
    }
    flash(`Added ${fresh.length} source${fresh.length === 1 ? "" : "s"} from your Knowledge Vault`, 3000);
  };

  const handleAddCustomSource = async () => {
    if (!customForm.title.trim()) return;

    const authorsList = splitAuthorList(customForm.authors);
    // The student's own citation text wins; otherwise the shared formatter writes it.
    const autoCitation =
      customForm.citation.trim() ||
      formatSourceReference(
        { title: customForm.title.trim(), authors: authorsList, year: customForm.year || "n.d.", journal: customForm.journal, doi: customForm.doi },
        citationStyle
      );

    const newSource: DiscoveredSource = {
      id: `src-custom-${Date.now()}`,
      title: customForm.title.trim(),
      authors: authorsList,
      year: customForm.year.trim() || "n.d.",
      type: customForm.type,
      journal: customForm.journal.trim(),
      volumeIssue: customForm.volumeIssue.trim(),
      doi: customForm.doi.trim(),
      citation: autoCitation,
      roleInAssignment: customForm.roleInAssignment,
      // Added by the student: no match score, and no finding written for them.
      mainFinding: "",
      suggestedUse: "Direct evidentiary and theoretical citation in assignment body.",
      status: "kept",
      // Entered by the student: not verified against an index, so not labelled peer-reviewed.
      isVerifiedAcademic: false,
    };

    const nextSources = [newSource, ...sources];
    await setSources(nextSources);
    const nextApproved = Array.from(new Set([...approvedSourceIds, newSource.id]));
    if (setApprovedSourceIds) {
      await setApprovedSourceIds(nextApproved);
    }
    setIsAddingCustom(false);
    setCustomForm({
      title: "",
      authors: "",
      year: `${new Date().getFullYear()}`,
      type: "journal",
      journal: "",
      volumeIssue: "",
      doi: "",
      citation: "",
      roleInAssignment: "Empirical evidence",
    });
    flash("Custom reference added and approved.", 3000);
  };


  const handleCopyAllReferences = () => {
    const approved = selectApprovedSources(allMasterSources, approvedSourceIds);
    const text = approved
      .map((s) => formatSourceReference(s, citationStyle))
      .sort((a, b) => a.localeCompare(b))
      .join("\n\n");
    navigator.clipboard?.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

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
    return !areSourcesRelevantToBrief(sources, question);
  }, [sources, question]);

  const hasTopic = Boolean(question && question.trim().length >= 4);
  const hasUploadedDocs = Boolean(userUploadedSources && userUploadedSources.length > 0);

  // Track the question we have already auto-curated for to prevent re-entrant loops
  const lastAutoCuratedQuestionRef = useRef<string | null>(null);
  // The latest list and approvals, for searches that finish after they changed.
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const approvedRef = useRef(approvedSourceIds);
  approvedRef.current = approvedSourceIds;

  // Initialize curated sources on first mount or when question topic meaningfully shifts
  // Strict Empty State: If no question/topic and no uploaded materials, render 0 cards.
  useEffect(() => {
    if (!hasTopic && !hasUploadedDocs) {
      // No brief any more: unreviewed search results go, the student's own sources stay.
      const { sources: kept } = mergeSearchResults(sources, [], approvedRef.current, "replace");
      if (kept.length !== sources.length) setSources(kept);
      return;
    }

    const currentNormalizedTopic = (question || "").trim();
    const shouldDiscover = sources.length === 0 || (isMismatched && lastAutoCuratedQuestionRef.current !== currentNormalizedTopic);
    
    if (!shouldDiscover) return;
    
    lastAutoCuratedQuestionRef.current = currentNormalizedTopic;

    // Multi-portal scholarly search (OpenAlex, Crossref, DOAJ, DataCite, arXiv). A new
    // search replaces only unreviewed results; nothing found is approved for the student.
    let cancelled = false;
    setIsDiscoveringInitial(true);
    discoverSourcesForAssignment({ question, briefText: assignmentBriefText, citationStyle })
      .then((discovered) => {
        if (!cancelled) {
          const { sources: next, added } = mergeSearchResults(sourcesRef.current, discovered, approvedRef.current, "replace");
          setSources(next);
          setIsDiscoveringInitial(false);
          if (added.length > 0) flash(`Found ${added.length} sources in academic databases. Approve the ones you want to use.`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // No invented fallback, and the current list is left as it is.
          setIsDiscoveringInitial(false);
          setDiscoverySuccessMsg("Literature search is unavailable right now. Try again, or add your own sources.");
        }
      });
    
    return () => { cancelled = true; };
  }, [sources.length, isMismatched, question, citationStyle, setSources, hasTopic, hasUploadedDocs]);

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

  // Re-curate literature for active assignment prompt (uses real API with fallback)
  const handleReCurateForPrompt = async () => {
    setIsFindingMore(true);
    try {
      const discovered = await discoverSourcesForAssignment({ question, briefText: assignmentBriefText, citationStyle });
      // Approved, prescribed, Vault and hand-added sources stay; approvals are untouched.
      const { sources: next, added } = mergeSearchResults(sources, discovered, approvedSourceIds, "replace");
      await setSources(next);
      flash(
        added.length > 0
          ? `Found ${added.length} new sources from OpenAlex, Crossref, DOAJ, DataCite & arXiv. Your approved and own sources were kept.`
          : "No new sources found for this question. Try rewording it, or add your own sources."
      );
    } catch {
      setDiscoverySuccessMsg("Literature search is unavailable right now. Nothing was changed. Try again, or add your own sources.");
    }
    setIsFindingMore(false);
  };

  // Progressive Discovery: Find More Literature (uses real API with fallback)
  const handleFindMoreLiterature = async () => {
    setIsFindingMore(true);
    try {
      const moreBatch = await fetchMoreRealSources(sources, question, 10);
      const { sources: next, added } = mergeSearchResults(sources, moreBatch, approvedSourceIds, "add");
      if (added.length > 0) await setSources(next);
      flash(
        added.length > 0
          ? `Found ${added.length} more sources. Approve the ones you want to use.`
          : "No further sources found for this question."
      );
    } catch {
      setDiscoverySuccessMsg("Literature search is unavailable right now. Nothing was changed. Try again later.");
    }
    setIsFindingMore(false);
  };

  // Targeted search: the student's phrase together with the assignment question.
  const handleAISearchLiterature = async (customQuery?: string) => {
    const queryToRun = (customQuery || aiSearchPrompt).trim();
    if (!queryToRun) return;

    setIsAISearching(true);
    try {
      const combinedTopic = question ? `${question} — ${queryToRun}` : queryToRun;
      const found = await discoverRealScholarlySourcesFromServer(combinedTopic, citationStyle);
      const { sources: next, added } = mergeSearchResults(
        sources,
        found.map((s) => ({ ...s, sourceOrigin: "ai_research", originTag: "ai-research" as const })),
        approvedSourceIds,
        "add"
      );
      const batch = added.slice(0, 5);
      if (batch.length > 0) {
        const keep = new Set(batch.map((s) => s.id));
        await setSources(next.filter((s) => !added.includes(s) || keep.has(s.id)));
      }
      setAiSearchPrompt("");
      flash(
        batch.length > 0
          ? `Found ${batch.length} new source${batch.length === 1 ? "" : "s"} for "${queryToRun}". Approve the ones you want to use.`
          : `No new sources for "${queryToRun}": everything found is already in your list. Try other keywords.`
      );
    } catch (err) {
      console.error("Source search error:", err);
      setDiscoverySuccessMsg("The search did not run (the databases did not answer). Nothing was changed. Try again.");
    } finally {
      setIsAISearching(false);
    }
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

  // A source the draft already cites leaves a dangling citation when it is removed
  // or un-approved: say where, so the student can undo now or fix the text
  // (the submission check flags it either way). Returns whether it warned.
  const warnIfCited = (source: DiscoveredSource | undefined, verb: string, fix: string): boolean => {
    if (!source) return false;
    const citing = (internalSections || []).filter(
      (sec) => sec.draftContent && selectCitedSources([{ ...source, prescribedInBrief: false }], sec.draftContent).length > 0
    );
    if (citing.length === 0) return false;
    const where = citing.map((sec) => `"${sec.title.slice(0, 40)}"`).join(", ");
    flash(
      `${verb} "${source.title.slice(0, 42)}". Your draft still cites it in ${where}: ${fix}, or edit that citation (the submission check will flag it).`
    , 12000);
    return true;
  };

  const handleToggleApproval = async (sourceId: string) => {
    const wasApproved = approvedSourceIds.includes(sourceId);
    await toggleSourceApproval(sourceId);
    if (wasApproved) warnIfCited(sources.find((s) => s.id === sourceId), "Un-approved", "approve it again");
  };

  // Dismiss / Delete source with clean removal & Undo option
  const handleDismissSource = async (sourceId: string) => {
    const isUserDoc = userUploadedSources.some((doc) => doc.id === sourceId);
    if (isUserDoc) {
      await removeUserUploadedSource(sourceId);
      flash("Removed uploaded material from assignment.", 3000);
      return;
    }

    const removedSource = sources.find((s) => s.id === sourceId);
    if (removedSource) {
      setRecentlyRemovedSource(removedSource);
    }

    // Remove from approvedSourceIds
    const nextApproved = approvedSourceIds.filter((id) => id !== sourceId);
    if (setApprovedSourceIds) {
      await setApprovedSourceIds(nextApproved);
    }

    // Mark as excluded / removed from active list
    setExcludedIds((prev) => Array.from(new Set([...prev, sourceId])));
    const nextSources = sources.map((s) =>
      s.id === sourceId ? { ...s, isExcluded: true, status: "removed" as const } : s
    );
    await setSources(nextSources);

    if (!warnIfCited(removedSource, "Removed", "undo")) {
      flash(`Removed "${removedSource?.title?.slice(0, 42) || "source"}..." from assignment.`, 5000);
    }
  };

  // Undo accidental removal
  const handleUndoDismiss = async () => {
    if (!recentlyRemovedSource) return;
    const restoredId = recentlyRemovedSource.id;
    setExcludedIds((prev) => prev.filter((id) => id !== restoredId));
    const nextSources = sources.map((s) =>
      s.id === restoredId ? { ...s, isExcluded: false, status: "kept" as const } : s
    );
    await setSources(nextSources);
    if (setApprovedSourceIds) {
      await setApprovedSourceIds(Array.from(new Set([...approvedSourceIds, restoredId])));
    }
    setRecentlyRemovedSource(null);
    flash("Restored source back into assignment.", 3000);
  };

  // Restore excluded source

  const handleLectureUpload = async (docs: UploadedSourceDocument[], newEvidences?: EvidenceItem[]) => {
    for (const doc of docs) {
      await addUserUploadedSource(doc);
    }
    if (setApprovedSourceIds) {
      const docIds = docs.map((d) => d.id);
      await setApprovedSourceIds(Array.from(new Set([...approvedSourceIds, ...docIds])));
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
    flash(`Added and analyzed ${docs.length} course material(s). Grounded in your assignment.`, 4000);
  };

  const handleLectureRemove = async (docId: string) => {
    await removeUserUploadedSource(docId);
  };

  const handleContinue = () => {
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

  // Base list of scholarly curated sources
  const allCuratedSources = useMemo(() => {
    // Strict empty-state guard:
    // If no brief/prompt has been submitted and no course files have been uploaded, literature count must strictly equal 0.
    if (!hasTopic && !hasUploadedDocs) {
      return [];
    }
    // Only sources actually in state (live discovery results or the user's own).
    const raw = sources && sources.length > 0 ? sources : [];

    return raw.map((s) => ({
      ...s,
      // Brief-driven discovery (incl. prescribed references) counts under Ask Scholar;
      // AI-search results under AI Research. Unknown origins never fall out of every tab.
      sourceOrigin:
        s.sourceOrigin === "ai_research" || s.sourceOrigin === "user"
          ? s.sourceOrigin
          : s.sourceOrigin === "ask_scholar"
          ? "ask_scholar"
          : s.originTag === "ai-research"
          ? "ai_research"
          : "ask_scholar",
      relevanceScore: normalizeRelevance(s.relevanceScore),
      status: s.status || "kept",
    }));
  }, [sources, question, citationStyle, hasTopic, hasUploadedDocs]);

  // Map user-uploaded documents to DiscoveredSource objects to unify into literature collection
  const mappedUserSources = useMemo<DiscoveredSource[]>(() => {
    return (userUploadedSources || []).map((doc) => {
      const authorList = doc.author ? [doc.author] : [];
      // Upload date is not a publication date; unknown stays unknown.
      const yearStr = doc.publicationDate ? doc.publicationDate.slice(0, 4) : "n.d.";
      const formatBadge = (doc.sourceType || "doc").toUpperCase();

      return {
        id: doc.id,
        title: doc.name,
        authors: authorList,
        year: yearStr,
        type: (doc.sourceType === "weblink"
          ? "web"
          : doc.sourceType === "spreadsheet"
          ? "institutional"
          : "report") as SourceAcademicType,
        journal: `Course & User Materials (${formatBadge})`,
        publisher: "Course Grounding Source",
        mainFinding: doc.relevanceSummary || "",
        suggestedUse:
          "Direct primary evidence, lecture slide grounding, professor rubric alignment, or case empirical data.",
        citation: doc.citation || `${doc.name} (${yearStr}). Course Grounding Document.`,
        abstract: doc.extractedText
          ? doc.extractedText.slice(0, 400) + (doc.extractedText.length > 400 ? "..." : "")
          : "Extracted document content indexed and cross-referenced with your assignment prompt.",
        citationCount: 1,
        citationImpact: "Course Material",
        methodology: doc.sourceType === "spreadsheet" ? "Quantitative Dataset" : "Curricular / Primary Material",
        keyConcepts: ["Course Grounding", "Primary Evidence", formatBadge],
        domain: "Course Grounding & User Sources",
        isOpenAccess: true,
        isVerifiedAcademic: true,
        sourceCredibility: "verified-academic",
        status: "kept",
        isUserUploaded: true,
        sourceOrigin: "user",
        userDocumentId: doc.id,
        sourceFormatBadge: formatBadge,
        extractedEvidences: doc.extractedEvidences || [],
        structuredDataSummary: doc.structuredDataSummary,
      };
    });
  }, [userUploadedSources]);

  // Master unified collection: User Uploaded + Curated Scholarly
  const allMasterSources = useMemo<DiscoveredSource[]>(() => {
    return [...mappedUserSources, ...allCuratedSources];
  }, [mappedUserSources, allCuratedSources]);

  const approvedSourcesList = useMemo<DiscoveredSource[]>(() => {
    return selectApprovedSources(allMasterSources, approvedSourceIds);
  }, [allMasterSources, approvedSourceIds]);

  // Filter and sort sources
  const displayedSources = useMemo(
    () => filterAndSortSources(allMasterSources, filters, { approvedSourceIds, bookmarkedIds, excludedIds }),
    [allMasterSources, filters, approvedSourceIds, bookmarkedIds, excludedIds]
  );


  const totalActiveSources = allMasterSources.filter(
    (s) => !excludedIds.includes(s.id) && !s.isExcluded && s.status !== "removed"
  ).length;

  const totalCuratedCount = allCuratedSources.filter(
    (s) => !excludedIds.includes(s.id) && !s.isExcluded && s.status !== "removed"
  ).length;

  const askScholarCount = allMasterSources.filter(
    (s) => s.sourceOrigin === "ask_scholar" && !excludedIds.includes(s.id) && !s.isExcluded && s.status !== "removed"
  ).length;

  const aiResearchCount = allMasterSources.filter(
    (s) => s.sourceOrigin === "ai_research" && !excludedIds.includes(s.id) && !s.isExcluded && s.status !== "removed"
  ).length;

  const approvedCount = approvedSourceIds.length > 0 ? approvedSourceIds.length : totalActiveSources;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 pb-32 space-y-7 animate-in fade-in duration-200">
      {/* Stage Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[color:var(--border-subtle)] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)]">
              Phase 03
            </span>
            <span className="text-xs font-semibold text-[color:var(--text-muted)]">
              Find and approve your sources
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
            Sources & Course Materials
          </h1>
          <p className="text-xs sm:text-sm text-[color:var(--text-muted)] max-w-2xl leading-relaxed">
            Upload course slides, syllabus, or readings to ground your citations.
          </p>
        </div>

        {/* View Switcher & Evidence Base Counter (Top Header View) */}
        {allMasterSources.length > 0 && (
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 shrink-0">
            {/* View Switcher: Evidence Vault vs AI Analysis */}
            <div className="flex items-center gap-1 bg-[color:var(--surface-inset)] p-1 rounded-2xl border border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setActiveMainView("vault")}
                data-testid="view-evidence-vault-btn"
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeMainView === "vault"
                    ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs"
                    : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <Library className="w-3.5 h-3.5" />
                <span>All sources ({allMasterSources.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMainView("analysis")}
                data-testid="view-ai-analysis-btn"
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeMainView === "analysis"
                    ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs"
                    : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>AI Analysis</span>
              </button>
            </div>

          </div>
        )}
      </div>

      {/* The agent: real search, AI reading of abstracts, links to the outline */}
      <SourcesAgentPanel minimal />

      {isDiscoveringInitial && allMasterSources.length === 0 ? (
        <SourcesDiscoveringState />
      ) : allMasterSources.length === 0 ? (
        <SourcesEmptyState citationStyle={citationStyle} handleAddVaultSources={handleAddVaultSources} handleContinue={handleContinue} handleLectureRemove={handleLectureRemove} handleLectureUpload={handleLectureUpload} projectId={projectId} question={question} sources={sources} userUploadedSources={userUploadedSources} />
      ) : activeMainView === "analysis" ? (
        <SectionAnalysisWorkspace
          structure={structure}
          sources={allMasterSources}
          question={question}
          citationStyle={citationStyle}
          onCitationStyleChange={(newStyle) => {
            if (saveAnswers) {
              saveAnswers({ citationStyle: newStyle, citation_style: newStyle });
            }
          }}
          onProceedToDrafting={handleContinue}
          onBackToVault={() => setActiveMainView("vault")}
          savedSyntheses={savedSyntheses}
          onSaveSyntheses={handleSaveSyntheses}
        />
      ) : (
        <>
          <SourcesCourseMaterials citationStyle={citationStyle} handleAddVaultSources={handleAddVaultSources} handleLectureRemove={handleLectureRemove} handleLectureUpload={handleLectureUpload} isUploadOpen={isUploadOpen} projectId={projectId} question={question} setIsUploadOpen={setIsUploadOpen} sources={sources} userUploadedSources={userUploadedSources} />

          {/* Section 2: Curated Academic Literature & Source Collection */}
          <section className="space-y-4 pt-4 border-t border-[color:var(--border-subtle)]">
            {/* Workspace Toolbar Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
                  <Library className="w-4 h-4 text-[color:var(--text-secondary)]" />
                  <span>Curated Scholarly Literature</span>
                  <span className="text-xs font-mono font-medium text-[color:var(--text-muted)]">
                    ({allMasterSources.length} identified)
                  </span>
                </h2>
                <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                  Peer-reviewed journal articles, seminal academic books, and user-uploaded course grounding materials.
                </p>
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center gap-1 bg-[color:var(--surface-inset)] p-1 rounded-xl self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setViewMode("bar")}
                  title="Compact Bar View"
                  aria-label="Compact Bar View"
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    viewMode === "bar"
                      ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-2xs font-semibold"
                      : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Compact Bars</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("card")}
                  title="Detailed Cards"
                  aria-label="Detailed Cards"
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    viewMode === "card"
                      ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-2xs font-semibold"
                      : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Detailed Cards</span>
                </button>
              </div>
            </div>

            {/* Topic Mismatch Notice Banner if user changed prompt but has previously approved sources */}
            {isMismatched && approvedSourceIds.length > 0 && (
              <p className="flex items-center justify-between gap-3 text-xs text-[color:var(--text-secondary)]" data-testid="question-changed-notice">
                <span>Your assignment question has changed.</span>
                <button
                  type="button"
                  onClick={handleReCurateForPrompt}
                  disabled={isFindingMore}
                  className="px-2.5 py-1 rounded-lg border border-[color:var(--border-subtle)] text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isFindingMore ? "animate-spin" : ""}`} />
                  Refresh Sources
                </button>
              </p>
            )}

            <SourcesQueryBar aiSearchPrompt={aiSearchPrompt} handleAISearchLiterature={handleAISearchLiterature} isAISearching={isAISearching} setAiSearchPrompt={setAiSearchPrompt} />

            <SourcesFilterBar activeFilterCount={activeFilterCount} activeTab={activeTab} aiResearchCount={aiResearchCount} approvedSourceIds={approvedSourceIds} askScholarCount={askScholarCount} bookmarkedIds={bookmarkedIds} excludedIds={excludedIds} handleReCurateForPrompt={handleReCurateForPrompt} isFindingMore={isFindingMore} mappedUserSources={mappedUserSources} searchQuery={searchQuery} setActiveTab={setActiveTab} setIsAddingCustom={setIsAddingCustom} setSearchQuery={setSearchQuery} setShowAdvancedFilters={setShowAdvancedFilters} showAdvancedFilters={showAdvancedFilters} totalActiveSources={totalActiveSources} totalCuratedCount={totalCuratedCount} />

            <SourcesCustomReferenceForm customForm={customForm} handleAddCustomSource={handleAddCustomSource} isAddingCustom={isAddingCustom} setCustomForm={setCustomForm} setIsAddingCustom={setIsAddingCustom} />

            <SourcesFilterDrawer activeFilterCount={activeFilterCount} minRelevance={minRelevance} openAccessOnly={openAccessOnly} resetAllFilters={resetAllFilters} selectedMethodology={selectedMethodology} selectedRole={selectedRole} selectedType={selectedType} selectedYearRange={selectedYearRange} setMinRelevance={setMinRelevance} setOpenAccessOnly={setOpenAccessOnly} setSelectedMethodology={setSelectedMethodology} setSelectedRole={setSelectedRole} setSelectedType={setSelectedType} setSelectedYearRange={setSelectedYearRange} setSortBy={setSortBy} showAdvancedFilters={showAdvancedFilters} sortBy={sortBy} />

            {/* Notification Toast with Undo */}
            {discoverySuccessMsg && (
              <div className="p-3 rounded-xl bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] border border-neutral-700/80 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 shadow-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span data-testid="sources-notice" className="font-medium text-neutral-100">{discoverySuccessMsg}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {recentlyRemovedSource && (
                    <button
                      type="button"
                      onClick={handleUndoDismiss}
                      className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white font-semibold text-xs cursor-pointer transition-colors"
                    >
                      Undo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDiscoverySuccessMsg(null)}
                    className="text-[color:var(--text-muted)] hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Dedicated Bibliography Header when on Approved Tab */}
            {activeTab === "approved" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div>
                  <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Your Selected References ({approvedCount})</span>
                  </h3>
                  <p className="text-xs text-emerald-800/80 dark:text-emerald-300/70 mt-0.5">
                    All citations formatted in Harvard referencing (Author, Year). Click <strong>Edit Reference</strong> on any item to customize citation text or metadata.
                  </p>
                </div>
                {approvedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyAllReferences}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[color:var(--surface-raised)] border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-emerald-600" />}
                    <span>{copiedAll ? "Copied All!" : "Copy Bibliography"}</span>
                  </button>
                )}
              </div>
            )}

            <SourcesCatalog approvedSourceIds={approvedSourceIds} bookmarkedIds={bookmarkedIds} citationStyle={citationStyle} displayedSources={displayedSources} handleDismissSource={handleDismissSource} handleSaveSourceUpdates={handleSaveSourceUpdates} handleToggleApproval={handleToggleApproval} handleToggleBookmark={handleToggleBookmark} resetAllFilters={resetAllFilters} subheadings={subheadings} viewMode={viewMode} />

            <SourcesFindMore handleFindMoreLiterature={handleFindMoreLiterature} isFindingMore={isFindingMore} />
          </section>
        </>
      )}

      <SourcesExitGate approvedCount={approvedCount} handleContinue={handleContinue} handleReturn={handleReturn} />
      {/* Floating Bottom Reference Shelf Dock */}
      <ApprovedReferencesShelf
        approvedSources={approvedSourcesList}
        onToggleApproval={handleToggleApproval}
        onProceedToDrafting={handleContinue}
        citationStyle={citationStyle || DEFAULT_CITATION_STYLE}
        onSaveEditSource={handleSaveSourceUpdates}
      />
    </div>
  );
}
