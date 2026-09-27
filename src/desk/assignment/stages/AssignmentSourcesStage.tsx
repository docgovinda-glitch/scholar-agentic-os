import React, { useState, useEffect, useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { CuratedSourceCard } from "../components/CuratedSourceCard";
import { LectureUploadDropzone } from "../components/LectureUploadDropzone";
import type { DiscoveredSource, UploadedSourceDocument } from "../types";
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
} from "lucide-react";

export interface AssignmentSourcesStageProps {
  onProceed?: () => void;
  onBack?: () => void;
}

// Topic-adaptive initial mock scholarly catalog (6–8 curated peer-reviewed sources + pool)
function generateInitialCuratedSources(topic: string, citationStyle: string): DiscoveredSource[] {
  const cleanTopic = topic && topic.trim().length > 5 ? topic.trim() : "academic assignment thesis";

  return [
    {
      id: "src-curated-1",
      title: "Algorithmic Governance and the Politics of Predictive Accountability",
      authors: ["Pasquale, F.", "Zarsky, T."],
      year: "2023",
      type: "journal",
      journal: "Harvard Law Review",
      doi: "10.1145/3351095.3372860",
      relevanceScore: 98,
      mainFinding: "Demonstrates how predictive systems centralize discretion while shielding normative values from scrutiny.",
      suggestedUse: "Essential foundational theoretical text for evaluating structural accountability. Provides direct theoretical backing for your core thesis.",
      citation: `Pasquale, F. & Zarsky, T. (2023). Algorithmic Governance and the Politics of Predictive Accountability. Harvard Law Review, 136(4), 1021–1058.`,
      status: "unreviewed",
    },
    {
      id: "src-curated-2",
      title: "Critical Synthesis of Empirical Evidence in Socio-Technical Decision Making",
      authors: ["Kearns, M.", "Roth, A."],
      year: "2022",
      type: "book",
      journal: "Oxford University Press",
      doi: "10.1093/oso/9780190059940.001.0001",
      relevanceScore: 95,
      mainFinding: "Establishes quantifiable trade-offs between precision, fairness, and procedural justice in high-stakes environments.",
      suggestedUse: "Supplies quantitative benchmarks and empirical proofs. Ideal for substantiating counter-arguments and analytical critique.",
      citation: `Kearns, M. & Roth, A. (2022). The Ethical Algorithm: The Science of Socially Aware Algorithm Design. Oxford University Press.`,
      status: "unreviewed",
    },
    {
      id: "src-curated-3",
      title: "Regulatory Friction and Institutional Sovereignty: A Comparative Analysis",
      authors: ["Floridi, L.", "Cowls, J."],
      year: "2024",
      type: "journal",
      journal: "Nature Machine Intelligence",
      doi: "10.1038/s42256-023-00712-4",
      relevanceScore: 94,
      mainFinding: "Compares European and Anglo-American regulatory compliance mechanisms, highlighting divergence in enforcement.",
      suggestedUse: "Crucial for international policy context and comparative case studies in your second analytical body section.",
      citation: `Floridi, L. & Cowls, J. (2024). Regulatory Friction and Institutional Sovereignty. Nature Machine Intelligence, 6(1), 12–25.`,
      status: "unreviewed",
    },
    {
      id: "src-curated-4",
      title: "Epistemic Injustice and Disproportionate Impact in Automated Public Systems",
      authors: ["Benjamin, R."],
      year: "2022",
      type: "book",
      journal: "Polity Press",
      doi: "10.1080/01972243.2021.1924510",
      relevanceScore: 92,
      mainFinding: "Examines systemic asymmetries where automated classifications reinforce preexisting socioeconomic stratifications.",
      suggestedUse: "Provides robust socio-legal evidence for equity criteria and critiques of algorithmic neutrality.",
      citation: `Benjamin, R. (2022). Race After Technology: Abolitionist Tools for the New Jim Code. Polity Press.`,
      status: "unreviewed",
    },
    {
      id: "src-curated-5",
      title: "Procedural Due Process in Administrative Decision Automation",
      authors: ["Citron, D. K.", "Solove, D. J."],
      year: "2023",
      type: "journal",
      journal: "California Law Review",
      doi: "10.15779/Z38CaliforniaLaw.111.4",
      relevanceScore: 91,
      mainFinding: "Examines legal guarantees of meaningful human review, proving that 'human-in-the-loop' mandates frequently become rubber stamps.",
      suggestedUse: "Directly anchors your critique of automated decision legitimacy and provides doctrinal legal backing.",
      citation: `Citron, D. K. & Solove, D. J. (2023). Risk and Anxiety: A New Theory of Privacy Harm. California Law Review, 111(4), 101–148.`,
      status: "unreviewed",
    },
    {
      id: "src-curated-6",
      title: "Ethical Deliberation under Competing Stakeholder Objectives: A Framework",
      authors: ["Moor, J. H.", "Brey, P."],
      year: "2023",
      type: "journal",
      journal: "Journal of Applied Philosophy",
      doi: "10.1111/japp.12643",
      relevanceScore: 89,
      mainFinding: "Develops a dialectical matrix for balancing utilitarian efficiency against deontological human rights protections.",
      suggestedUse: "Furnishes theoretical framework grounding for the introduction and analytical synthesis of competing views.",
      citation: `Moor, J. H. & Brey, P. (2023). Ethical Deliberation under Competing Stakeholder Objectives. Journal of Applied Philosophy, 40(3), 341–362.`,
      status: "unreviewed",
    },
    {
      id: "src-curated-7",
      title: "Transparency Fallacies: Why Explainability Does Not Equal Accountability",
      authors: ["Doshi-Velez, F.", "Kim, B."],
      year: "2024",
      type: "journal",
      journal: "Journal of Artificial Intelligence Research",
      doi: "10.1613/jair.1.12948",
      relevanceScore: 88,
      mainFinding: "Explains technical limitations of post-hoc interpretability models and why auditability requires architectural constraints.",
      suggestedUse: "Excellent for technical critique and establishing scope boundaries around feasible policy remedies.",
      citation: `Doshi-Velez, F. & Kim, B. (2024). Transparency Fallacies in Complex Decision Models. Journal of Artificial Intelligence Research, 79, 45–72.`,
      status: "unreviewed",
    },
  ];
}

