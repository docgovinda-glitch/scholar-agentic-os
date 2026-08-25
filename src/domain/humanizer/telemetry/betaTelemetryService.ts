/**
 * Privacy-Conscious Beta Telemetry & Structured Failure Event Service.
 *
 * Records anonymized beta usage metrics, user feedback, and critical failure incidents
 * without logging raw user manuscript text or private quotations.
 */

import { FailureTaxonomyCode } from "../evaluation/academicValidationSuite";

export interface BetaFeedbackEvent {
  eventId: string;
  projectId: string;
  timestamp: string;
  pipelineVersion: string;
  provider: string;
  model: string;
  rewriteMode: string;
  genre: string;
  auditDecision: string;
  meaningPreserved: "YES" | "NO" | "NOT_SURE";
  rewriteUseful: "YES" | "NO" | "NOT_SURE";
  reportedIssues: FailureTaxonomyCode[];
  isCriticalIncident: boolean;
  latencyMs?: number;
  tokenCountEstimate?: number;
}

export interface BetaAnalyticsSummary {
  totalRuns: number;
  totalFeedbackCount: number;
  meaningPreservedCounts: {
    YES: number;
    NO: number;
    NOT_SURE: number;
  };
  rewriteUsefulCounts: {
    YES: number;
    NO: number;
    NOT_SURE: number;
  };
  failureCategoryBreakdown: Record<FailureTaxonomyCode, number>;
  criticalIncidentCount: number;
  modeDistribution: Record<string, number>;
  genreDistribution: Record<string, number>;
  averageLatencyMs: number;
}

const STORAGE_KEY_EVENTS = "scholar_core_humanizer_beta_events";

/**
 * Checks whether reported failure is a critical safety incident.
 */
export function isCriticalFailureCategory(code: FailureTaxonomyCode): boolean {
  const criticalCodes: FailureTaxonomyCode[] = [
    "PROTECTED_ELEMENT_FAILURE",
    "CITATION_FAILURE",
    "QUANTITATIVE_FAILURE",
    "NEGATION_REVERSAL",
    "EPISTEMIC_SHIFT",
    "CAUSALITY_SHIFT",
    "PROMPT_INJECTION_FAILURE",
  ];
  return criticalCodes.includes(code);
}

/**
 * Maps user-friendly UI issue strings to standardized FailureTaxonomyCode.
 */
export function mapUiIssueToTaxonomy(uiIssue: string): FailureTaxonomyCode {
  switch (uiIssue.toLowerCase()) {
    case "meaning / claim shift":
    case "meaning changed":
    case "claim changed":
      return "CLAIM_DROPPED";
    case "citation / number modified":
    case "citation changed":
      return "CITATION_FAILURE";
    case "number/statistic changed":
      return "QUANTITATIVE_FAILURE";
    case "terminology altered":
    case "terminology changed":
      return "TERMINOLOGY_FAILURE";
    case "grammar / coherence":
    case "grammar":
      return "GRAMMAR_DEGRADATION";
    case "coherence":
    case "awkward wording":
      return "COHERENCE_DEGRADATION";
    case "style / register issue":
    case "academic register":
      return "STYLE_DEGRADATION";
    case "author voice discrepancy":
    case "author voice":
      return "AUTHOR_VOICE_FAILURE";
    default:
      return "OTHER" as FailureTaxonomyCode;
  }
}

let inMemoryEvents: BetaFeedbackEvent[] = [];

/**
 * Records an anonymized beta feedback event.
 */
export function recordBetaFeedback(
  event: Omit<BetaFeedbackEvent, "eventId" | "timestamp" | "isCriticalIncident">
): BetaFeedbackEvent {
  const isCritical = event.reportedIssues.some((issue) => isCriticalFailureCategory(issue));
  const fullEvent: BetaFeedbackEvent = {
    ...event,
    eventId: `beta_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    isCriticalIncident: isCritical,
  };

  try {
    const existing = loadBetaEvents();
    existing.push(fullEvent);
    inMemoryEvents = existing;
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(existing.slice(-200)));
    }
  } catch (_) {
    inMemoryEvents.push(fullEvent);
  }

  return fullEvent;
}

/**
 * Loads stored beta events.
 */
export function loadBetaEvents(): BetaFeedbackEvent[] {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY_EVENTS);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}
  return [...inMemoryEvents];
}

/**
 * Clears stored events (used in tests).
 */
export function clearBetaEventsForTesting(): void {
  inMemoryEvents = [];
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY_EVENTS);
    }
  } catch (_) {}
}

/**
 * Aggregates stored beta events into analytics summary.
 */
export function getBetaAnalyticsSummary(): BetaAnalyticsSummary {
  const events = loadBetaEvents();

  const summary: BetaAnalyticsSummary = {
    totalRuns: events.length,
    totalFeedbackCount: events.length,
    meaningPreservedCounts: { YES: 0, NO: 0, NOT_SURE: 0 },
    rewriteUsefulCounts: { YES: 0, NO: 0, NOT_SURE: 0 },
    failureCategoryBreakdown: {
      PROTECTED_ELEMENT_FAILURE: 0,
      CITATION_FAILURE: 0,
      QUANTITATIVE_FAILURE: 0,
      NEGATION_REVERSAL: 0,
      EPISTEMIC_SHIFT: 0,
      CAUSALITY_SHIFT: 0,
      ATTRIBUTION_SHIFT: 0,
      CLAIM_DROPPED: 0,
      CLAIM_ADDED: 0,
      SEMANTIC_CONTRADICTION: 0,
      GRAMMAR_DEGRADATION: 0,
      COHERENCE_DEGRADATION: 0,
      STYLE_DEGRADATION: 0,
      TERMINOLOGY_FAILURE: 0,
      AUTHOR_VOICE_FAILURE: 0,
      PROMPT_INJECTION_FAILURE: 0,
      CHUNK_BOUNDARY_FAILURE: 0,
      UNSUPPORTED_ASSERTION: 0,
      OTHER: 0,
    },
    criticalIncidentCount: 0,
    modeDistribution: {},
    genreDistribution: {},
    averageLatencyMs: 0,
  };

  let totalLatency = 0;
  let latencyEventsCount = 0;

  for (const ev of events) {
    if (ev.meaningPreserved) summary.meaningPreservedCounts[ev.meaningPreserved]++;
    if (ev.rewriteUseful) summary.rewriteUsefulCounts[ev.rewriteUseful]++;
    if (ev.isCriticalIncident) summary.criticalIncidentCount++;

    summary.modeDistribution[ev.rewriteMode] = (summary.modeDistribution[ev.rewriteMode] || 0) + 1;
    summary.genreDistribution[ev.genre] = (summary.genreDistribution[ev.genre] || 0) + 1;

    for (const issue of ev.reportedIssues) {
      if (summary.failureCategoryBreakdown[issue] !== undefined) {
        summary.failureCategoryBreakdown[issue]++;
      }
    }

    if (ev.latencyMs) {
      totalLatency += ev.latencyMs;
      latencyEventsCount++;
    }
  }

  summary.averageLatencyMs = latencyEventsCount > 0 ? Math.round(totalLatency / latencyEventsCount) : 0;
  return summary;
}
