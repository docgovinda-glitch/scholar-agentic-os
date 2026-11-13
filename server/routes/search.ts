import express, { type Response } from "express";
import { z } from "zod";
import { getProjectStore } from "../../src/services/store/projectStore.ts";
import { currentUserId, asyncRoute } from "./project.ts";
import { requireAuth } from "../src/middleware/auth.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";

interface ClaimRow {
  claim_id: string;
  project_id: string;
  text: string;
}

export function registerSearchRoutes(app: express.Application) {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/", asyncRoute(async (req, res) => {
    const query = (req.query.q as string || "").toLowerCase();
    
    // Search projects
    const store = getProjectStore();
    const projects = await store.listByOwner(currentUserId(req));
    
    const matchingProjects = projects.filter(p => {
      const title = p.answers["working_title"] || p.answers["title"] || "";
      const area = p.answers["research_area"] || "";
      return title.toLowerCase().includes(query) || area.toLowerCase().includes(query);
    });

    let matchingClaims: Array<{ id: string; title: string; type: string }> = [];
    if (query.trim().length > 0 && projects.length > 0) {
      const config = getSupabaseRestConfig();
      if (config) {
        const claimsTable = new SupabaseTable(config, "project_claims");
        const encodedQuery = encodeURIComponent(query.trim());
        const userProjectIds = projects.map(p => p.projectId);
        const inList = userProjectIds.map(id => encodeURIComponent(id)).join(",");
        const claimsRows = (await claimsTable.select(
          `project_id=in.(${inList})&text=ilike.*${encodedQuery}*&limit=50`
        )) as unknown as ClaimRow[];
        
        const userProjectIdSet = new Set(userProjectIds);
        matchingClaims = claimsRows
          .filter(r => userProjectIdSet.has(r.project_id))
          .map(r => ({
            id: r.claim_id,
            title: r.text.length > 80 ? r.text.substring(0, 80) + "..." : r.text,
            type: "claim"
          }));
      }
    }

    res.json({
      projects: matchingProjects.map(p => ({
        id: p.projectId,
        title: p.answers["working_title"] || p.answers["title"] || "Untitled",
        type: "project"
      })),
      vaultSources: [],
      claims: matchingClaims
    });
  }));

  // Live web + scholarly retrieval: the one RetrievalService used by AskScholar and every workspace.
  const liveSearchBody = z.object({
    query: z.string().trim().min(1).max(2000),
    limit: z.coerce.number().int().min(1).max(120).optional(),
    candidateBudget: z.coerce.number().int().min(1).max(600).optional(),
    discipline: z.string().max(40).optional(),
    mode: z.enum(["all", "scholarly", "web", "deep_research"]).optional(),
  });

  const runLiveSearch = async (input: unknown, res: Response) => {
    const parsed = liveSearchBody.safeParse(input);
    if (!parsed.success) {
      return res.status(400).json({ error: "A non-empty query is required." });
    }
    try {
      const { retrieveSources } = await import("../src/retrieval/retrievalService.ts");
      const out = await retrieveSources(parsed.data);
      res.json({
        success: true,
        count: out.results.length,
        searchedCount: out.searchedCount,
        results: out.results,
        queriesExecuted: out.queriesExecuted,
        providers: out.providers,
        complexity: out.complexity,
        discipline: out.discipline,
        retrievedAt: out.retrievedAt,
      });
    } catch (err) {
      res.status(502).json({ error: `Live search failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  router.post("/live", asyncRoute(async (req, res) => runLiveSearch(req.body, res)));
  router.get("/live", asyncRoute(async (req, res) =>
    runLiveSearch({ query: req.query.q, limit: req.query.limit, mode: req.query.mode, discipline: req.query.discipline }, res)
  ));

  // Multi-Portal Scholarly Harvester Route (harvests across OpenAlex, CrossRef, DOAJ, DataCite, arXiv)
  router.post("/multi-portal", asyncRoute(async (req, res) => {
    const { query, workingTitle, researchArea, maxResults = 50 } = req.body || {};
    const effectiveQuery = (query || workingTitle || researchArea || "").trim();
    if (!effectiveQuery) {
      return res.status(400).json({ error: "Missing required search query or working title" });
    }

    try {
      const { discoverMultiPortalSources } = await import("../src/discovery/discovery.ts");
      const drafts = await discoverMultiPortalSources(effectiveQuery, Math.max(50, Number(maxResults) || 50));
      res.json({ success: true, count: drafts.length, sources: drafts });
    } catch (err) {
      res.status(502).json({ error: `Multi-portal discovery failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }));

  app.use("/api/search", router);
  app.use("/api/discovery", router);
}


