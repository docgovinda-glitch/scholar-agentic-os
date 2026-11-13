import express from "express";
import {
  cleanDoi,
  integrityFromCrossref,
  recordFromCrossref,
  recordFromDataCite,
  sourceIdForDoi,
  type ReferenceRecord,
} from "../../../../src/domain/journal/references.ts";
import { fetchCrossrefMessage, fetchDataCiteAttributes } from "../../../../src/shared/retrieval/providers.ts";
import { getProjectSafe } from "./helpers.ts";

export const referenceRoutes = express.Router({ mergeParams: true });

const MAX_CHECK = 100;

type Json = Record<string, unknown>;
/** `notFound` separates "the registry has no such DOI" from "the registry could not be reached". */
type Lookup = { ok: true; message: Json } | { ok: false; notFound: boolean };

async function registry(fetchRecord: () => Promise<Json | undefined>): Promise<Lookup> {
  try {
    const record = await fetchRecord();
    return record ? { ok: true, message: record } : { ok: false, notFound: true };
  } catch {
    return { ok: false, notFound: false };
  }
}

// The shared provider layer owns the hosts and transport; the DOI is only ever a path segment.
const crossref = (doi: string) => registry(() => fetchCrossrefMessage(doi, { timeoutMs: 8000 }));
const datacite = (doi: string) => registry(() => fetchDataCiteAttributes(doi, { timeoutMs: 8000 }));

/**
 * POST /api/projects/:id/agentic/references/lookup  { doi }
 * The DOI's registered record (Crossref, else DataCite) and whether a
 * retraction, expression of concern or correction is registered against it.
 * Public registries only; no AI and no cost. Nothing is saved here.
 */
referenceRoutes.post("/references/lookup", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const doi = cleanDoi(typeof req.body?.doi === "string" ? req.body.doi : "");
  if (!doi) return res.status(400).json({ error: "That isn't a DOI. A DOI starts with 10. followed by a slash, e.g. 10.1038/s41586-020-2649-2.", code: "invalid_doi" });

  const id = sourceIdForDoi(doi);
  const now = new Date().toISOString();
  const cr = await crossref(doi);
  if (cr.ok) {
    const message = cr.message;
    const record: ReferenceRecord = { ...recordFromCrossref(message, id, doi), integrity: integrityFromCrossref(message, now) };
    return res.json({ record, abstract: typeof message.abstract === "string" ? message.abstract.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "" });
  }
  const dc = await datacite(doi);
  if (dc.ok) {
    const attrs = dc.message;
    // DataCite does not carry retraction notices; say so rather than "clean".
    const record: ReferenceRecord = { ...recordFromDataCite(attrs, id, doi), integrity: { status: "unknown", checkedAt: now } };
    const desc = Array.isArray(attrs.descriptions) ? (attrs.descriptions as Json[])[0]?.description : undefined;
    return res.json({ record, abstract: typeof desc === "string" ? desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "" });
  }
  if (cr.notFound && dc.notFound) {
    return res.status(404).json({ error: `No record for ${doi} at Crossref or DataCite. Check the DOI.`, code: "doi_not_found" });
  }
  return res.status(502).json({ error: "Crossref and DataCite could not be reached. Try again in a minute.", code: "registry_unreachable" });
});

/**
 * POST /api/projects/:id/agentic/references/check  { dois: string[] }
 * Current retraction / concern / correction status for each DOI at Crossref.
 * A DOI that could not be checked comes back as "unknown", never "clean".
 */
referenceRoutes.post("/references/check", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const raw: unknown[] = Array.isArray(req.body?.dois) ? req.body.dois : [];
  const dois = Array.from(new Set(raw.map((d) => cleanDoi(typeof d === "string" ? d : "")).filter((d): d is string => d !== null)));
  if (dois.length === 0) return res.status(400).json({ error: "No DOIs to check.", code: "no_dois" });
  if (dois.length > MAX_CHECK) return res.status(400).json({ error: `Check at most ${MAX_CHECK} DOIs at a time.`, code: "too_many" });

  const results: Record<string, ReturnType<typeof integrityFromCrossref>> = {};
  const queue = [...dois];
  const worker = async () => {
    for (let doi = queue.shift(); doi; doi = queue.shift()) {
      const now = new Date().toISOString();
      const cr = await crossref(doi);
      results[doi] = cr.ok ? integrityFromCrossref(cr.message, now) : { status: "unknown", checkedAt: now };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, dois.length) }, worker));
  return res.json({ results });
});
