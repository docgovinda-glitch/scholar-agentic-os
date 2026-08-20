import express from "express";
import { getProjectStore } from "../../src/services/store/projectStore.ts";
import { currentUserId, asyncRoute } from "./project.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";

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

    let matchingClaims: any[] = [];
    if (query.trim().length > 0) {
      const config = getSupabaseRestConfig();
      if (config) {
        const claimsTable = new SupabaseTable(config, "project_claims");
        // Use a wildcard search, but filter to user's projects if possible
        // For simplicity and speed without complex joins in PostgREST, we just search all 
        // claims matching text and then filter by user's known projects.
        const claimsRows = await claimsTable.select(`text=ilike.*${query}*&limit=50`) as any[];
        
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

  app.use("/api/search", router);
}
