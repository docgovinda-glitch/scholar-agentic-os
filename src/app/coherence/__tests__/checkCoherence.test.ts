import { fetchCompleter } from "../../../test/fetchCompleter";
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkCoherence } from "../checkCoherence";
import type { GeneratedSection } from "../../../domain/manuscript/types";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});


function section(key: string, title: string, text: string): GeneratedSection {
  return { key, title, text, wordCount: 10, memory: "m", citedEvidenceIds: [], generatedAt: "now" };
}

const SECTIONS = [
  section("introduction", "Introduction", "We studied 40 participants."),
  section("methods", "Methods", "We recruited 50 subjects for this study."),
];

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

describe("checkCoherence", () => {
  it("returns an empty report without calling the model when fewer than two sections exist", async () => {
    global.fetch = vi.fn();
    const report = await checkCoherence({ sections: [section("introduction", "Introduction", "text")], complete: fetchCompleter });
    expect(report.issues).toEqual([]);
    expect(report.passesRun).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("runs all three dimensions and aggregates their issues", async () => {
    mockModelResponses([
      { issues: [{ description: "Inconsistent headcount terms.", sectionKeys: ["introduction", "methods"], severity: "moderate" }] },
      { issues: [] },
      { issues: [{ description: "Participant count changes from 40 to 50.", sectionKeys: ["introduction", "methods"], severity: "major" }] },
    ]);

    const report = await checkCoherence({ sections: SECTIONS, complete: fetchCompleter });
    expect(report.passesRun).toEqual(["terminology", "argument_continuity", "methodology"]);
    expect(report.issues).toHaveLength(2);
    expect(report.issues[0].dimension).toBe("terminology");
    expect(report.issues[1].dimension).toBe("methodology");
    expect(report.passErrors).toEqual({});
  });

  it("records a failed pass in passErrors without losing the other passes' results", async () => {
    let call = 0;
    global.fetch = vi.fn(() => {
      call++;
      if (call === 2) {
        return Promise.resolve({ ok: true, json: async () => ({ choices: [{ message: { content: "not json" } }] }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ issues: [] }) } }] }),
      } as Response);
    }) as unknown as typeof fetch;

    const report = await checkCoherence({ sections: SECTIONS, complete: fetchCompleter });
    expect(report.passesRun).toEqual(["terminology", "methodology"]);
    expect(report.passErrors.argument_continuity).toMatch(/could not be parsed/i);
  });


  it("runs only the requested subset of dimensions when given one", async () => {
    mockModelResponses([{ issues: [] }]);
    const report = await checkCoherence({ sections: SECTIONS, complete: fetchCompleter, dimensions: ["methodology"] });
    expect(report.passesRun).toEqual(["methodology"]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
