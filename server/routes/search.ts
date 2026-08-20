import express from "express";
import { getProjectStore } from "../../src/services/store/projectStore.ts";

export function registerSearchRoutes(app: express.Application) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const query = (req.query.q as string || "").toLowerCase();
    
    // Search projects
    const store = getProjectStore();
    const projects = await store.list();
    
    const matchingProjects = projects.filter(p => {
      const title = p.answers["working_title"] || p.answers["title"] || "";
      const area = p.answers["research_area"] || "";
      return title.toLowerCase().includes(query) || area.toLowerCase().includes(query);
    });

    res.json({
      projects: matchingProjects.map(p => ({
        id: p.projectId,
        title: p.answers["working_title"] || p.answers["title"] || "Untitled",
        type: "project"
      })),
      vaultSources: [],
      claims: []
    });
  });

  app.use("/api/search", router);
}