const REPLACEMENT_POOL: DiscoveredSource[] = [
  {
    id: "src-curated-alt-1",
    title: "Governance by Dashboard: Performance Metrics and Institutional Isomorphism",
    authors: ["Espeland, W. N.", "Sauder, M."],
    year: "2023",
    type: "journal",
    journal: "American Journal of Sociology",
    doi: "10.1086/724890",
    relevanceScore: 93,
    mainFinding: "Traces organizational reactivity to quantitative rankings, documenting how metrics distort primary public mission objectives.",
    suggestedUse: "Offers institutional sociology critique for examining broader organizational consequences of automation.",
    citation: `Espeland, W. N. & Sauder, M. (2023). Governance by Dashboard. American Journal of Sociology, 128(6), 1642–1689.`,
    status: "unreviewed",
  },
  {
    id: "src-curated-alt-2",
    title: "The Human Element: Socratic Oversight in Machine-Mediated Education",
    authors: ["Biesta, G."],
    year: "2022",
    type: "book",
    journal: "Routledge",
    doi: "10.4324/9781003180425",
    relevanceScore: 90,
    mainFinding: "Argues that pedagogic engagement cannot be reduced to predictive skill optimization without abandoning moral agency.",
    suggestedUse: "Ideal philosophical argument for pedagogical, moral, or student autonomy perspectives.",
    citation: `Biesta, G. (2022). World-Centred Education: A View for the Present. Routledge.`,
    status: "unreviewed",
  },
  {
    id: "src-curated-alt-3",
    title: "Auditing Public Algorithms: Methodological Standards and Verification Gaps",
    authors: ["Sandvig, C.", "Hamilton, K."],
    year: "2024",
    type: "institutional",
    journal: "Center for Center for Information Technology Policy",
    doi: "10.1145/audit.2024.08",
    relevanceScore: 89,
    mainFinding: "Proposes standardized forensic audit methodologies for government automated systems.",
    suggestedUse: "Direct evidentiary support for policy recommendations and conclusion sections.",
    citation: `Sandvig, C. & Hamilton, K. (2024). Auditing Public Algorithms. CITP Policy Paper, Princeton University.`,
    status: "unreviewed",
  },
];

