/**
 * Pure transitions over a GenerationJob. See types.ts for the shape and why
 * "which section is next" is derived rather than stored.
 */

import type { GeneratedSection, GenerationJob, SectionPlan } from "./types";

export class GenerationJobError extends Error {}

export function startJob(plan: SectionPlan[], totalWordTarget: number): GenerationJob {
  if (plan.length === 0) {
    throw new GenerationJobError("Cannot start a generation job with an empty section plan.");
  }
  const now = new Date().toISOString();
  return { state: "running", plan, sections: [], totalWordTarget, startedAt: now, updatedAt: now };
}

/** The next section to generate, or undefined once every planned section is done. */
export function nextSection(job: GenerationJob): SectionPlan | undefined {
  return job.plan[job.sections.length];
}

/**
 * Record one completed section — the actual checkpoint. `section.key` must
 * match the plan's next expected section exactly: this is what makes
 * resuming a job (after a refresh, a server restart, or a failed model
 * call) safe to just call again rather than needing its own separate
 * "resume" code path — appendSection() IS resume, by construction, since it
 * always continues from `job.sections.length`, never from a caller-supplied
 * index.
 */
export function appendSection(job: GenerationJob, section: GeneratedSection): GenerationJob {
  if (job.state === "completed") {
    throw new GenerationJobError("This generation job already completed — nothing left to append.");
  }
  const expected = nextSection(job);
  if (!expected) {
    throw new GenerationJobError("Every planned section is already generated.");
  }
  if (expected.key !== section.key) {
    throw new GenerationJobError(`Expected the next section to be "${expected.key}", got "${section.key}".`);
  }
  const sections = [...job.sections, section];
  const now = new Date().toISOString();
  return {
    ...job,
    sections,
    state: sections.length === job.plan.length ? "completed" : "running",
    updatedAt: now,
    lastError: undefined,
  };
}

/** A section generation attempt failed (model error, parse failure, gateway denial) — the job stops but every already-completed section stays exactly as it was. Never loses prior work on a later failure. */
export function failJob(job: GenerationJob, reason: string): GenerationJob {
  return { ...job, state: "failed", lastError: reason, updatedAt: new Date().toISOString() };
}

/** Resume a failed or paused job — same section-by-section entry point as a fresh start, just continuing from job.sections.length instead of 0. */
export function resumeJob(job: GenerationJob): GenerationJob {
  if (job.state === "completed") {
    throw new GenerationJobError("This generation job already completed — nothing to resume.");
  }
  return { ...job, state: "running", lastError: undefined, updatedAt: new Date().toISOString() };
}

export function pauseJob(job: GenerationJob): GenerationJob {
  if (job.state !== "running") {
    throw new GenerationJobError(`Cannot pause a job that is "${job.state}", not "running".`);
  }
  return { ...job, state: "paused", updatedAt: new Date().toISOString() };
}
