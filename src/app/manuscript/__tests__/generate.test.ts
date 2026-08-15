import { describe, it, expect, vi, afterEach } from "vitest";
import { generateSection, GatewayDenied } from "../generate";
import type { SectionContextPacket } from "../generate";
import { defaultPolicy, recordConsent } from "../../../platform/warden/warden";

// Drafting is content-bearing (platform/warden/classify.ts's
// CONTENT_BEARING_TASKS), so it classifies as user_content and requires
// consent on first use per provider — real Warden behavior, not a test
// artifact. Every test below except the dedicated consent test grants it
// up front so the generation pipeline itself is what's under test.
const CONSENTED_POLICY = recordConsent(defaultPolicy(), "openai");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockModelResponse(content: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] } ),
  } as Response);
}

const PACKET: SectionContextPacket = {
  researchContext: "This paper studies X in population Y.",
  journalRequirements: { journalName: "Journal of Testing", citationStyle: "Vancouver" },
  section: { key: "introduction", title: "Introduction", guidance: "Establish the gap.", targetWords: 100 },
  priorSectionMemory: [],
  citableEvidence: [{ id: "ev-1", quote: "X was observed in 40% of cases.", sourceTitle: "A Prior Study" }],
};

describe("app/manuscript: generateSection", () => {
  it("throws without calling the model when no provider/apiKey is supplied", async () => {
    global.fetch = vi.fn();
    await expect(generateSection({ packet: PACKET })).rejects.toThrow(/provider and API key/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("parses a well-formed response into a GeneratedSection", async () => {
    mockModelResponse({
      text: "X has been studied extensively [ev-1], yet a gap remains.",
      memory: "Introduces the gap this paper addresses.",
      citedEvidenceIds: ["ev-1"],
    });

    const result = await generateSection({ packet: PACKET, provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY });
    expect(result.section.key).toBe("introduction");
    expect(result.section.text).toContain("gap remains");
    expect(result.section.memory).toBe("Introduces the gap this paper addresses.");
    expect(result.section.citedEvidenceIds).toEqual(["ev-1"]);
    expect(result.section.wordCount).toBeGreaterThan(0);
    expect(result.usage.provider).toBe("openai");
  });

  it("strips a cited evidence id the model invented that isn't in the approved corpus — never trusts the self-report", async () => {
    mockModelResponse({
      text: "According to [ev-1] and [ev-999], X is true.",
      memory: "Summary.",
      citedEvidenceIds: ["ev-1", "ev-999"],
    });

    const result = await generateSection({ packet: PACKET, provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY });
    expect(result.section.citedEvidenceIds).toEqual(["ev-1"]);
  });

  it("never falls back to a fabricated section on unparseable output — throws instead", async () => {
    mockModelResponse("Sure! Here's the introduction section...");
    await expect(generateSection({ packet: PACKET, provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY })).rejects.toThrow(/could not be parsed/i);
  });

  it("rejects a response missing memory or citedEvidenceIds as unparseable rather than defaulting them", async () => {
    mockModelResponse({ text: "Some text." });
    await expect(generateSection({ packet: PACKET, provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY })).rejects.toThrow(/could not be parsed/i);
  });

  it("handles an empty prior-section-memory and empty evidence corpus without crashing (the first section, before any evidence is approved)", async () => {
    mockModelResponse({ text: "Opening text with no citations.", memory: "Sets the stage.", citedEvidenceIds: [] });
    const packet: SectionContextPacket = { ...PACKET, priorSectionMemory: [], citableEvidence: [] };
    const result = await generateSection({ packet, provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY });
    expect(result.section.citedEvidenceIds).toEqual([]);
  });

  it("throws GatewayDenied requiring consent on first use of a provider — drafting is content-bearing, never silently sent", async () => {
    global.fetch = vi.fn();
    let caught: unknown;
    try {
      await generateSection({ packet: PACKET, provider: "openai", apiKey: "sk-test" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GatewayDenied);
    expect((caught as InstanceType<typeof GatewayDenied>).requiresConsent).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
