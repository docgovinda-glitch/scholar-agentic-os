/**
 * Vault Export Service — Portable Open-Format Exporter (REQ-VLT-7 & Doc 43 §11)
 *
 * Generates an open-standard .zip archive containing:
 * - manifest.json: Full structural metadata and relationship index
 * - references.bib: Aggregated standard BibTeX bibliography for all items
 * - documents/<id>/content.md: Clean Markdown/Text of parsed content
 * - documents/<id>/metadata.json: Bibliographic data and citation compliance objects
 * - README.md: Human-readable archive guide
 */

import JSZip from "jszip";
import type { VaultItem } from "../vaultContents";
import { toBibTeX } from "./citationService";

export interface VaultExportResult {
  blob: Blob;
  filename: string;
  itemCount: number;
}

export async function exportVaultAsZip(items: VaultItem[]): Promise<VaultExportResult> {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const exportDir = `vault-export-${timestamp}`;
  const root = zip.folder(exportDir) || zip;

  // 1. Generate aggregated BibTeX bibliography
  const bibtexEntries = items.map((item) => toBibTeX(item)).filter(Boolean);
  const referencesBib = bibtexEntries.length > 0
    ? `% Scholar Knowledge Vault Export - Generated ${new Date().toISOString()}\n\n` + bibtexEntries.join("\n\n")
    : "% No citation references found in this Vault export.\n";
  root.file("references.bib", referencesBib);

  // 2. Generate Manifest JSON
  const manifest = {
    exportVersion: "2.0",
    schema: "https://scholar.agentic.os/schemas/vault-export-v2.json",
    exportedAt: new Date().toISOString(),
    totalItems: items.length,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      sourceType: item.sourceType || "text",
      filename: item.filename || null,
      mimeType: item.mimeType || null,
      authors: item.authors || [],
      year: item.year || null,
      journal: item.journal || null,
      citation: item.citation || null,
      citationStatus: item.citationStatus || "missing",
      externalReference: item.externalReference || null,
      storageReference: item.storageReference || null,
      canonicalReference: item.canonicalReference || null,
      metadata: item.metadata || {},
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || item.createdAt,
      documentPath: `documents/${item.id}/`,
    })),
  };
  root.file("manifest.json", JSON.stringify(manifest, null, 2));

  // 3. Generate README.md
  const readmeContent = `# Scholar Knowledge Vault Archive

**Export Date:** ${new Date().toLocaleString()}  
**Total Documents / Sources:** ${items.length}  

---

## 📂 Archive Contents

- **\`manifest.json\`**: Machine-readable JSON catalogue of all documents, metadata, source types, and timestamps.
- **\`references.bib\`**: Standard BibTeX bibliography ready to import into Zotero, Mendeley, Overleaf, or LaTeX.
- **\`documents/\`**:
  - Each item has its own directory identified by its unique ID.
  - **\`content.md\`**: Extracted raw academic text and structured notes.
  - **\`metadata.json\`**: Bibliographic metadata and canonical reference details.

---

## 📖 Portability Guarantee (REQ-VLT-7)
This archive uses open standard formats (JSON, BibTeX, and Markdown). It does **not** require Scholar OS to view, parse, or reuse in any other tool.
`;
  root.file("README.md", readmeContent);

  // 4. Populate documents/ directory
  const docsFolder = root.folder("documents");
  if (docsFolder) {
    for (const item of items) {
      const itemFolder = docsFolder.folder(item.id);
      if (itemFolder) {
        // Document content
        const markdownHeader = `# ${item.title}\n\n` +
          `**Source Type:** ${item.sourceType || "text"}  \n` +
          (item.authors && item.authors.length > 0 ? `**Authors:** ${item.authors.join(", ")}  \n` : "") +
          (item.year ? `**Year:** ${item.year}  \n` : "") +
          (item.journal ? `**Journal:** ${item.journal}  \n` : "") +
          (item.citation ? `**Citation:** ${item.citation}  \n` : "") +
          `**Created:** ${item.createdAt}  \n\n---\n\n`;

        itemFolder.file("content.md", markdownHeader + (item.content || ""));

        // Document individual metadata
        itemFolder.file("metadata.json", JSON.stringify({
          id: item.id,
          title: item.title,
          sourceType: item.sourceType,
          filename: item.filename,
          authors: item.authors,
          year: item.year,
          journal: item.journal,
          citation: item.citation,
          canonicalReference: item.canonicalReference,
          metadata: item.metadata,
          createdAt: item.createdAt,
        }, null, 2));
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return {
    blob,
    filename: `scholar-vault-export-${timestamp}.zip`,
    itemCount: items.length,
  };
}

/**
 * Triggers a browser download of the exported Vault ZIP archive.
 */
export async function downloadVaultZip(items: VaultItem[]): Promise<void> {
  const result = await exportVaultAsZip(items);
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
