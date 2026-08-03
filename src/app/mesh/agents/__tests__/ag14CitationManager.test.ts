import { describe, it, expect, beforeEach } from "vitest";
import { runAgent } from "../../executor";
import { ag14CitationManager } from "../ag14CitationManager";
import { issue, __resetCapabilitiesForTests } from "../../../../services/capabilities/capabilities";
import type { CanonicalReference } from "../../../../citation_compliance/model/reference";

function reference(title: string): CanonicalReference {
  return {
    kind: "JournalArticle",
    title,
    authors: [{ firstName: "Jane", lastName: "Doe", order: 0 }],
    publicationDate: "2022-03-15",
    source: "Journal of Testing",
    journal: "Journal of Testing",
    volume: "1",
    pages: "1-10",
  };
}

async function grantAndRun(input: Parameters<typeof ag14CitationManager.run>[0]) {
  const tokens = ag14CitationManager.permissions.map((p) => issue("AG-14", p, "test"));
  return runAgent(ag14CitationManager, input, { subject: "AG-14", capabilityTokenIds: tokens.map((t) => t.id) });
}

describe("app/mesh: AG-14 Citation Manager", () => {
  beforeEach(() => {
    __resetCapabilitiesForTests();
  });

  it("formats a bibliography entry per reference, in order", async () => {
    const record = await grantAndRun({
      style: "apa-7",
      references: [reference("First Paper"), reference("Second Paper")],
      citedReferenceIndices: [0, 1],
    });
    expect(record.status).toBe("completed");
    expect(record.output?.bibliography).toHaveLength(2);
    expect(record.output?.bibliography[0]).toContain("Doe");
  });

  it("formats differently per style — the same reference does not produce identical output across styles", async () => {
    const apa = await grantAndRun({ style: "apa-7", references: [reference("X")], citedReferenceIndices: [0] });
    const ieee = await grantAndRun({ style: "ieee", references: [reference("X")], citedReferenceIndices: [0] });
    expect(apa.output?.bibliography[0]).not.toBe(ieee.output?.bibliography[0]);
  });

  it("throws for an unknown style rather than silently formatting nothing", async () => {
    const record = await grantAndRun({ style: "not-a-real-style", references: [reference("X")], citedReferenceIndices: [] });
    expect(record.status).toBe("failed");
    expect(record.error).toContain("not-a-real-style");
  });

  it("reports an orphaned reference — present in the list, never cited", async () => {
    const record = await grantAndRun({
      style: "harvard",
      references: [reference("Cited"), reference("Never Cited")],
      citedReferenceIndices: [0],
    });
    expect(record.output?.orphanedReferenceIndices).toEqual([1]);
    expect(record.output?.missingReferenceIndices).toEqual([]);
  });

  it("reports a missing reference — cited index has no matching entry", async () => {
    const record = await grantAndRun({
      style: "harvard",
      references: [reference("Only One")],
      citedReferenceIndices: [0, 5],
    });
    expect(record.output?.missingReferenceIndices).toEqual([5]);
  });

  it("every declared permission is required to run", async () => {
    const token = issue("AG-14", "read:corpus", "test"); // only one of three permissions
    const record = runAgent(
      ag14CitationManager,
      { style: "apa-7", references: [], citedReferenceIndices: [] },
      { subject: "AG-14", capabilityTokenIds: [token.id] }
    );
    await expect(record).rejects.toThrow();
  });
});
