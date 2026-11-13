import { describe, it, expect, vi, beforeEach } from "vitest";

const authedJsonFetch = vi.fn();
vi.mock("../../api", () => ({ authedJsonFetch: (...a: unknown[]) => authedJsonFetch(...a) }));

import { discoverRealScholarlySourcesFromServer, discoverSourcesForAssignment } from "../services/realScholarlyDiscoveryService";

const BRIEF = `DEPARTMENT OF COMPUTER SCIENCE & QUANTUM INFORMATION SYSTEMS
Module Code: QNT-4020 Word Count: 2,000 words
Q1a. Compare superconducting transmon and trapped-ion qubits in terms of coherence time. [5 Marks]
Q2. Derive the quantum Fourier transform circuit and show its role in Shor's algorithm. [15 Marks]
Q3. Explain surface code quantum error correction thresholds. [10 Marks]
Recommended: Preskill (2018).`;

const okResponse = (sources: unknown[]) => ({ ok: true, json: async () => ({ success: true, count: sources.length, sources }) });

describe("source discovery from a brief", () => {
  beforeEach(() => {
    authedJsonFetch.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
  });

  it("sends clean keyword phrases, never the raw brief, and survives one failing phrase", async () => {
    authedJsonFetch
      .mockResolvedValueOnce(okResponse([{ title: "Coherence in transmon qubits", authors: ["A. Author"], year: 2020, discoveredVia: "openalex", sourceType: "scholarly", authorityTier: "A" }]))
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce(okResponse([]));
    const found = await discoverRealScholarlySourcesFromServer(BRIEF, "harvard");
    const sent = authedJsonFetch.mock.calls.map((c) => (c[2] as { query: string }).query);
    expect(sent.length).toBeGreaterThanOrEqual(3);
    for (const q of sent) {
      expect(q).not.toMatch(/DEPARTMENT|QNT|4020|Marks/);
      expect(q.length).toBeLessThan(80);
    }
    expect(found).toHaveLength(1);
  });

  it("lists prescribed references first with the badge flag", async () => {
    authedJsonFetch.mockResolvedValue(okResponse([]));
    const list = await discoverSourcesForAssignment({ question: BRIEF, citationStyle: "harvard" });
    expect(list[0].prescribedInBrief).toBe(true);
    expect(list[0].title).toMatch(/Preskill/);
  });
});
