import { describe, it, expect, vi, afterEach } from "vitest";
import { runPeerReview, GatewayDenied } from "../peerReview";
import { defaultPolicy, recordConsent, markRestricted } from "../../../platform/warden/warden";
import type { GeneratedSection } from "../../../domain/manuscript/types";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const CONSENTED_POLICY = recordConsent(defaultPolicy(), "openai");

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
    const round = await runPeerReview({ sections: SECTIONS, roundNumber: 1, provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY });
    expect(round.roundNumber).toBe(1);
    expect(round.lensesRun).toEqual(["contribution", "literature", "methodology", "evidence", "argument", "citation", "journal_fit"]);
    expect(round.lensReviews).toHaveLength(7);
    expect(round.lensErrors).toEqual({});
  });

  it("aggregates findings from a genuinely critical lens", async () => {
    mockModelResponses([
      { findings: [{ summary: "Overstated novelty.", detail: "This has been shown before in [prior work].", severity: "major", sectionKeys: ["introduction"] }], overallAssessment: "The contribution is weaker than claimed." },
    ]);
    const round = await runPeerReview({ sections: SECTIONS, roundNumber: 1, provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY, lenses: ["contribution"] });
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

    const round = await runPeerReview({ sections: SECTIONS, roundNumber: 1, provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY, lenses: ["contribution", "literature", "methodology"] });
    expect(round.lensesRun).toEqual(["contribution", "methodology"]);
    expect(round.lensErrors.literature).toMatch(/could not be parsed/i);
  });

  it("rejects a lens response with no overallAssessment as unparseable rather than defaulting one", async () => {
    mockModelResponses([{ findings: [] }]);
    const round = await runPeerReview({ sections: SECTIONS, roundNumber: 1, provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY, lenses: ["evidence"] });
    expect(round.lensesRun).toEqual([]);
    expect(round.lensErrors.evidence).toMatch(/could not be parsed/i);
  });

  it("propagates GatewayDenied for a restricted scope rather than treating it as a per-lens failure", async () => {
    global.fetch = vi.fn();
    const restrictedPolicy = markRestricted(defaultPolicy(), "embargoed-project");
    let caught: unknown;
    try {
      await runPeerReview({ sections: SECTIONS, roundNumber: 1, provider: "openai", apiKey: "sk-test", policy: restrictedPolicy, scopeId: "embargoed-project" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GatewayDenied);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
