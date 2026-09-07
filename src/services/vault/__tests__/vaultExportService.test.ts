import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { exportVaultAsZip } from "../vaultExportService";
import type { VaultItem } from "../../vaultContents";

describe("vaultExportService (REQ-VLT-7 Open Format Export)", () => {
  const mockItems: VaultItem[] = [
    {
      id: "vault-1",
      title: "Agentic AI in Medical Diagnosis",
      content: "This paper explores multi-agent architectures for clinical decision support.",
      authors: ["Alice Smith", "Bob Jones"],
      year: "2025",
      journal: "Nature Digital Medicine",
      sourceType: "file",
      filename: "agentic_ai.pdf",
      citation: "Smith, A., & Jones, B. (2025). Agentic AI in Medical Diagnosis.",
      citationStatus: "confirmed",
      createdAt: "2026-01-15T10:00:00.000Z",
    },
    {
      id: "vault-2",
      title: "Deep Reinforcement Learning Survey",
      content: "A survey of policy gradient methods and model-based RL.",
      authors: ["Carol White"],
      year: "2024",
      sourceType: "reference",
      citationStatus: "confirmed",
      createdAt: "2026-02-01T12:00:00.000Z",
    },
  ];

  it("generates a valid ZIP archive containing manifest.json, references.bib, and documents", async () => {
    const result = await exportVaultAsZip(mockItems);
    expect(result.itemCount).toBe(2);
    expect(result.filename).toMatch(/^scholar-vault-export-.*\.zip$/);
    expect(result.blob.size).toBeGreaterThan(100);

    // Read back zip content
    const arrayBuf = await result.blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuf);
    const files = Object.keys(zip.files);

    // Check files exist inside the export folder
    const hasManifest = files.some((f) => f.endsWith("manifest.json"));
    const hasBib = files.some((f) => f.endsWith("references.bib"));
    const hasReadme = files.some((f) => f.endsWith("README.md"));
    const hasContent1 = files.some((f) => f.includes("vault-1") && f.endsWith("content.md"));
    const hasMetadata1 = files.some((f) => f.includes("vault-1") && f.endsWith("metadata.json"));

    expect(hasManifest).toBe(true);
    expect(hasBib).toBe(true);
    expect(hasReadme).toBe(true);
    expect(hasContent1).toBe(true);
    expect(hasMetadata1).toBe(true);

    // Validate manifest content
    const manifestFile = files.find((f) => f.endsWith("manifest.json"));
    if (manifestFile) {
      const manifestText = await zip.files[manifestFile].async("text");
      const parsed = JSON.parse(manifestText);
      expect(parsed.totalItems).toBe(2);
      expect(parsed.items[0].title).toBe("Agentic AI in Medical Diagnosis");
    }

    // Validate BibTeX references
    const bibFile = files.find((f) => f.endsWith("references.bib"));
    if (bibFile) {
      const bibText = await zip.files[bibFile].async("text");
      expect(bibText).toContain("Agentic AI in Medical Diagnosis");
    }
  });

  it("handles empty vault gracefully", async () => {
    const result = await exportVaultAsZip([]);
    expect(result.itemCount).toBe(0);
    const arrayBuf = await result.blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuf);
    const files = Object.keys(zip.files);
    expect(files.some((f) => f.endsWith("manifest.json"))).toBe(true);
  });
});
