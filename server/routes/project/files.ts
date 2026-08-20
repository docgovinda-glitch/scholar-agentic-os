import express from "express";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../src/supabaseRest.ts";

export const filesRouter = express.Router({ mergeParams: true });

filesRouter.get("/", async (req: express.Request<{ id: string }>, res) => {
  const projectId = req.params.id;
  const store = getProjectStore();
  const project = await store.get(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const config = getSupabaseRestConfig();
  if (config) {
    try {
      const table = new SupabaseTable(config, "project_files");
      const data = await table.request(`?project_id=eq.${projectId}&order=uploaded_at.desc`, { method: "GET" });
      return res.json({ data });
    } catch (err) {
      console.error("Failed to fetch files:", err);
      return res.json({ data: [] });
    }
  }

  res.json({ data: [] });
});
