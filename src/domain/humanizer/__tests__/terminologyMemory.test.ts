import { describe, it, expect } from "vitest";
import {
  createTerminologyEntry,
  resolveTerminologyHierarchy,
  promoteTerminologyEntry,
} from "../memory/terminologyMemoryService";

describe("Phase 9: Cross-Session Terminology Memory & Precedence", () => {
  describe("1. Scope Creation & Precedence Resolution", () => {
    it("resolves precedence correctly (DOCUMENT > PROJECT > USER > SYSTEM)", () => {
      const userEntry = createTerminologyEntry({
        term: "Dharma Governance",
        scope: "USER",
        preferredForm: "Dharma Governance",
        locked: true,
      });

      const projectEntry = createTerminologyEntry({
        term: "Rajadharma",
        scope: "PROJECT",
        preferredForm: "Rajadharma",
        locked: true,
      });

      const docEntry = createTerminologyEntry({
        term: "Rajadharma",
        scope: "DOCUMENT",
        preferredForm: "Rajadharma",
        locked: true,
      });

      const res = resolveTerminologyHierarchy({
        documentEntries: [docEntry],
        projectEntries: [projectEntry],
        userEntries: [userEntry],
      });

      expect(res.resolvedLockedTerms).toContain("Rajadharma");
      expect(res.resolvedLockedTerms).toContain("Dharma Governance");

      // Verify active entry for Rajadharma is the DOCUMENT scoped entry
      const activeRajadharma = res.activeEntries.find((e) => e.term === "Rajadharma");
      expect(activeRajadharma?.scope).toBe("DOCUMENT");
    });

    it("detects and flags conflict between differing preferred forms across scopes", () => {
      const userEntry = createTerminologyEntry({
        term: "Dharma",
        scope: "USER",
        preferredForm: "Moral Order",
        locked: true,
      });

      const docEntry = createTerminologyEntry({
        term: "Dharma",
        scope: "DOCUMENT",
        preferredForm: "Dharmic Duty",
        locked: true,
      });

      const res = resolveTerminologyHierarchy({
        documentEntries: [docEntry],
        userEntries: [userEntry],
      });

      expect(res.conflicts.length).toBe(1);
      expect(res.conflicts[0].higherScope).toBe("DOCUMENT");
      expect(res.conflicts[0].lowerScope).toBe("USER");
      expect(res.conflicts[0].resolution).toBe("HIGHER_SCOPE_APPLIED");

      // Active entry strictly preserves DOCUMENT
      const active = res.activeEntries.find((e) => e.term === "Dharma");
      expect(active?.preferredForm).toBe("Dharmic Duty");
    });
  });

  describe("2. Terminology Promotion", () => {
    it("promotes a document entry to project or user scope without mutating document entry", () => {
      const docEntry = createTerminologyEntry({
        term: "Vedic Trusteeship",
        scope: "DOCUMENT",
        locked: true,
      });

      const promoted = promoteTerminologyEntry(docEntry, "PROJECT", {
        projectId: "proj-scholar-42",
      });

      expect(promoted.scope).toBe("PROJECT");
      expect(promoted.projectId).toBe("proj-scholar-42");
      expect(promoted.term).toBe("Vedic Trusteeship");

      // Original document entry remains untouched
      expect(docEntry.scope).toBe("DOCUMENT");
    });
  });
});
