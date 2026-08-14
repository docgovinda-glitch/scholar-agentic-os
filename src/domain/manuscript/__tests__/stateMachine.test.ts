import { describe, it, expect } from "vitest";
import { startJob, nextSection, appendSection, failJob, resumeJob, pauseJob, GenerationJobError } from "../stateMachine";
import type { GeneratedSection, SectionPlan } from "../types";

const PLAN: SectionPlan[] = [
  { key: "introduction", title: "Introduction", guidance: "g", targetWords: 500 },
  { key: "methods", title: "Methods", guidance: "g", targetWords: 700 },
];

function section(key: string): GeneratedSection {
  return { key, title: key, text: "Some generated text.", wordCount: 4, memory: "A summary.", citedEvidenceIds: [], generatedAt: new Date().toISOString() };
}

describe("domain/manuscript: startJob", () => {
  it("starts running with an empty sections list", () => {
    const job = startJob(PLAN, 3000);
    expect(job.state).toBe("running");
    expect(job.sections).toEqual([]);
    expect(job.plan).toBe(PLAN);
  });

  it("refuses to start with an empty plan", () => {
    expect(() => startJob([], 3000)).toThrow(GenerationJobError);
  });
});

describe("domain/manuscript: nextSection", () => {
  it("is the first plan entry for a fresh job", () => {
    expect(nextSection(startJob(PLAN, 3000))?.key).toBe("introduction");
  });

  it("is undefined once every section is done", () => {
    let job = startJob(PLAN, 3000);
    job = appendSection(job, section("introduction"));
    job = appendSection(job, section("methods"));
    expect(nextSection(job)).toBeUndefined();
  });
});

describe("domain/manuscript: appendSection — the actual checkpoint", () => {
  it("appends a completed section and stays 'running' when more remain", () => {
    const job = appendSection(startJob(PLAN, 3000), section("introduction"));
    expect(job.sections).toHaveLength(1);
    expect(job.state).toBe("running");
  });

  it("transitions to 'completed' after the last planned section", () => {
    let job = startJob(PLAN, 3000);
    job = appendSection(job, section("introduction"));
    job = appendSection(job, section("methods"));
    expect(job.state).toBe("completed");
  });

  it("refuses a section out of plan order — resuming always continues from sections.length, never a caller-supplied index", () => {
    const job = startJob(PLAN, 3000);
    expect(() => appendSection(job, section("methods"))).toThrow(/Expected the next section/);
  });

  it("refuses to append once the job is already completed", () => {
    let job = startJob(PLAN, 3000);
    job = appendSection(job, section("introduction"));
    job = appendSection(job, section("methods"));
    expect(() => appendSection(job, section("introduction"))).toThrow(GenerationJobError);
  });

  it("never loses an earlier completed section when a later append clears a prior failure", () => {
    let job = startJob(PLAN, 3000);
    job = appendSection(job, section("introduction"));
    job = failJob(job, "Model call failed.");
    job = resumeJob(job);
    job = appendSection(job, section("methods"));
    expect(job.sections.map((s) => s.key)).toEqual(["introduction", "methods"]);
    expect(job.lastError).toBeUndefined();
  });
});

describe("domain/manuscript: failJob / resumeJob / pauseJob", () => {
  it("failJob preserves every already-completed section", () => {
    let job = appendSection(startJob(PLAN, 3000), section("introduction"));
    job = failJob(job, "boom");
    expect(job.state).toBe("failed");
    expect(job.lastError).toBe("boom");
    expect(job.sections).toHaveLength(1);
  });

  it("resumeJob continues from where a failed job left off, not from the start", () => {
    let job = appendSection(startJob(PLAN, 3000), section("introduction"));
    job = failJob(job, "boom");
    job = resumeJob(job);
    expect(job.state).toBe("running");
    expect(nextSection(job)?.key).toBe("methods");
  });

  it("refuses to resume an already-completed job", () => {
    let job = startJob(PLAN, 3000);
    job = appendSection(job, section("introduction"));
    job = appendSection(job, section("methods"));
    expect(() => resumeJob(job)).toThrow(GenerationJobError);
  });

  it("pauseJob only works on a running job", () => {
    const job = startJob(PLAN, 3000);
    const paused = pauseJob(job);
    expect(paused.state).toBe("paused");
    expect(() => pauseJob(paused)).toThrow(GenerationJobError);
  });
});
