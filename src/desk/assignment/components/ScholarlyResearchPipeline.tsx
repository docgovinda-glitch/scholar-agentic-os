import React, { useState } from "react";
import {
  Sparkles,
  Search,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  BookOpen,
  ArrowRight,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import type { DiscoveredSource } from "../types";

export interface ScholarlyResearchPipelineProps {
  question: string;
  totalSourcesCount: number;
  approvedCount: number;
  isCurating: boolean;
  onTriggerResearch: () => void;
  sources: DiscoveredSource[];
}

export const ScholarlyResearchPipeline: React.FC<ScholarlyResearchPipelineProps> = ({
  question,
  totalSourcesCount,
  approvedCount,
  isCurating,
  onTriggerResearch,
  sources,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Derive research topic characteristics from the question
  const qLower = (question || "").toLowerCase();
  let detectedSubTopic = "Multidisciplinary Academic Scholarship";
  let detectedFocus = "Dialectical analysis of empirical evidence and theoretical frameworks";
  let primaryEntities: string[] = ["Theoretical Frameworks", "Empirical Evidence", "Peer-Reviewed Literature"];

  if (qLower.includes("united nations") || qLower.includes("peace and security") || qLower.includes("un ") || qLower.includes("security council")) {
    detectedSubTopic = "UN Peace & Security, Collective Security & Veto Dynamics";
    detectedFocus = "Security Council Chapter VII enforcement, P5 veto gridlock, and peacekeeping efficacy";
    primaryEntities = [
      "UN Security Council",
      "Chapter VII Enforcement",
      "P5 Veto Power (Art. 27(3))",
      "Peacekeeping Operations (PKO)",
      "Responsibility to Protect (R2P)",
      "Institutional Reform",
    ];
  } else if (qLower.includes("china") || qLower.includes("geopolitic") || qLower.includes("power transition")) {
    detectedSubTopic = "International Relations & Great-Power Transition";
    detectedFocus = "Hegemonic stability, revisionist vs status quo behavior, and Indo-Pacific security architecture";
    primaryEntities = [
      "Power Transition Theory",
      "Offensive vs Defensive Realism",
      "Multilateral Order",
      "Institutional Hegemony",
    ];
  } else if (qLower.includes("algorithm") || qLower.includes("ai ") || qLower.includes("artificial intelligence") || qLower.includes("autonomous")) {
    detectedSubTopic = "Algorithmic Governance & AI Ethics";
    detectedFocus = "Automated accountability, procedural transparency, and institutional regulation";
    primaryEntities = [
      "Algorithmic Due Process",
      "Socio-Technical Bias",
      "Regulatory Sandboxes",
      "Predictive Justice",
    ];
  }

  // Calculate curation credibility stats
  const peerReviewedCount = sources.filter(
    (s) => s.sourceCredibility === "peer-reviewed" || s.sourceCredibility === "academic-press" || s.isVerifiedAcademic
  ).length;
  const peerReviewedPercent = sources.length > 0 ? Math.round((peerReviewedCount / sources.length) * 100) : 100;

  const seminalCount = sources.filter(
    (s) => s.citationImpact === "Seminal Work" || s.citationImpact === "Highly Cited" || (s.citationCount || 0) > 1000
  ).length;

  return (
    <div className="rounded-2xl bg-neutral-900 text-white dark:bg-[#1E1E20] border border-neutral-800 dark:border-white/10 p-4 sm:p-5 shadow-sm space-y-4">
      {/* Top Bar: Pipeline Status & Research Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Active Scholarly Research Engine
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 font-mono">
              Calibrated to Topic
            </span>
          </div>
          <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight flex items-center gap-2">
            <span>{detectedSubTopic}</span>
          </h2>
          <p className="text-xs text-neutral-400 max-w-xl leading-relaxed">
            {detectedFocus}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onTriggerResearch}
            disabled={isCurating}
            aria-label="Research & Refine Literature"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-neutral-900 hover:bg-neutral-100 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCurating ? "animate-spin text-neutral-900" : "text-neutral-900"}`} />
            <span>{isCurating ? "Synthesizing Repositories..." : "Research & Refine Literature"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            title="Toggle research methodology details"
            aria-label="Toggle pipeline view"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Primary Extracted Research Entities / Concept Tags */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mr-1 flex items-center gap-1">
          <Layers className="w-3 h-3 text-neutral-400" />
          <span>Core Inquiry Parameters:</span>
        </span>
        {primaryEntities.map((ent, idx) => (
          <span
            key={idx}
            className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-neutral-200 font-medium"
          >
            {ent}
          </span>
        ))}
      </div>

      {/* 4-Stage Scholarly Research Pipeline Visualizer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
        {/* Step 1 */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-neutral-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">1</span>
              <span>Semantic Extraction</span>
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-[11px] text-neutral-400 leading-snug">
            Deconstructs command verbs, thesis claims, and structural boundaries.
          </p>
        </div>

        {/* Step 2 */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-neutral-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">2</span>
              <span>Repository Querying</span>
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-[11px] text-neutral-400 leading-snug">
            Queries high-impact journals, Oxford/Cambridge presses, and seminal texts.
          </p>
        </div>

        {/* Step 3 */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-neutral-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">3</span>
              <span>Rigor & DOI Check</span>
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-[11px] text-neutral-400 leading-snug">
            Verifies peer-review standards, methodological integrity, and DOIs.
          </p>
        </div>

        {/* Step 4 */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-neutral-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">4</span>
              <span>Thesis Alignment</span>
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-[11px] text-neutral-400 leading-snug">
            Scores argument relevance (85%–98%) and maps evidentiary citations.
          </p>
        </div>
      </div>

      {/* Expanded Credibility & Methodology Insights Drawer */}
      {isExpanded && (
        <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs animate-in fade-in duration-150">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Peer-Review Ratio</span>
            </span>
            <div className="text-lg font-bold text-white font-mono">{peerReviewedPercent}%</div>
            <p className="text-[10px] text-neutral-400">
              {peerReviewedCount} of {sources.length} sources verified by university press or peer review.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
              <span>Seminal & Landmark Works</span>
            </span>
            <div className="text-lg font-bold text-white font-mono">{seminalCount}</div>
            <p className="text-[10px] text-neutral-400">
              High-impact scholarship with established citation lineages and disciplinary authority.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>Approved Evidence Base</span>
            </span>
            <div className="text-lg font-bold text-white font-mono">
              {approvedCount} / 4 minimum
            </div>
            <p className="text-[10px] text-neutral-400">
              Approved sources will ground sections and citations in Phase 3 Drafting.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
