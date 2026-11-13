import { fetchCompleter } from "../../../test/fetchCompleter";
import { describe, it, expect, vi, afterEach } from "vitest";
import { runPeerReview } from "../peerReview";
import type { GeneratedSection } from "../../../domain/manuscript/types";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});


function section(key: string, title: string, text: string): GeneratedSection {
  return { key, title, text, wordCount: 10, memory: "m", citedEvidenceIds: [], generatedAt: "now" };
}

const SECTIONS = [section("introduction", "Introduction", "We claim a novel finding."), section("results", "Results", "The effect was large.")];

function mockModelResponses(responses: unknown[]) {
  let call = 0;
  global.fetch = vi.fn(() => {
    const body = responses[Math.min(call, responses.length - 1)];
    call++;
    return Promise.resolve({
      ok: true,
      json: async () => ({ choices: [{ message: { content: typeof body === "string" ? body : JSON.stringify(body) } }] } ),
    } as Response);
  }) as unknown as typeof fetch;
}

describe("runPeerReview", () => {
  it("runs all seven lenses by default and stamps the given round number", async () => {
    mockModelResponses([{ findings: [], overallAssessment: "Fine on this dimension." }]);
    const round = await runPeerReview({ sections: SECTIONS, roundNumber: 1, complete: fetchCompleter });
    expect(round.roundNumber).toBe(1);
    expect(round.lensesRun).toEqual(["contribution", "literature", "methodology", "evidence", "argument", "citation", "journal_fit"]);
    expect(round.lensReviews).toHaveLength(7);
    expect(round.lensErrors).toEqual({});
  });

  it("aggregates findings from a genuinely critical lens", async () => {
    mockModelResponses([
      { findings: [{ summary: "Overstated novelty.", detail: "This has been shown before in [prior work].", severity: "major", sectionKeys: ["introduction"] }], overallAssessment: "The contribution is weaker than claimed." },
    ]);
    const round = await runPeerReview({ sections: SECTIONS, roundNumber: 1, complete: fetchCompleter, lenses: ["contribution"] });
    expect(round.lensReviews[0].findings).toHaveLength(1);
    expect(round.lensReviews[0].findings[0].severity).toBe("major");
    expect(round.lensReviews[0].overallAssessment).toContain("weaker than claimed");
  });

  it("records a failed lens in lensErrors without losing the other lenses' reviews", async () => {
    let call = 0;
    global.fetch = vi.fn(() => {
      call++;
      if (call === 2) {
        return Promise.resolve({ ok: true, json: async () => ({ choices: [{ message: { content: "not json" } }] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ findings: [], overallAssessment: "ok" }) } }] }) } as Response);
    }) as unknown as typeof fetch;

    const round = await runPeerReview({ sections: SECTIONS, roundNumber: 1, complete: fetchCompleter, lenses: ["contribution", "literature", "methodology"] });
    expect(round.lensesRun).toEqual(["contribution", "methodology"]);
    expect(round.lensErrors.literature).toMatch(/could not be parsed/i);
  });

  it("rejects a lens response with no overallAssessment as unparseable rather than defaulting one", async () => {
    mockModelResponses([{ findings: [] }]);
    const round = await runPeerReview({ sections: SECTIONS, roundNumber: 1, complete: fetchCompleter, lenses: ["evidence"] });
    expect(round.lensesRun).toEqual([]);
    expect(round.lensErrors.evidence).toMatch(/could not be parsed/i);
  });

});
