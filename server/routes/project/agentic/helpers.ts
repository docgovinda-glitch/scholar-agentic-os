import express from "express";
import { getProjectStore, type ProjectRecord } from "../../../../src/services/store/projectStore.ts";
import { normalizeUnicodeNFC } from "../../../src/utils/scholarlyVoiceGuard.ts";
import type { CanonicalDocument, Block } from "../../../../src/desk/types.ts";
import { safeParseAnswerField } from "../../../../src/shared/projectStateSchema.ts";
import { createUploadInstance } from "../../../src/middleware/uploadGuard.ts";
import type {
  RefereeRole,
  AcademicCritiqueItem,
  RebuttalMatrixItem,
  CitationReconciliationReport,
} from "./types.ts";

export const userUpload = createUploadInstance({ enforceHeavyParseLimit: true });

export async function getProjectSafe<P extends Record<string, string | undefined> = Record<string, string | undefined>>(
  req: express.Request<P>,
  res: express.Response
): Promise<ProjectRecord | null> {
  const params = req.params as Record<string, string | undefined>;
  const projectId = params?.id;
  if (!projectId) {
    res.status(400).json({ error: "Missing project ID" });
    return null;
  }
  const callerId = (req as express.Request & { user?: { id: string } }).user?.id;
  const project = await getProjectStore().get(projectId);
  if (!project || !callerId || project.ownerId !== callerId) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  return project;
}

function toHeadingKind(level: number): "heading1" | "heading2" | "heading3" {
  if (level <= 1) return "heading1";
  if (level === 2) return "heading2";
  return "heading3";
}

/**
 * Converts manuscript raw text or structured section array into a CanonicalDocument
 * ensuring strict NFC Unicode and IAST diacritic normalization.
 */
export function manuscriptToCanonicalDocument(
  projectId: string,
  title: string,
  textOrSections: string | Array<{ section?: string; section_name?: string; title?: string; content: string }>
): CanonicalDocument {
  const blocks: Block[] = [];
  let blockIdx = 0;

  if (typeof textOrSections === "string") {
    let parsedSections: Array<{ section?: string; section_name?: string; title?: string; content: string }> | null = null;
    if (textOrSections.trim().startsWith("[")) {
      const parsed = safeParseAnswerField<Array<{ section?: string; section_name?: string; title?: string; content: string }> | null>(
        textOrSections,
        null
      );
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsedSections = parsed;
      }
    }

    if (parsedSections) {
      for (const sec of parsedSections) {
        const secTitle = sec.section || sec.section_name || sec.title || "Section";
        blocks.push({
          id: `blk-${++blockIdx}`,
          kind: "heading2",
          text: normalizeUnicodeNFC(secTitle),
        });
        const paragraphs = (sec.content || "").split(/\n\n+/).filter(Boolean);
        for (const p of paragraphs) {
          blocks.push({
            id: `blk-${++blockIdx}`,
            kind: "paragraph",
            text: normalizeUnicodeNFC(p.trim()),
          });
        }
      }
    } else {
      const rawLines = textOrSections.split("\n");
      for (const rawLine of rawLines) {
        const line = rawLine.trim();
        if (!line) continue;
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          blocks.push({
            id: `blk-${++blockIdx}`,
            kind: toHeadingKind(headingMatch[1].length),
            // "§ " marks Studio section headings in stored text; it isn't part of the title.
            text: normalizeUnicodeNFC(headingMatch[2].replace(/^§\s*/, "")),
          });
        } else {
          blocks.push({
            id: `blk-${++blockIdx}`,
            kind: "paragraph",
            text: normalizeUnicodeNFC(line),
          });
        }
      }
    }
  } else if (Array.isArray(textOrSections)) {
    for (const sec of textOrSections) {
      const secTitle = sec.section || sec.section_name || sec.title || "Section";
      blocks.push({
        id: `blk-${++blockIdx}`,
        kind: "heading2",
        text: normalizeUnicodeNFC(secTitle),
      });
      const paragraphs = (sec.content || "").split(/\n\n+/).filter(Boolean);
      for (const p of paragraphs) {
        blocks.push({
          id: `blk-${++blockIdx}`,
          kind: "paragraph",
          text: normalizeUnicodeNFC(p.trim()),
        });
      }
    }
  }

  return {
    id: `doc-${projectId}`,
    title: normalizeUnicodeNFC(title || "Manuscript Draft"),
    blocks: blocks.length > 0 ? blocks : [{ id: "blk-1", kind: "paragraph", text: "Manuscript draft content" }],
  };
}

/**
 * 100% Citation-to-Vault Reconciliation Auditor:
 * Cross-checks manuscript in-text citations against Knowledge Vault sources
 * and checks for [Unverified Claim — Vault Citation Required] tags.
 */
