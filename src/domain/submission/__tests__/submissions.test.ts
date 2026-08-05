import { describe, it, expect } from "vitest";
import { addSubmission, updateSubmission, deleteSubmission, SubmissionError } from "../submissions";
import type { SubmissionRecord } from "../types";

function submission(id: string, overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id,
    journalName: "Nature Machine Intelligence",
    submittedAt: "2026-01-01",
    status: "draft",
    statusUpdatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("domain/submission/submissions: addSubmission", () => {
  it("adds to an empty list", () => {
    const result = addSubmission([], submission("s1"));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
  });

  it("refuses a duplicate id", () => {
    const existing = [submission("s1")];
    expect(() => addSubmission(existing, submission("s1"))).toThrow(SubmissionError);
  });

  it("does not mutate the input array", () => {
    const existing = [submission("s1")];
    addSubmission(existing, submission("s2"));
    expect(existing).toHaveLength(1);
  });
});

describe("domain/submission/submissions: updateSubmission", () => {
  it("patches fields on the matching record", () => {
    const existing = [submission("s1"), submission("s2", { journalName: "Other Journal" })];
    const result = updateSubmission(existing, "s2", { notes: "resubmitting" }, "2026-02-01T00:00:00.000Z");
    expect(result.find((s) => s.id === "s2")?.notes).toBe("resubmitting");
    expect(result.find((s) => s.id === "s1")).toEqual(existing[0]);
  });

  it("bumps statusUpdatedAt when status actually changes", () => {
    const existing = [submission("s1", { status: "submitted", statusUpdatedAt: "2026-01-01T00:00:00.000Z" })];
    const result = updateSubmission(existing, "s1", { status: "under_review" }, "2026-02-01T00:00:00.000Z");
    expect(result[0].status).toBe("under_review");
    expect(result[0].statusUpdatedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("leaves statusUpdatedAt untouched when status is unchanged", () => {
    const existing = [submission("s1", { status: "submitted", statusUpdatedAt: "2026-01-01T00:00:00.000Z" })];
    const result = updateSubmission(existing, "s1", { notes: "still waiting" }, "2026-02-01T00:00:00.000Z");
    expect(result[0].statusUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("leaves statusUpdatedAt untouched when the patch re-sends the same status", () => {
    const existing = [submission("s1", { status: "submitted", statusUpdatedAt: "2026-01-01T00:00:00.000Z" })];
    const result = updateSubmission(existing, "s1", { status: "submitted" }, "2026-02-01T00:00:00.000Z");
    expect(result[0].statusUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("throws for an unknown id", () => {
    expect(() => updateSubmission([], "missing", { notes: "x" }, "2026-01-01T00:00:00.000Z")).toThrow(SubmissionError);
  });
});

describe("domain/submission/submissions: deleteSubmission", () => {
  it("removes the matching record", () => {
    const existing = [submission("s1"), submission("s2")];
    const result = deleteSubmission(existing, "s1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s2");
  });

  it("throws for an unknown id", () => {
    expect(() => deleteSubmission([submission("s1")], "missing")).toThrow(SubmissionError);
  });
});