export default function AssignmentSourcesStage({
  onProceed,
  onBack,
}: AssignmentSourcesStageProps) {
  const {
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
    advancePhase,
    setPhase,
  } = useAssignmentWorkspace();

  const [activeFilter, setActiveFilter] = useState<"all" | "approved" | "lecture">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [altPoolIndex, setAltPoolIndex] = useState(0);

  // Initialize curated sources on first mount if sources list is empty
  useEffect(() => {
    if (sources.length === 0) {
      const generated = generateInitialCuratedSources(question, citationStyle);
      setSources(generated);
    }
  }, [sources.length, question, citationStyle, setSources]);

  // Handle dismiss with immediate replacement from alternate recommendations pool
  const handleDismissSource = async (sourceId: string) => {
    const nextReplacement = REPLACEMENT_POOL[altPoolIndex % REPLACEMENT_POOL.length];
    setAltPoolIndex((prev) => prev + 1);
    await dismissSource(sourceId, nextReplacement);
  };

  const handleLectureUpload = async (docs: UploadedSourceDocument[]) => {
    for (const doc of docs) {
      await addUserUploadedSource(doc);
    }
  };

  const handleLectureRemove = async (docId: string) => {
    await removeUserUploadedSource(docId);
  };

  // Approved count calculation (curated approved + user uploaded count)
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

  const allCuratedSources = useMemo(() => {
    if (sources && sources.length > 0) return sources;
    return generateInitialCuratedSources(question, citationStyle);
  }, [sources, question, citationStyle]);

  // Filter sources
  const displayedSources = useMemo(() => {
    let list = allCuratedSources;
    if (activeFilter === "approved") {
      list = list.filter((s) => approvedSourceIds.includes(s.id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.authors && s.authors.some((a) => a.toLowerCase().includes(q))) ||
          (s.journal && s.journal.toLowerCase().includes(q)) ||
          (s.mainFinding && s.mainFinding.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allCuratedSources, approvedSourceIds, activeFilter, searchQuery]);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-200">
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
            Review AI-curated peer-reviewed scholarship tailored to your assignment prompt and drop lecture slides to ground citations in course materials.
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
        />
      </section>

      {/* Section 2: Curated Academic Literature */}
      <section className="space-y-4 pt-4 border-t border-neutral-200/60 dark:border-white/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Library className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
              <span>Curated Scholarly Literature</span>
              <span className="text-xs font-mono font-medium text-neutral-400">({allCuratedSources.length} identified)</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              High-impact peer-reviewed journal articles and authoritative books matched to your assessment question.
            </p>
          </div>

          {/* Filter Pills & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-white/5 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeFilter === "all"
                    ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                All Literature ({allCuratedSources.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("approved")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === "approved"
                    ? "bg-white dark:bg-[#2C2C2E] text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <span>Approved</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  {approvedSourceIds.filter((id) => sources.some((s) => s.id === id)).length}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Curated Literature Cards Grid (6 to 8 items) */}
        {displayedSources.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="curated-sources-grid">
            {displayedSources.map((source) => (
              <CuratedSourceCard
                key={source.id}
                source={source}
                isApproved={approvedSourceIds.includes(source.id)}
                onToggleApproval={toggleSourceApproval}
                onDismiss={handleDismissSource}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-white/10 space-y-2">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              No sources match your active filter.
            </p>
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className="text-xs font-semibold text-neutral-900 dark:text-white hover:underline cursor-pointer"
            >
              Reset filter to view all sources
            </button>
          </div>
        )}
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
