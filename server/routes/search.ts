import express from "express";
import { getProjectStore } from "../../src/services/store/projectStore.ts";
import { currentUserId, asyncRoute } from "./project.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";

interface ClaimRow {
  claim_id: string;
  project_id: string;
  text: string;
}

export function registerSearchRoutes(app: express.Application) {
  const router = express.Router();

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
    if (query.trim().length > 0) {
      const config = getSupabaseRestConfig();
      if (config) {
        const claimsTable = new SupabaseTable(config, "project_claims");
        // Use a wildcard search, but filter to user's projects if possible
        // For simplicity and speed without complex joins in PostgREST, we just search all 
        // claims matching text and then filter by user's known projects.
        const claimsRows = (await claimsTable.select(`text=ilike.*${query}*&limit=50`)) as unknown as ClaimRow[];
        
        const userProjectIds = new Set(projects.map(p => p.projectId));
        matchingClaims = claimsRows
          .filter(r => userProjectIds.has(r.project_id))
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

  // Live Web & Scholarly Search Route (OpenAlex, Crossref, Wikipedia, Proxy)
  router.post("/live", asyncRoute(async (req, res) => {
    const { query, limit = 5, mode = "all" } = req.body || {};
    const effectiveQuery = typeof query === "string" ? query.trim() : "";
    if (!effectiveQuery) {
      return res.status(400).json({ error: "Missing required query parameter" });
    }

    try {
      const { executeLiveSearch } = await import("../src/discovery/liveSearch.ts");
      const results = await executeLiveSearch(effectiveQuery, {
        limit: Number(limit) || 5,
        mode: mode === "scholarly" || mode === "web" ? mode : "all",
      });
      res.json({ success: true, count: results.length, results });
    } catch (err) {
      res.status(502).json({ error: `Live search failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }));

  router.get("/live", asyncRoute(async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Number(req.query.limit) || 5;
    const mode = req.query.mode === "scholarly" || req.query.mode === "web" ? req.query.mode : "all";

    if (!query) {
      return res.status(400).json({ error: "Missing required q query parameter" });
    }

    try {
      const { executeLiveSearch } = await import("../src/discovery/liveSearch.ts");
      const results = await executeLiveSearch(query, { limit, mode });
      res.json({ success: true, count: results.length, results });
    } catch (err) {
      res.status(502).json({ error: `Live search failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }));

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


