import React, { useState } from "react";
import { Scale, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import type { WebsiteCitationItem } from "../dashboard/types";

export interface ConsensusMetrics {
  agreementScore: number; // 0 to 100
  level: "strong" | "emerging" | "polarized" | "insufficient";
  supportingCount: number;
  contradictingCount: number;
  neutralCount: number;
  totalStudies: number;
  summary: string;
}

export function computeConsensusFromCitations(citations?: WebsiteCitationItem[]): ConsensusMetrics | null {
  if (!citations || citations.length === 0) return null;

  const total = citations.length;
  if (total < 2) {
    return {
      agreementScore: 60,
      level: "insufficient",
      supportingCount: 1,
      contradictingCount: 0,
      neutralCount: total - 1,
      totalStudies: total,
      summary: "Limited empirical sample (<2 studies) to establish broad scientific consensus.",
    };
  }

  let supporting = 0;
  let contradicting = 0;
  let neutral = 0;

  for (const c of citations) {
    const stance = (c.stance || "").toLowerCase();
    if (stance === "contradicting" || stance === "divergent") {
      contradicting++;
    } else if (stance === "neutral" || stance === "mentioning") {
      neutral++;
    } else {
      // Default to supporting if scholarly
      supporting++;
    }
  }

  const score = Math.round((supporting / (supporting + contradicting || 1)) * 100);

  let level: ConsensusMetrics["level"];
  let summary: string;

  if (contradicting >= 2 && score < 70) {
    level = "polarized";
    summary = `Significant empirical divergence detected between ${supporting} supporting and ${contradicting} dissenting trials.`;
  } else if (score >= 80 && total >= 3) {
    level = "strong";
    summary = `High degree of scientific convergence (${score}%) across ${total} evaluated publications.`;
  } else if (total < 3) {
    level = "insufficient";
    summary = "Preliminary findings with limited peer-reviewed replication to date.";
  } else {
    level = "emerging";
    summary = `Emerging literature with ${score}% agreement; further longitudinal replication warranted.`;
  }

  return {
    agreementScore: score,
    level,
    supportingCount: supporting,
    contradictingCount: contradicting,
    neutralCount: neutral,
    totalStudies: total,
    summary,
  };
}

export interface ScientificConsensusGaugeProps {
  metrics?: ConsensusMetrics | null;
  citations?: WebsiteCitationItem[];
  defaultExpanded?: boolean;
}

export const ScientificConsensusGauge: React.FC<ScientificConsensusGaugeProps> = ({
  metrics: explicitMetrics,
  citations,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  const metrics = explicitMetrics ?? computeConsensusFromCitations(citations);

  if (!metrics || metrics.totalStudies === 0) return null;

  const { level, agreementScore, supportingCount, contradictingCount, neutralCount, totalStudies, summary } = metrics;

  const levelConfig = {
    strong: {
      badgeBg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      barFill: "bg-emerald-500",
      label: "Strong Consensus",
      icon: CheckCircle2,
    },
    emerging: {
      badgeBg: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
      barFill: "bg-sky-500",
      label: "Emerging Consensus",
      icon: Scale,
    },
    polarized: {
      badgeBg: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
      barFill: "bg-amber-500",
      label: "Divergent / Polarized Debate",
      icon: AlertCircle,
    },
    insufficient: {
      badgeBg: "bg-neutral-500/10 text-neutral-700 dark:text-neutral-300 border-neutral-500/30",
      barFill: "bg-neutral-500",
      label: "Limited Empirical Trials",
      icon: AlertCircle,
    },
  }[level];

  const IconComponent = levelConfig.icon;

  return (
    <div
      data-testid="scientific-consensus-gauge"
      className="mb-3 rounded-2xl bg-white/60 dark:bg-neutral-900/60 border border-neutral-200/90 dark:border-white/10 p-3 shadow-2xs backdrop-blur-xs font-sans text-xs"
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold border ${levelConfig.badgeBg}`}>
            <IconComponent className="w-3.5 h-3.5 shrink-0" />
            <span>{levelConfig.label} ({agreementScore}%)</span>
          </span>
          <span className="text-neutral-500 dark:text-neutral-400 font-medium">
            · {totalStudies} evaluated {totalStudies === 1 ? "study" : "studies"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors cursor-pointer"
        >
          <span>{isExpanded ? "Hide Breakdown" : "Inspect Agreement Breakdown"}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Progress Track Bar */}
      <div className="w-full h-1.5 bg-neutral-200/70 dark:bg-neutral-800 rounded-full overflow-hidden mt-2">
        <div
          style={{ width: `${Math.max(5, agreementScore)}%` }}
          className={`h-full ${levelConfig.barFill} rounded-full transition-all duration-500 ease-out`}
        />
      </div>

      {/* Summary Line */}
      <p className="text-[11.5px] text-neutral-600 dark:text-neutral-300 mt-1.5 leading-relaxed">
        {summary}
      </p>

      {/* Collapsible Detailed Breakdown */}
      {isExpanded && (
        <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-2 animate-in fade-in">
          <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold text-neutral-900 dark:text-neutral-100">{supportingCount} Supporting</div>
              <div className="text-[10px] text-neutral-500">Corroborating findings</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/5 border border-amber-500/15">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <div className="font-bold text-neutral-900 dark:text-neutral-100">{contradictingCount} Divergent</div>
              <div className="text-[10px] text-neutral-500">Conflicting / counter findings</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-neutral-500/5 border border-neutral-500/15">
            <Scale className="w-4 h-4 text-neutral-500 shrink-0" />
            <div>
              <div className="font-bold text-neutral-900 dark:text-neutral-100">{neutralCount} Neutral</div>
              <div className="text-[10px] text-neutral-500">Descriptive or qualitative</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScientificConsensusGauge;

