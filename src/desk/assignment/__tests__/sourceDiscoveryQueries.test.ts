/**
 * Source discovery from a brief. The search runs on the server (POST
 * /assignment/sources/search); the browser only calls that route. The parts
 * that read the brief are pure and tested here: clean search phrases (never
 * the raw brief) and the references the brief names, listed first.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authedJsonFetch = vi.fn();
vi.mock("../../api", () => ({ authedJsonFetch: (...a: unknown[]) => authedJsonFetch(...a) }));

import { discoverSourcesForAssignment, searchSourcesForProject } from "../services/realScholarlyDiscoveryService";
import { anchorQueries, briefDomainTerms, buildSourceSearchQueries } from "../../../utils/briefSourceQueries";
import { parseBriefQuestions } from "../../../utils/briefQuestions";
import { prescribedFromBrief } from "../../../domain/assignment/sourceSearch";

const BRIEF = `DEPARTMENT OF COMPUTER SCIENCE & QUANTUM INFORMATION SYSTEMS
Module Code: QNT-4020 Word Count: 2,000 words
Q1a. Compare superconducting transmon and trapped-ion qubits in terms of coherence time. [5 Marks]
Q2. Derive the quantum Fourier transform circuit and show its role in Shor's algorithm. [15 Marks]
Q3. Explain surface code quantum error correction thresholds. [10 Marks]
Recommended: Preskill (2018).`;

describe("source discovery from a brief", () => {
  beforeEach(() => authedJsonFetch.mockReset());

  it("builds clean keyword phrases, never the raw brief, each carrying the subject word", () => {
    const queries = anchorQueries(buildSourceSearchQueries(BRIEF, 5), briefDomainTerms(BRIEF));
    expect(queries.length).toBeGreaterThanOrEqual(3);
    for (const q of queries) {
      expect(q).not.toMatch(/DEPARTMENT|QNT|4020|Marks/);
      expect(q.length).toBeLessThan(80);
    }
  });

  it("lists the brief's own references first, kept as named when no index confirms them", async () => {
    const ctx = { queries: ["quantum error correction"], domainTerms: ["quantum"], questionRows: parseBriefQuestions(BRIEF) };
    const list = await prescribedFromBrief(BRIEF, ctx, "harvard", async () => []);
    expect(list[0].prescribedInBrief).toBe(true);
    expect(list[0].title).toMatch(/Preskill/);
    expect(list[0].verificationStatus).toBe("unverified");
  });

  it("uses the indexed record when an index confirms the named author and year", async () => {
    const ctx = { queries: ["quantum error correction"], domainTerms: ["quantum"], questionRows: [] };
    const list = await prescribedFromBrief(BRIEF, ctx, "harvard", async () => [
      { title: "Quantum Computing in the NISQ era and beyond", authors: ["Preskill, J."], year: 2018, doi: "10.22331/q-2018-08-06-79", venue: "Quantum" },
    ]);
    expect(list[0]).toMatchObject({ prescribedInBrief: true, doi: "10.22331/q-2018-08-06-79", verificationStatus: "verified" });
  });

  it("the browser asks the project's search route and reports a failed search", async () => {
    authedJsonFetch.mockResolvedValueOnce(new Response(JSON.stringify({ sources: [{ id: "s1", title: "T" }] }), { status: 200 }));
    expect(await discoverSourcesForAssignment("p1")).toHaveLength(1);
    expect(authedJsonFetch.mock.calls[0][0]).toBe("/api/projects/p1/assignment/sources/search");
    expect(authedJsonFetch.mock.calls[0][2]).toEqual({ includePrescribed: true, limit: 30 });
    authedJsonFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Add your assignment brief first." }), { status: 400 }));
    await expect(searchSourcesForProject("p1", {})).rejects.toThrow(/brief first/);
  });
});
