import React from "react";
import ContextPanel, { type ContextPanelProps } from "../workspace/ContextPanel";
import { ASSIGNMENT_AGENT_CONFIGS } from "../assignment/types";

export interface AdvisorPanelProps extends Partial<ContextPanelProps> {
  /** Optional custom class name */
  className?: string;
}

/**
 * Dedicated Advisor Assistant Panel component for Assignment workflow ("Ask Scholar" / Advisor)
 * Wired to dynamic contextual suggestion chips and socratic assignment alignment.
 */
export default function AdvisorPanel(props: AdvisorPanelProps) {
  const advisorAgent = ASSIGNMENT_AGENT_CONFIGS.understand;
  return (
    <ContextPanel
      currentStage="understand"
      stageName="Understand & Align"
      isOpen={props.isOpen ?? true}
      agent={props.agent || advisorAgent}
      {...props}
    />
  );
}