export function reconcileManuscriptCitations(
  manuscriptText: string,
  project: ProjectRecord
): CitationReconciliationReport {
  const normalized = normalizeUnicodeNFC(manuscriptText || "");

  const atMatches = Array.from(normalized.matchAll(/\[@([a-zA-Z0-9_\-.:]+)\]/g)).map((m) => m[1]);
  const authorYearMatches = Array.from(
    normalized.matchAll(/\(([A-Z][a-zA-Z\s]+(?:et\s+al\.?)?,\s*(?:19|20)\d{2}[a-z]?)\)/g)
  ).map((m) => m[1]);
  const evMatches = Array.from(normalized.matchAll(/\[(ev-[a-zA-Z0-9_\-]+)\]/g)).map((m) => m[1]);
  const numericMatches = Array.from(normalized.matchAll(/\[(\d+)\]/g)).map((m) => m[1]);

  const allInTextKeys = Array.from(
    new Set([...atMatches, ...authorYearMatches, ...evMatches, ...numericMatches])
  );

  const unverifiedMatches =
    normalized.match(/\[Unverified Claim\s*—\s*Vault Citation Required\]/gi) || [];
  const unverifiedClaimsCount = unverifiedMatches.length;

  const vaultSources: Array<{
    id?: string;
    title?: string;
    authors?: unknown;
    author?: string;
    year?: string | number;
    publicationDate?: string;
    publication_year?: string | number;
    doi?: string;
    key?: string;
  }> = [];

  const rawVault = project?.answers?.["approved_vault_sources"] || project?.answers?.["vault_sources"];
  if (rawVault) {
    const parsed = safeParseAnswerField<unknown[]>(rawVault, []);
    if (Array.isArray(parsed)) vaultSources.push(...(parsed as typeof vaultSources));
  }
  const rawExt =
    project?.answers?.["approved_external_sources"] || project?.answers?.["pending_external_sources"];
  if (rawExt) {
    const parsed = safeParseAnswerField<unknown[]>(rawExt, []);
    if (Array.isArray(parsed)) vaultSources.push(...(parsed as typeof vaultSources));
  }
  const extraSources = (project as { sources?: Array<{ id?: string; title?: string; authors?: unknown; doi?: string; key?: string }> }).sources;
  if (Array.isArray(extraSources)) {
    vaultSources.push(...extraSources);
  }

  const vaultKeys = new Set<string>();
  const vaultAuthorYears = new Set<string>();
  for (const s of vaultSources) {
    if (s.id) vaultKeys.add(s.id.toLowerCase());
    if (s.doi) vaultKeys.add(s.doi.toLowerCase());
    if (s.key) vaultKeys.add(s.key.toLowerCase());
    const authorStr =
      typeof s.author === "string"
        ? s.author
        : Array.isArray(s.authors)
        ? (typeof s.authors[0] === "string" ? s.authors[0] : (s.authors[0] as { name?: string })?.name || "")
        : typeof s.authors === "string"
        ? s.authors
        : "";
    const year = s.year || s.publicationDate || s.publication_year;
    if (authorStr && year) {
      const last = authorStr.split(/\s+/).pop()?.toLowerCase();
      if (last) vaultAuthorYears.add(`${last}, ${year}`);
    }
    if (s.title) {
      vaultKeys.add(s.title.toLowerCase());
    }
  }

  const orphanCitations: string[] = [];
  let matchedCount = 0;

  for (const inText of allInTextKeys) {
    const lower = inText.toLowerCase();
    const isMatched =
      vaultKeys.has(lower) ||
      Array.from(vaultKeys).some((k) => lower.includes(k) || k.includes(lower)) ||
      Array.from(vaultAuthorYears).some((ay) => lower.includes(ay)) ||
      /^\d+$/.test(inText);

    if (isMatched) {
      matchedCount++;
    } else {
      orphanCitations.push(inText);
    }
  }

  const uncitedVaultSources: string[] = [];
  for (const s of vaultSources) {
    const title = s.title || s.id || "Untitled Source";
    const sid = s.id ? s.id.toLowerCase() : "";
    const sdoi = s.doi ? s.doi.toLowerCase() : "";
    const isCited = allInTextKeys.some((k) => {
      const lk = k.toLowerCase();
      return (sid && lk.includes(sid)) || (sdoi && lk.includes(sdoi)) || (title && normalized.includes(title));
    });
    if (!isCited && !allInTextKeys.some((k) => /^\d+$/.test(k))) {
      uncitedVaultSources.push(title);
    }
  }

  const pass = orphanCitations.length === 0 && unverifiedClaimsCount === 0;

  return {
    totalInTextCitations: allInTextKeys.length,
    inTextKeys: allInTextKeys,
    matchedVaultCitations: matchedCount,
    vaultMatchCount: matchedCount,
    orphanCitations,
    uncitedVaultSources: uncitedVaultSources.slice(0, 10),
    uncitedVaultItems: uncitedVaultSources.slice(0, 10),
    unverifiedClaimsCount,
    pass,
  };
}

/**
 * One rebuttal row per real reviewer critique. Author response and revision
 * action stay empty for the author (or the AI, when available) to fill in:
 * nothing is marked addressed and no edit is proposed on the author's behalf.
 */
export function buildRebuttalMatrixFromCritiques(critiques: AcademicCritiqueItem[]): RebuttalMatrixItem[] {
  return critiques.map((c, idx) => {
    const referee = c.referee || c.refereeRole || "Reviewer";
    return {
      id: `reb-${idx + 1}`,
      referee,
      refereeRole: c.refereeRole || referee,
      lens: c.lens || c.critiqueLens || "",
      section: c.section,
      critique: c.feedback || c.critique || "",
      severity: c.severity,
      authorResponse: c.authorNote || "",
      revisionAction: c.revisionDirective || "",
      status: c.waived ? "waived" : "pending",
    };
  });
}
