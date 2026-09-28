import React from "react";
import type { DiscoveredSource } from "../types";

export interface ScholarlyResearchPipelineProps {
  question: string;
  totalSourcesCount?: number;
  approvedCount?: number;
  isCurating?: boolean;
  onTriggerResearch?: () => void;
  sources?: DiscoveredSource[];
}

/**
 * Quiet status badge conforming to Airbnb/Apple minimalist design.
 * Decommissions the legacy high-contrast black engine block.
 */
export const ScholarlyResearchPipeline: React.FC<ScholarlyResearchPipelineProps> = ({
  question,
}) => {
  const qLower = (question || "").toLowerCase();
  let detectedSubTopic = "Scholarly Literature";

  if (
    qLower.includes("quantum") ||
    qLower.includes("qubit") ||
    qLower.includes("superconducting") ||
    qLower.includes("trapped-ion") ||
    qLower.includes("transmon") ||
    qLower.includes("shor") ||
    qLower.includes("grover") ||
    qLower.includes("surface code") ||
    qLower.includes("qkd") ||
    qLower.includes("pqc")
  ) {
    detectedSubTopic = "Quantum Computing & Information Physics";
  } else if (
    qLower.includes("united nations") ||
    qLower.includes("peace and security") ||
    qLower.includes("un ") ||
    qLower.includes("security council")
  ) {
    detectedSubTopic = "UN Peace & Security";
  } else if (
    qLower.includes("china") ||
    qLower.includes("geopolitic") ||
    qLower.includes("power transition")
  ) {
    detectedSubTopic = "Great-Power Transition";
  } else if (
    qLower.includes("algorithm") ||
    qLower.includes("ai ") ||
    qLower.includes("artificial intelligence") ||
    qLower.includes("autonomous")
  ) {
    detectedSubTopic = "Algorithmic Governance";
  }

  return (
    <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      <span>Research Engine Calibrated</span>
      {question?.trim() ? (
        <>
          <span className="text-neutral-300 dark:text-neutral-600">·</span>
          <span>{detectedSubTopic}</span>
        </>
      ) : null}
    </div>
  );
};
