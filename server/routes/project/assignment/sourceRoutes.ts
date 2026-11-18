/**
 * POST /api/projects/:id/assignment/sources/search
 *   { queries?, topic?, limit?, includePrescribed? }
 *
 * Coursework's source search, on the shared retrieval pipeline
 * (`retrieveSources`, which calls the shared providers): one request instead
 * of the browser's per-phrase calls to the old multi-portal route and its
 * direct-to-provider fallback.
 *
 * - Search phrases: the ones sent, else a topic, else the AI plan's search
 *   queries and clean phrases from the brief; each carries the brief's
 *   subject word.
 * - One record per work (shared identity rules), the most complete kept.
 * - Off-topic records (no subject word) are dropped; relevance is the measured
 *   0-100 overlap, not rescaled.
 * - Verification from the citation engine; records it cannot cite are
 *   returned flagged ("metadata_incomplete") for the "Needs checking" group.
 * - With `includePrescribed`, references the brief names come first.
 * Saves nothing (the browser merges into the list with mergeSearchResults)
 * and approves nothing.
 */
import express from "express";
import { z } from "zod";
import { retrieveSources } from "../../../src/retrieval/retrievalService.ts";
import { searchCrossref, searchOpenAlex } from "../../../../src/shared/retrieval/providers.ts";
import { dedupeWorks, workKeys } from "../../../../src/shared/retrieval/identity.ts";
import { prescribedFromBrief, relevanceOf, toDiscoveredSource, type FoundRecord, type SearchContext } from "../../../../src/domain/assignment/sourceSearch.ts";
import { anchorQueries, briefDomainTerms, buildSourceSearchQueries } from "../../../../src/utils/briefSourceQueries.ts";
import { parseBriefQuestions } from "../../../../src/utils/briefQuestions.ts";
import { DEFAULT_CITATION_STYLE } from "../../../../src/domain/assignment/answerKeys.ts";
import { cleanAnswerString, extractStandardizedInstructions, type DiscoveredSource } from "../../../../src/desk/assignment/types.ts";
import { abortOnClose, getProjectSafe, safeParseObject } from "./helpers.ts";
import { parseBody } from "./schemas.ts";

const router = express.Router({ mergeParams: true });

const SearchBody = z.object({
  queries: z.array(z.string().trim().min(2).max(200)).max(5).optional(),
  topic: z.string().trim().min(2).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  includePrescribed: z.boolean().default(false),
});

const providerOpts = (signal: AbortSignal) => ({ signal, timeoutMs: 12_000, mailto: process.env.OPENALEX_MAILTO, openAlexApiKey: process.env.OPENALEX_API_KEY });

router.post("/sources/search", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = parseBody(SearchBody, req, res);
  if (!body) return;
  const a = project.answers as Record<string, unknown>;
  const brief = cleanAnswerString(a["assignment_brief"]) || extractStandardizedInstructions(a);
  if (!brief || brief.trim().length < 10) {
    return res.status(400).json({ error: "Add your assignment brief first, so the search is about your assignment.", code: "missing_brief" });
  }
  const citationStyle = cleanAnswerString(a["citation_style"]) || DEFAULT_CITATION_STYLE;
  const subject = body.topic || brief;
  const domainTerms = briefDomainTerms(subject);
  const planned = (safeParseObject<{ searchQueries?: string[] }>(a["assignment_understanding"])?.searchQueries ?? []).filter((q) => typeof q === "string" && q.trim());
  const candidates = body.queries?.length ? body.queries : body.topic ? [body.topic] : [...planned, ...buildSourceSearchQueries(brief, 5)];
  const unique = [...new Map(candidates.map((q) => [q.toLowerCase().trim(), q.trim()])).values()].slice(0, 4);
  const queries = anchorQueries(unique, domainTerms);
  if (queries.length === 0) return res.json({ sources: [], queries: [], searched: 0, providers: [] });

  const signal = abortOnClose(req);
  const perQuery = Math.min(40, Math.max(10, Math.ceil((body.limit * 2) / queries.length)));
  const settled = await Promise.allSettled(queries.map((query) => retrieveSources({ query, mode: "scholarly", limit: perQuery, candidateBudget: perQuery * 2, signal })));
  if (signal.aborted) return;
  const records: FoundRecord[] = [];
  let searched = 0;
  const providers = new Map<string, { provider: string; count: number; error?: string }>();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    searched += r.value.searchedCount;
    for (const p of r.value.providers) {
      const prev = providers.get(p.provider);
      providers.set(p.provider, { provider: p.provider, count: (prev?.count ?? 0) + p.count, error: prev?.error ?? p.error });
    }
    for (const item of r.value.results) records.push({ ...item, authors: item.authors, year: item.year, provider: item.provider });
  }

  const ctx: SearchContext = { queries, domainTerms, questionRows: parseBriefQuestions(brief) };
  const found = dedupeWorks(records)
    .map((r) => ({ r, relevance: relevanceOf(r, ctx) }))
    .filter((x) => x.relevance > 0)
    .sort((x, y) => y.relevance - x.relevance)
    .slice(0, body.limit)
    .map((x) => toDiscoveredSource(x.r, ctx, citationStyle, x.relevance));

  let sources: DiscoveredSource[] = found;
  if (body.includePrescribed) {
    const lookup = async (q: string): Promise<FoundRecord[]> => {
      const [cr, oa] = await Promise.allSettled([searchCrossref(q, 8, 1, providerOpts(signal)), searchOpenAlex(q, 8, 1, providerOpts(signal))]);
      return [cr, oa].flatMap((x) => (x.status === "fulfilled" ? x.value.items : [])) as FoundRecord[];
    };
    const prescribed = await prescribedFromBrief(brief, ctx, citationStyle, lookup);
    const named = new Set(prescribed.flatMap((p) => workKeys(p)));
    sources = [...prescribed, ...found.filter((s) => !workKeys(s).some((k) => named.has(k)))];
  }
  if (signal.aborted) return;
  res.json({ sources, queries, searched, providers: [...providers.values()] });
});

export default router;
