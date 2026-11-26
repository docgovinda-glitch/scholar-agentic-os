/**
 * Batch Export Helper — Multi-Format Reference Exporter
 *
 * Supports batch generation and browser download of BibTeX (.bib),
 * formatted academic bibliographies (APA, MLA, Chicago, Harvard, IEEE, Vancouver),
 * and structured JSON / CSV metadata.
 */

import type { VaultItem } from "../vaultContents";
import { formatVaultCitation, toBibTeX, type CitationStyleType } from "./citationService";

/**
 * Generates an aggregated BibTeX file from a set of vault items
 */
export function generateBatchBibTeX(items: VaultItem[]): string {
  if (!items || items.length === 0) return "";
  const header = `% Scholar Knowledge Vault - BibTeX Export\n% Exported: ${new Date().toISOString()}\n% Total Entries: ${items.length}\n\n`;
  const entries = items.map((i) => toBibTeX(i)).filter(Boolean);
  return header + entries.join("\n\n");
}

/**
 * Generates an alphabetically sorted, formatted bibliography in the requested academic style
 */
export function generateBatchBibliography(
  items: VaultItem[],
  style: CitationStyleType = "apa7"
): string {
  if (!items || items.length === 0) return "";

  const sorted = [...items].sort((a, b) => {
    const authorA = a.authors?.[0] || a.title;
    const authorB = b.authors?.[0] || b.title;
    return authorA.localeCompare(authorB);
  });

  const formattedLines = sorted.map((item) => formatVaultCitation(item, style));
  return formattedLines.join("\n\n");
}

/**
 * Triggers a browser file download without server requests
 */
export function downloadTextFile(content: string, filename: string, mimeType = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
