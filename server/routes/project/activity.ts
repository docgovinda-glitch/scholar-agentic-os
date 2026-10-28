import express from "express";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../src/supabaseRest.ts";
import { loadOwnedProject } from "./core/projectHelpers.ts";

export const activityRouter = express.Router({ mergeParams: true });

activityRouter.get("/", async (req: express.Request<{ id: string }>, res) => {
  const projectId = req.params.id;
  const store = getProjectStore();
  const project = await loadOwnedProject(store, req, res);
  if (!project) return;

  const config = getSupabaseRestConfig();
  if (config) {
    try {
      const table = new SupabaseTable(config, "project_activity");
      const data = await table.request(`?project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc`, { method: "GET" });
      return res.json({ data });
    } catch (err) {
      console.error("Failed to fetch activity:", err);
      // Fallback for tests or local dev without PG
      return res.json({ data: [] });
    }
  }

  // Fallback
  res.json({ data: [] });
});
