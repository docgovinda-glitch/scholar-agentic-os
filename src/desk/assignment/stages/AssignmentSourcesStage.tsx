import { SourcesAgentPanel } from "../components/AgentPanels";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { ReferenceBarItem } from "../ReferenceBarItem";
import { ApprovedReferencesShelf } from "../ApprovedReferencesShelf";
import { CuratedSourceCard } from "../components/CuratedSourceCard";
import { LectureUploadDropzone } from "../components/LectureUploadDropzone";
import { ScholarlyResearchPipeline } from "../components/ScholarlyResearchPipeline";
import {
  areSourcesRelevantToQuestion,
} from "../services/scholarlyDiscoveryService";
import {
  discoverRealScholarlySourcesFromServer,
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
import { flattenStructureSubheadings } from "../types";
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
  Star,
  SlidersHorizontal,
  Unlock,
  RotateCcw,
  BookOpen,
  FolderOpen,
  X,
  Copy,
  Edit2,
  Plus,
  Trash2,
  Check,
  FileUp,
  Tag,
  LayoutGrid,
  List,
} from "lucide-react";

export function formatHarvardCitation(source: Partial<DiscoveredSource>): string {
  if (source.citation && source.citation.trim()) {
    return source.citation.trim();
  }
  const rawAuthors = (source as any).authors;
  const authorsStr =
    Array.isArray(rawAuthors) && rawAuthors.length > 0
      ? rawAuthors.join(", ")
      : typeof rawAuthors === "string" && rawAuthors.trim()
      ? rawAuthors.trim()
      : "[Author unknown]";
  const yearStr = source.year || "n.d.";
  const titleStr = source.title ? `'${source.title}'` : "Untitled";
  const venueStr = source.journal || source.publisher || "";
  const volStr = source.volumeIssue ? `, ${source.volumeIssue}` : "";
  const doiStr = source.doi ? `. doi: ${source.doi}` : source.url ? `. Available at: ${source.url}` : "";

  return `${authorsStr} (${yearStr}) ${titleStr}${venueStr ? `, ${venueStr}` : ""}${volStr}${doiStr}.`;
}


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
    project,
    saveAnswers,
    question,
    citationStyle,
    structure,
    sources,
    setSources,
    approvedSourceIds,
    setApprovedSourceIds,
    toggleSourceApproval,
    dismissSource,
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
  const savedSyntheses = (projectAnswers.analyticalSyntheses || projectAnswers.analytical_syntheses || []) as SectionAnalyticalSynthesis[];

  const handleSaveSyntheses = async (newSyntheses: SectionAnalyticalSynthesis[]) => {
    if (saveAnswers) {
      await saveAnswers({
        analyticalSyntheses: newSyntheses,
        analytical_syntheses: newSyntheses,
      });
    }
  };

  // Outline subheadings & view mode
  const subheadings = useMemo(() => flattenStructureSubheadings(structure), [structure]);
  const [selectedSubheadingId, setSelectedSubheadingId] = useState<string | null>(null);
  // Compact list by default; cards are one click away in the view switcher.
  const [viewMode, setViewMode] = useState<"bar" | "card">("bar");

  const getSubheadingSources = useCallback(
    (subId: string, sourceList: DiscoveredSource[]) => {
      return sourceList.filter((s) => {
        if (s.mappedSubheadingIds && s.mappedSubheadingIds.length > 0) {
          return s.mappedSubheadingIds.includes(subId);
        }
        const sub = subheadings.find((item) => item.id === subId);
        if (!sub) return false;
        const words = sub.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const combined = `${s.title} ${s.suggestedUse || ""} ${s.mainFinding || ""}`.toLowerCase();
        return words.some((w) => combined.includes(w));
      });
    },
    [subheadings]
  );

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<"all" | "curated" | "ask_scholar" | "ai_research" | "uploaded" | "approved" | "bookmarked" | "excluded">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedMethodology, setSelectedMethodology] = useState<string>("all");
  const [selectedYearRange, setSelectedYearRange] = useState<string>("all");
  const [minRelevance, setMinRelevance] = useState<number>(0);
  const [openAccessOnly, setOpenAccessOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"relevance" | "citations" | "year" | "title" | "role">("relevance");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Progressive discovery state
  const [isFindingMore, setIsFindingMore] = useState(false);
  const [isDiscoveringInitial, setIsDiscoveringInitial] = useState(false);
  const [discoverySuccessMsg, setDiscoverySuccessMsg] = useState<string | null>(null);
  const [altPoolIndex, setAltPoolIndex] = useState(0);

  // AI Literature Discovery & Search state
  const [aiSearchPrompt, setAiSearchPrompt] = useState("");
  const [isAISearching, setIsAISearching] = useState(false);
  const [recentlyRemovedSource, setRecentlyRemovedSource] = useState<DiscoveredSource | null>(null);

  // Reference editing & copy state
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    authors: "",
    year: "",
    journal: "",
    volumeIssue: "",
    doi: "",
    citation: "",
    roleInAssignment: "",
  });
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
  const [copiedSourceId, setCopiedSourceId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const handleStartEditSource = (source: DiscoveredSource) => {
    setEditingSourceId(source.id);
    setEditForm({
      title: source.title || "",
      authors: (source.authors || []).join(", "),
      year: source.year || "",
      journal: source.journal || source.publisher || "",
      volumeIssue: source.volumeIssue || "",
      doi: source.doi || "",
      citation: source.citation || formatHarvardCitation(source),
      roleInAssignment: source.roleInAssignment || "Empirical evidence",
    });
  };

  const handleSaveSourceEdit = async () => {
    if (!editingSourceId) return;

    const authorsList = editForm.authors
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const updatedSources = sources.map((s) => {
      if (s.id === editingSourceId) {
        return {
          ...s,
          title: editForm.title.trim() || s.title,
          authors: authorsList.length > 0 ? authorsList : s.authors,
          year: editForm.year.trim() || s.year,
          journal: editForm.journal.trim() || s.journal,
          volumeIssue: editForm.volumeIssue.trim() || s.volumeIssue,
          doi: editForm.doi.trim() || s.doi,
          citation: editForm.citation.trim() || s.citation,
          roleInAssignment: editForm.roleInAssignment || s.roleInAssignment,
        };
      }
      return s;
    });

    await setSources(updatedSources);
    setEditingSourceId(null);
    setDiscoverySuccessMsg("Reference updated successfully.");
    setTimeout(() => setDiscoverySuccessMsg(null), 3000);
  };

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
      setDiscoverySuccessMsg("Reference updated successfully.");
      setTimeout(() => setDiscoverySuccessMsg(null), 3000);
    },
    [sources, setSources]
  );

  const handleAddCustomSource = async () => {
    if (!customForm.title.trim()) return;

    const authorsList = customForm.authors
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const autoCitation =
      customForm.citation.trim() ||
      `${customForm.authors || "[Author unknown]"} (${customForm.year || "n.d."}) '${customForm.title}'${
        customForm.journal ? `, ${customForm.journal}` : ""
      }${customForm.volumeIssue ? `, ${customForm.volumeIssue}` : ""}${
        customForm.doi ? `. doi: ${customForm.doi}` : ""
      }.`;

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
      isVerifiedAcademic: true,
      sourceCredibility: "peer-reviewed",
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
    setDiscoverySuccessMsg("Custom reference added and approved.");
    setTimeout(() => setDiscoverySuccessMsg(null), 3000);
  };

  const handleCopyCitation = (source: DiscoveredSource) => {
    const text = source.citation || formatHarvardCitation(source);
    navigator.clipboard?.writeText(text);
    setCopiedSourceId(source.id);
    setTimeout(() => setCopiedSourceId(null), 2000);
  };

  const handleCopyAllReferences = () => {
    const approved = allMasterSources.filter((s) => approvedSourceIds.includes(s.id));
    const text = approved
      .map((s) => s.citation || formatHarvardCitation(s))
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
    return !areSourcesRelevantToQuestion(sources, question);
  }, [sources, question]);

  const hasTopic = Boolean(question && question.trim().length >= 4);
  const hasUploadedDocs = Boolean(userUploadedSources && userUploadedSources.length > 0);

  // Track the question we have already auto-curated for to prevent re-entrant loops
  const lastAutoCuratedQuestionRef = useRef<string | null>(null);

  // Initialize curated sources on first mount or when question topic meaningfully shifts
  // Strict Empty State: If no question/topic and no uploaded materials, render 0 cards.
  useEffect(() => {
    if (!hasTopic && !hasUploadedDocs) {
      if (sources.length > 0) {
        setSources([]);
      }
      return;
    }

    const currentNormalizedTopic = (question || "").trim();
    const shouldDiscover = sources.length === 0 || (isMismatched && lastAutoCuratedQuestionRef.current !== currentNormalizedTopic);
    
    if (!shouldDiscover) return;
    
    lastAutoCuratedQuestionRef.current = currentNormalizedTopic;

    // Try real multi-portal scholarly discovery (OpenAlex, CrossRef, DOAJ, DataCite, arXiv)
    // Falls back to mock catalog if server is unavailable
    let cancelled = false;
    setIsDiscoveringInitial(true);
    discoverRealScholarlySourcesFromServer(question, citationStyle)
      .then((discovered) => {
        if (!cancelled) {
          setSources(discovered);
          setIsDiscoveringInitial(false);
          if (discovered.length > 0 && discovered[0].retrievalSource) {
            setDiscoverySuccessMsg(`Discovered ${discovered.length} scholarly sources from academic databases.`);
            setTimeout(() => setDiscoverySuccessMsg(null), 5000);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          // No invented fallback: leave the list empty and say so.
          setSources([]);
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
      const discovered = await discoverRealScholarlySourcesFromServer(question, citationStyle);
      await setSources(discovered);
      if (setApprovedSourceIds && approvedSourceIds.length > 0) {
        await setApprovedSourceIds(discovered.map((s) => s.id));
      }
      setDiscoverySuccessMsg(
        discovered.length > 0
          ? `Discovered ${discovered.length} scholarly sources from OpenAlex, CrossRef, DOAJ, DataCite & arXiv.`
          : "No sources found for this question. Try rewording it, or add your own sources."
      );
    } catch {
      setDiscoverySuccessMsg("Literature search is unavailable right now. Try again, or add your own sources.");
    }
    setIsFindingMore(false);
    setTimeout(() => setDiscoverySuccessMsg(null), 5000);
  };

  // Progressive Discovery: Find More Literature (uses real API with fallback)
  const handleFindMoreLiterature = async () => {
    setIsFindingMore(true);
    try {
      const moreBatch = await fetchMoreRealSources(sources, question, 10);
      const nextSources = [...sources, ...moreBatch];
      await setSources(nextSources);
      if (setApprovedSourceIds) {
        await setApprovedSourceIds(Array.from(new Set([...approvedSourceIds, ...moreBatch.map((s) => s.id)])));
      }
      setDiscoverySuccessMsg(
        moreBatch.length > 0
          ? `Retrieved and added ${moreBatch.length} additional scholarly sources from academic databases.`
          : "No further sources found for this question."
      );
    } catch {
      setDiscoverySuccessMsg("Literature search is unavailable right now. Try again later.");
    }
    setIsFindingMore(false);
    setTimeout(() => setDiscoverySuccessMsg(null), 5000);
  };

  // AI-Powered Targeted Literature Discovery
  const handleAISearchLiterature = async (customQuery?: string) => {
    const queryToRun = (customQuery || aiSearchPrompt).trim();
    if (!queryToRun) return;

    setIsAISearching(true);
    try {
      const combinedTopic = question ? `${question} — ${queryToRun}` : queryToRun;
      let newSources: DiscoveredSource[] = [];
      try {
        newSources = await discoverRealScholarlySourcesFromServer(combinedTopic, citationStyle);
      } catch {
        newSources = [];
      }

      const existingIds = new Set(sources.map((s) => s.id));
      const freshBatch = newSources
        .filter((s) => !existingIds.has(s.id))
        .slice(0, 5)
        .map((s, idx) => ({
          ...s,
          id: s.id.startsWith("src-") ? s.id : `src-ai-${Date.now()}-${idx}`,
          sourceOrigin: "ai_research" as const,
          originTag: "ai-research" as const,
          status: "kept" as const,
          roleInAssignment: queryToRun.toLowerCase().includes("counter")
            ? "Counter-argument"
            : queryToRun.toLowerCase().includes("theory")
            ? "Theoretical framework"
            : "Empirical evidence",
        }));

      const toAdd = freshBatch.length > 0 ? freshBatch : newSources.slice(0, 4).map((s, idx) => ({
        ...s,
        id: `src-ai-${Date.now()}-${idx}`,
        sourceOrigin: "ai_research" as const,
        originTag: "ai-research" as const,
        status: "kept" as const,
      }));

      const nextSources = [...toAdd, ...sources];
      await setSources(nextSources);

      // Auto-add newly discovered AI sources into the assignment
      if (setApprovedSourceIds) {
        const nextApproved = Array.from(new Set([...approvedSourceIds, ...toAdd.map((s) => s.id)]));
        await setApprovedSourceIds(nextApproved);
      }

      setAiSearchPrompt("");
      setDiscoverySuccessMsg(`AI found and added ${toAdd.length} source(s) on "${queryToRun}" to your assignment.`);
    } catch (err) {
      console.error("AI Literature Search error:", err);
      setDiscoverySuccessMsg("Could not retrieve additional sources for this query. Try another keyword.");
    } finally {
      setIsAISearching(false);
      setTimeout(() => setDiscoverySuccessMsg(null), 5000);
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

  // Dismiss / Delete source with clean removal & Undo option
  const handleDismissSource = async (sourceId: string) => {
    const isUserDoc = userUploadedSources.some((doc) => doc.id === sourceId);
    if (isUserDoc) {
      await removeUserUploadedSource(sourceId);
      setDiscoverySuccessMsg("Removed uploaded material from assignment.");
      setTimeout(() => setDiscoverySuccessMsg(null), 3000);
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

    setDiscoverySuccessMsg(`Removed "${removedSource?.title?.slice(0, 42) || "source"}..." from assignment.`);
    setTimeout(() => setDiscoverySuccessMsg(null), 5000);
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
    setDiscoverySuccessMsg("Restored source back into assignment.");
    setTimeout(() => setDiscoverySuccessMsg(null), 3000);
  };

  // Restore excluded source
  const handleRestoreSource = async (sourceId: string) => {
    const nextExcluded = excludedIds.filter((id) => id !== sourceId);
    setExcludedIds(nextExcluded);

    const nextSources = sources.map((s) =>
      s.id === sourceId ? { ...s, isExcluded: false, status: "kept" as const } : s
    );
    await setSources(nextSources);
    if (setApprovedSourceIds) {
      await setApprovedSourceIds(Array.from(new Set([...approvedSourceIds, sourceId])));
    }
    setDiscoverySuccessMsg("Restored source to assignment.");
    setTimeout(() => setDiscoverySuccessMsg(null), 3000);
  };

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
    setDiscoverySuccessMsg(`Added and analyzed ${docs.length} course material(s). Grounded in your assignment.`);
    setTimeout(() => setDiscoverySuccessMsg(null), 4000);
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

    return raw.map((s, idx) => ({
      ...s,
      sourceOrigin: s.sourceOrigin || (idx < 15 ? "ask_scholar" : "ai_research"),
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
    return allMasterSources.filter((s) => approvedSourceIds.includes(s.id));
  }, [allMasterSources, approvedSourceIds]);

  // Filter and sort sources
  const displayedSources = useMemo(() => {
    let list = allMasterSources;

    // 0. Subheading filter
    if (selectedSubheadingId) {
      list = getSubheadingSources(selectedSubheadingId, list);
    }

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
      list = list.filter((s) => (s.relevanceScore || 0) >= minRelevance);
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
  }, [
    allMasterSources,
    approvedSourceIds,
    bookmarkedIds,
    excludedIds,
    activeTab,
    searchQuery,
    selectedType,
    selectedRole,
    selectedMethodology,
    selectedYearRange,
    minRelevance,
    openAccessOnly,
    sortBy,
    selectedSubheadingId,
    getSubheadingSources,
  ]);

  const activeFilterCount =
    (selectedType !== "all" ? 1 : 0) +
    (selectedRole !== "all" ? 1 : 0) +
    (selectedMethodology !== "all" ? 1 : 0) +
    (selectedYearRange !== "all" ? 1 : 0) +
    (minRelevance > 0 ? 1 : 0) +
    (openAccessOnly ? 1 : 0) +
    (sortBy !== "relevance" ? 1 : 0);

  const resetAllFilters = () => {
    setSelectedType("all");
    setSelectedRole("all");
    setSelectedMethodology("all");
    setSelectedYearRange("all");
    setMinRelevance(0);
    setOpenAccessOnly(false);
    setSortBy("relevance");
    setSearchQuery("");
  };

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
  const isExitGateUnlocked = true; // Always unlocked per requirement 5
  const minimumRequired = 4;
  const progressPercent = Math.min(100, Math.round((Math.max(approvedCount, totalActiveSources) / minimumRequired) * 100));

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 pb-32 space-y-7 animate-in fade-in duration-200">
      {/* Stage Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 dark:border-white/10 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              Phase 02
            </span>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              Evidence Discovery & Course Grounding
            </span>
            <ScholarlyResearchPipeline question={question} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Sources & Course Materials
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
            Upload course slides, syllabus, or readings to ground your citations.
          </p>
          {question && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium truncate max-w-2xl pt-1">
              <span className="text-neutral-400 dark:text-neutral-500 font-normal">Topic: </span>
              <span className="text-neutral-700 dark:text-neutral-300">{question}</span>
            </p>
          )}
        </div>

        {/* View Switcher & Evidence Base Counter (Top Header View) */}
        {allMasterSources.length > 0 && (
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 shrink-0">
            {/* View Switcher: Evidence Vault vs AI Analysis */}
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-white/5 p-1 rounded-2xl border border-neutral-200/60 dark:border-white/10">
              <button
                type="button"
                onClick={() => setActiveMainView("vault")}
                data-testid="view-evidence-vault-btn"
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeMainView === "vault"
                    ? "bg-white dark:bg-ink-750 text-neutral-900 dark:text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <Library className="w-3.5 h-3.5" />
                <span>Evidence Vault ({allMasterSources.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMainView("analysis")}
                data-testid="view-ai-analysis-btn"
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeMainView === "analysis"
                    ? "bg-white dark:bg-ink-750 text-neutral-900 dark:text-white shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>AI Analysis</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span
                data-testid="evidence-counter"
                className="px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
              >
                {approvedSourceIds.length} / 4 recommended · {allMasterSources.length} in Vault
              </span>
            </div>
          </div>
        )}
      </div>

      {/* The agent: real search, AI reading of abstracts, links to the outline */}
      <div className="mb-5"><SourcesAgentPanel /></div>

      {/* Minimal Step Guidance Banner */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-neutral-100/60 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-mono font-bold text-[10px] shrink-0">
            2
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 text-xs leading-relaxed">
            Curate peer-reviewed literature and course materials. Kept and approved sources are automatically linked to your outline sections for grounded drafting with verified in-text citations.
          </p>
        </div>
        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 shrink-0 self-start sm:self-auto">
          Sources ground your citations
        </span>
      </div>

      {isDiscoveringInitial && allMasterSources.length === 0 ? (
        <div
          data-testid="sources-discovering-state"
          className="bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 rounded-2xl p-8 sm:p-12 shadow-xs dark:shadow-none"
        >
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
              <Search className="w-5 h-5 text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Discovering Scholarly Sources
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center max-w-md">
              Searching OpenAlex, CrossRef, DOAJ, DataCite & arXiv for peer-reviewed literature matching your assignment prompt…
            </p>
          </div>
        </div>
      ) : allMasterSources.length === 0 ? (
        <div
          data-testid="sources-empty-state"
          className="bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 rounded-2xl p-8 sm:p-12 shadow-xs dark:shadow-none space-y-6"
        >
          <div className="max-w-xl space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              Ground Your Assignment in Sources
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Upload your course slides, syllabus, or readings to ground your citations, or proceed to drafting directly.
            </p>
          </div>

          <LectureUploadDropzone
            uploadedFiles={userUploadedSources}
            onUpload={handleLectureUpload}
            onRemove={handleLectureRemove}
            assignmentQuestion={question}
            citationStyle={citationStyle}
            projectId={projectId}
          />

          {/* Quick Skip to Drafting option */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-neutral-200/60 dark:border-white/10">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Citing sources is optional. You can draft freely and add citations at any time.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleContinue}
                data-testid="skip-to-drafting-btn"
                className="px-5 py-2.5 rounded-full text-xs font-semibold border border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Skip to Drafting
              </button>
              <button
                type="button"
                onClick={handleContinue}
                data-testid="proceed-to-drafting-btn"
                className="px-6 py-2.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer flex items-center gap-2 shadow-xs dark:shadow-none"
              >
                <span>Proceed to Drafting</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
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
          {/* Section 1: Course Materials & Syllabus Upload (Sleek Collapsible Card) */}
          <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-ink-750 p-4 transition-all shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 shrink-0">
                  <FileUp className="w-4 h-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Course Materials & Syllabus Upload
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-500 font-medium">
                      Optional
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {userUploadedSources.length > 0
                      ? `${userUploadedSources.length} course material(s) uploaded and anchored into evidence.`
                      : "Upload lecture slides, reading packs, or syllabus notes to anchor specific citations."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsUploadOpen(!isUploadOpen)}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-neutral-700 dark:text-neutral-300 self-start sm:self-auto shrink-0"
              >
                {isUploadOpen ? "Hide Dropzone" : userUploadedSources.length > 0 ? "Manage Files" : "+ Upload Files"}
              </button>
            </div>

            <div className={isUploadOpen || userUploadedSources.length > 0 ? "mt-4 pt-4 border-t border-neutral-100 dark:border-white/5" : "hidden"}>
              <LectureUploadDropzone
                uploadedFiles={userUploadedSources}
                onUpload={handleLectureUpload}
                onRemove={handleLectureRemove}
                assignmentQuestion={question}
                citationStyle={citationStyle}
                projectId={projectId}
              />
            </div>
          </div>

          {/* Section 2: Curated Academic Literature & Source Collection */}
          <section className="space-y-4 pt-4 border-t border-neutral-200/60 dark:border-white/5">
            {/* Detailed Mode Evidence Grounding Matrix Banner */}
            <>
              <div className="rounded-2xl p-4 bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 text-xs space-y-2 font-sans animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider text-[11px]">
                      Detailed Mode · OpenAlex & CrossRef Evidence Grounding Matrix
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                    {allMasterSources.length} Sources Active · Citation Token Interceptor Ready
                  </span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                  Every approved source excerpt is assigned a deterministic token (e.g. <code>[1]</code> or <code>[ev-uuid]</code>) to ground factual statements before section drafting.
                </p>
              </div>
            </>
            {/* Workspace Toolbar Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Library className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
                  <span>Curated Scholarly Literature</span>
                  <span className="text-xs font-mono font-medium text-neutral-400">
                    ({allMasterSources.length} identified{selectedSubheadingId ? " · filtered" : ""})
                  </span>
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Peer-reviewed journal articles, seminal academic books, and user-uploaded course grounding materials.
                </p>
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center gap-1 bg-neutral-100 dark:bg-white/5 p-1 rounded-xl self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setViewMode("bar")}
                  title="Compact Bar View"
                  aria-label="Compact Bar View"
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    viewMode === "bar"
                      ? "bg-white dark:bg-ink-500 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
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
                      ? "bg-white dark:bg-ink-500 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Detailed Cards</span>
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
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shrink-0 cursor-pointer transition-colors flex items-center gap-1.5 shadow-xs dark:shadow-none"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFindingMore ? "animate-spin" : ""}`} />
                  <span>Curate for Question</span>
                </button>
              </div>
            )}

            {/* AI Literature Discovery & Query Bar */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-purple-500/[0.07] via-indigo-500/[0.04] to-blue-500/[0.07] dark:from-purple-500/10 dark:via-indigo-500/10 dark:to-blue-500/10 border border-purple-500/20 dark:border-purple-500/30 space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={aiSearchPrompt}
                    onChange={(e) => setAiSearchPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAISearchLiterature();
                      }
                    }}
                    placeholder="Ask AI to find specific sources (e.g. 'empirical studies on...', 'counter-arguments to...', '2024–2026 data')"
                    className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-ink-750 border border-purple-200 dark:border-purple-900/40 focus:border-purple-500 text-neutral-900 dark:text-white placeholder-neutral-400 outline-none shadow-2xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAISearchLiterature()}
                  disabled={isAISearching || !aiSearchPrompt.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 shrink-0"
                >
                  {isAISearching ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Discovering...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Find with AI</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Discovery Topic Chips */}
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-neutral-500 dark:text-neutral-400 font-medium mr-1">Quick Discovery:</span>
                {[
                  "Seminal Theoretical Frameworks",
                  "Recent Empirical Evidence (2024–2026)",
                  "Counter-Arguments & Critical Perspectives",
                  "Policy & Institutional Reports",
                ].map((promptChip) => (
                  <button
                    key={promptChip}
                    type="button"
                    disabled={isAISearching}
                    onClick={() => handleAISearchLiterature(promptChip)}
                    className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-white/10 hover:bg-purple-100 dark:hover:bg-purple-950/40 text-neutral-700 dark:text-neutral-200 border border-neutral-200/80 dark:border-white/10 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    + {promptChip}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Navigation Bar & Status Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              {/* Status Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === "all"
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs dark:shadow-none"
                      : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  All Sources ({totalActiveSources})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("ask_scholar")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "ask_scholar"
                      ? "bg-purple-600 text-white shadow-xs dark:shadow-none"
                      : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Ask Scholar</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 text-current">
                    {askScholarCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("ai_research")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "ai_research"
                      ? "bg-indigo-600 text-white shadow-xs dark:shadow-none"
                      : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Research</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 text-current">
                    {aiResearchCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("curated")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === "curated"
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs dark:shadow-none"
                      : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  Curated Literature ({totalCuratedCount})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("uploaded")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "uploaded"
                      ? "bg-blue-600 text-white shadow-xs dark:shadow-none"
                      : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>My Uploads</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 text-current">
                    {mappedUserSources.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("approved")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "approved"
                      ? "bg-emerald-600 text-white shadow-xs dark:shadow-none"
                      : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approved</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 text-current">
                    {approvedSourceIds.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("bookmarked")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "bookmarked"
                      ? "bg-amber-500 text-white shadow-xs dark:shadow-none"
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
                        ? "bg-neutral-700 text-white shadow-xs dark:shadow-none"
                        : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                    }`}
                  >
                    <span>Excluded ({excludedIds.length})</span>
                  </button>
                )}
              </div>

              {/* Search Input, Filters, and Add Custom Reference Action */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(true)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Reference</span>
                </button>

                <div className="relative flex-1 sm:w-60">
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
                      : "border-neutral-200 dark:border-white/10 bg-white dark:bg-ink-750 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Filters</span>
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
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-neutral-200 dark:border-white/10 bg-white dark:bg-ink-750 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFindingMore ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Re-curate</span>
                </button>
              </div>
            </div>

            {/* Expandable Custom Reference Creation Form */}
            {isAddingCustom && (
              <div className="p-5 rounded-2xl border-2 border-neutral-900 dark:border-white bg-white dark:bg-ink-750 shadow-md space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                      Add Custom Academic Reference
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2 md:col-span-3 space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Source Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Quantum Computation and Quantum Information"
                      value={customForm.title}
                      onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Authors (comma-separated)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Nielsen, M. A., Chuang, I. L."
                      value={customForm.authors}
                      onChange={(e) => setCustomForm({ ...customForm, authors: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Publication Year
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2010"
                      value={customForm.year}
                      onChange={(e) => setCustomForm({ ...customForm, year: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Source Type
                    </label>
                    <select
                      value={customForm.type}
                      onChange={(e) => setCustomForm({ ...customForm, type: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="journal">Peer-Reviewed Journal</option>
                      <option value="book">Academic Book / University Press</option>
                      <option value="conference">Conference Proceedings</option>
                      <option value="institutional">Institutional / Government Report</option>
                      <option value="report">Policy Report / Working Paper</option>
                      <option value="web">Academic Web Resource / Dataset</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Journal / Publisher / Venue
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cambridge University Press"
                      value={customForm.journal}
                      onChange={(e) => setCustomForm({ ...customForm, journal: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Volume, Issue, or Pages
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10th Anniversary edn. pp. 124–134"
                      value={customForm.volumeIssue}
                      onChange={(e) => setCustomForm({ ...customForm, volumeIssue: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      DOI or URL
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10.1017/CBO9780511976667"
                      value={customForm.doi}
                      onChange={(e) => setCustomForm({ ...customForm, doi: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3 space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Full Citation String (Harvard Reference Format)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Nielsen, M. A. and Chuang, I. L. (2010) Quantum Computation and Quantum Information. 10th Anniversary edn. Cambridge: Cambridge University Press."
                      value={customForm.citation}
                      onChange={(e) => setCustomForm({ ...customForm, citation: e.target.value })}
                      className="w-full text-xs font-serif p-2.5 rounded-xl border border-neutral-300 dark:border-white/20 bg-neutral-50/50 dark:bg-white/5 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/5 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomSource}
                    disabled={!customForm.title.trim()}
                    className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors shadow-xs disabled:opacity-40"
                  >
                    Add & Approve Reference
                  </button>
                </div>
              </div>
            )}

            {/* Expandable Advanced Filtering Drawer */}
            {showAdvancedFilters && (
              <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/80 dark:border-white/10 space-y-3 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                  {/* Filter 1: Source Type */}
                  <div className="space-y-1">
                    <label htmlFor="filter-source-type" className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                      Source Type
                    </label>
                    <select
                      id="filter-source-type"
                      aria-label="Source Type"
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
                    >
                      <option value="all">All Source Types</option>
                      <option value="journal">Peer-Reviewed Journals</option>
                      <option value="book">Academic Books & Presses</option>
                      <option value="conference">Conference Proceedings</option>
                      <option value="institutional">Institutional Research</option>
                      <option value="report">Policy & Intergov Reports</option>
                    </select>
                  </div>

                  {/* Filter 2: Role in Assignment */}
                  <div className="space-y-1">
                    <label htmlFor="filter-assignment-role" className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                      Role in Assignment
                    </label>
                    <select
                      id="filter-assignment-role"
                      aria-label="Role in Assignment"
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
                    >
                      <option value="all">All Assignment Roles</option>
                      <option value="Empirical evidence">Empirical Evidence</option>
                      <option value="Theoretical framework">Theoretical Framework</option>
                      <option value="Comparative evidence">Comparative Evidence</option>
                      <option value="Core theory">Core Theory (Seminal)</option>
                      <option value="Methodological framework">Methodological Framework</option>
                      <option value="Contextual evidence">Contextual Evidence</option>
                    </select>
                  </div>

                  {/* Filter 3: Research Methodology */}
                  <div className="space-y-1">
                    <label htmlFor="filter-methodology" className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                      Research Methodology
                    </label>
                    <select
                      id="filter-methodology"
                      aria-label="Research Methodology"
                      value={selectedMethodology}
                      onChange={(e) => setSelectedMethodology(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
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

                  {/* Filter 4: Publication Year */}
                  <div className="space-y-1">
                    <label htmlFor="filter-publication-year" className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                      Publication Year
                    </label>
                    <select
                      id="filter-publication-year"
                      aria-label="Publication Year"
                      value={selectedYearRange}
                      onChange={(e) => setSelectedYearRange(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
                    >
                      <option value="all">All Publication Years</option>
                      <option value="2026">Latest (2026)</option>
                      <option value="recent">Recent (2024–2026)</option>
                      <option value="2020-2023">Contemporary (2020–2023)</option>
                      <option value="seminal">Foundational (&lt; 2020)</option>
                    </select>
                  </div>

                  {/* Filter 5: Sort Order */}
                  <div className="space-y-1">
                    <label htmlFor="filter-sort-order" className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                      Sort Order
                    </label>
                    <select
                      id="filter-sort-order"
                      aria-label="Sort Order"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
                    >
                      <option value="relevance">Question Alignment & Recency (Default)</option>
                      <option value="year">Newest First (2026 First)</option>
                      <option value="citations">Most Cited (Citation Impact)</option>
                      <option value="role">Role in Assignment</option>
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

            {/* Notification Toast with Undo */}
            {discoverySuccessMsg && (
              <div className="p-3 rounded-xl bg-neutral-900 text-white dark:bg-neutral-800 border border-neutral-700/80 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 shadow-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span className="font-medium text-neutral-100 truncate">{discoverySuccessMsg}</span>
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
                    className="text-neutral-400 hover:text-white cursor-pointer"
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
                  <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/70 mt-0.5">
                    All citations formatted in Harvard referencing (Author, Year). Click <strong>Edit Reference</strong> on any item to customize citation text or metadata.
                  </p>
                </div>
                {approvedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyAllReferences}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-ink-750 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-emerald-600" />}
                    <span>{copiedAll ? "Copied All!" : "Copy Bibliography"}</span>
                  </button>
                )}
              </div>
            )}

            {/* Streamlined Literature Catalog (Apple-Inspired Minimalist Horizontal Reference Bars) */}
            {displayedSources.length > 0 ? (
              <div
                className="flex flex-col gap-1.5"
                data-testid="curated-sources-grid"
              >
                {displayedSources.map((source) =>
                  viewMode === "card" ? (
                    <CuratedSourceCard
                      key={source.id}
                      source={source}
                      isApproved={approvedSourceIds.includes(source.id)}
                      isBookmarked={bookmarkedIds.includes(source.id)}
                      onToggleApproval={toggleSourceApproval}
                      onDismiss={handleDismissSource}
                      onToggleBookmark={handleToggleBookmark}
                      onSaveEdit={handleSaveSourceUpdates}
                      availableSubheadings={subheadings}
                      onUpdateSubheadingMapping={(sId, mapping) =>
                        handleSaveSourceUpdates(sId, { mappedSubheadingIds: mapping })
                      }
                      onUpdateUserNotes={(sId, notes) =>
                        handleSaveSourceUpdates(sId, { userNotes: notes })
                      }
                    />
                  ) : (
                    <ReferenceBarItem
                      key={source.id}
                      source={source}
                      isApproved={approvedSourceIds.includes(source.id)}
                      isBookmarked={bookmarkedIds.includes(source.id)}
                      onToggleApproval={toggleSourceApproval}
                      onDismiss={handleDismissSource}
                      onToggleBookmark={handleToggleBookmark}
                      onSaveEdit={handleSaveSourceUpdates}
                      showDismiss={true}
                    />
                  )
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
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5 shadow-xs dark:shadow-none"
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
                className="px-6 py-3 rounded-full text-xs font-semibold border border-neutral-300 dark:border-white/20 bg-white dark:bg-ink-750 text-neutral-800 dark:text-white hover:bg-neutral-50 dark:hover:bg-white/5 hover:border-neutral-400 transition-all cursor-pointer flex items-center gap-2 shadow-xs dark:shadow-none disabled:opacity-50"
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
        </>
      )}

      {/* Phase 2 Exit Gate Banner & Actions */}
      <div className="rounded-2xl p-6 bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs dark:shadow-none flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Phase 2: Evidence Grounding
            </h3>
            {approvedCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center gap-1 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                <span>{approvedCount} Approved</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-400 flex items-center gap-1 border border-neutral-200 dark:border-white/10">
                <Sparkles className="w-3 h-3 text-neutral-500" />
                <span>Optional Grounding</span>
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {approvedCount >= 4
              ? `You have approved ${approvedCount} sources. You are fully grounded to proceed to Phase 3 drafting.`
              : approvedCount > 0
              ? `You have approved ${approvedCount} source${approvedCount === 1 ? "" : "s"} (${approvedCount}/4 recommended). You can continue approving or proceed to drafting anytime.`
              : `Citing sources is recommended (0/4 recommended) but optional. You can attach sources now or proceed directly to drafting.`}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
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
            onClick={handleContinue}
            data-testid="skip-to-drafting-btn"
            className="px-5 py-2.5 rounded-full text-xs font-semibold border border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            Skip to Drafting
          </button>

          <button
            type="button"
            onClick={() => setActiveMainView("analysis")}
            className="px-5 py-2.5 rounded-full text-xs font-semibold border border-neutral-200 dark:border-white/10 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Move to AI Analysis</span>
          </button>

          <button
            type="button"
            onClick={handleContinue}
            data-testid="proceed-to-drafting-btn"
            className="px-7 py-2.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer flex items-center gap-2 shadow-xs dark:shadow-none"
          >
            <span>Proceed to Drafting</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Floating Bottom Reference Shelf Dock */}
      <ApprovedReferencesShelf
        approvedSources={approvedSourcesList}
        recommendedCount={4}
        onToggleApproval={toggleSourceApproval}
        onProceedToDrafting={handleContinue}
        onSaveEditSource={handleSaveSourceUpdates}
      />
    </div>
  );
}
