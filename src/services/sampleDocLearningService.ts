/**
 * Stage 7 (target-workflow.md) — sample-document structure learning. See
 * docs/planning/sample-doc-learning-scoping.md for the full design and why
 * style/citation-style/formatting extraction are explicitly not attempted
 * here.
 *
 * Reuses the same real, already-working upload-and-parse path
 * knowledgeVaultService.ts's Knowledge Vault upload flow already uses
 * (/api/parse-file — DOCXParser/PDFParser/TXTParser/MarkdownParser) —
 * no new parsing dependency, no duplicated upload logic.
 */

export interface SampleDocumentStructure {
  /** Real, detected section headings in document order — never a fabricated
   *  or inferred name for a section the document doesn't actually contain. */
  sectionStructure: string[];
  /** The uploaded file's name, for display ("Learned from: paper.pdf"). */
  sourceFileName: string;
}

export async function learnStructureFromSampleDocument(file: File): Promise<SampleDocumentStructure> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  );

  const parseRes = await fetch("/api/parse-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileContent: base64,
    }),
  });

  if (!parseRes.ok) {
    const errData = await parseRes.json().catch(() => ({ error: "Parse failed" }));
    throw new Error(errData.error || "Failed to parse the uploaded document.");
  }

  const parseData = await parseRes.json();
  const headings: string[] = Array.isArray(parseData.headings) ? parseData.headings : [];

  if (headings.length === 0) {
    throw new Error(
      "Could not detect any section structure in this document. Try a different file, or continue with the standard template instead."
    );
  }

  return {
    sectionStructure: headings,
    sourceFileName: file.name,
  };
}
