import { describe, it, expect, beforeEach } from "vitest";
import {
  recordBetaFeedback,
  loadBetaEvents,
  getBetaAnalyticsSummary,
  isCriticalFailureCategory,
  mapUiIssueToTaxonomy,
  clearBetaEventsForTesting,
} from "../telemetry/betaTelemetryService";

describe("Phase 13: Privacy-Conscious Beta Telemetry & Structured Failure Incidents", () => {
  beforeEach(() => {
    clearBetaEventsForTesting();
  });

  it("records structured beta feedback and guarantees zero manuscript text in event payload", () => {
    const event = recordBetaFeedback({
      projectId: "proj-beta-42",
      pipelineVersion: "humanizer-v1.0.0-beta",
      provider: "gemini",
      model: "gemini-2.5-flash",
      rewriteMode: "balanced",
      genre: "Academic Journal",
      auditDecision: "SAFE",
      meaningPreserved: "YES",
      rewriteUseful: "YES",
      reportedIssues: [],
    });

    expect(event.eventId).toBeDefined();
    expect(event.isCriticalIncident).toBe(false);

    // Verify privacy: Event payload has no raw manuscript fields
    expect((event as any).sourceText).toBeUndefined();
    expect((event as any).humanizedText).toBeUndefined();
    expect((event as any).apiKey).toBeUndefined();

    const stored = loadBetaEvents();
    expect(stored.length).toBe(1);
    expect(stored[0].eventId).toBe(event.eventId);
  });

  it("identifies and flags critical failure incidents for reproducible regression tracking", () => {
    const criticalCode = mapUiIssueToTaxonomy("Citation changed");
    expect(criticalCode).toBe("CITATION_FAILURE");
    expect(isCriticalFailureCategory(criticalCode)).toBe(true);

    const event = recordBetaFeedback({
      projectId: "proj-beta-42",
      pipelineVersion: "humanizer-v1.0.0-beta",
      provider: "gemini",
      model: "gemini-2.5-flash",
      rewriteMode: "balanced",
      genre: "Academic Journal",
      auditDecision: "REJECT",
      meaningPreserved: "NO",
      rewriteUseful: "NO",
      reportedIssues: [criticalCode],
    });

    expect(event.isCriticalIncident).toBe(true);

    const summary = getBetaAnalyticsSummary();
    expect(summary.criticalIncidentCount).toBe(1);
    expect(summary.failureCategoryBreakdown.CITATION_FAILURE).toBe(1);
  });
});
