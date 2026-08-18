import re

with open("server/routes/project/agentic.ts", "r") as f:
    content = f.read()

# Add imports
content = content.replace(
    'import { callOpenRouterJSON } from "../../utils/llm.ts";',
    'import { callOpenRouterJSON } from "../../utils/llm.ts";\nimport { getSupabaseRestConfig, SupabaseTable } from "../../../src/supabaseRest.ts";'
)

new_content = content + """

// ---------------------------------------------------------
// GET endpoints for fetching relational data
// ---------------------------------------------------------

router.get("/manuscript", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.json({ ok: true, data: [] });
  try {
    const table = new SupabaseTable(config, "manuscript_sections");
    const data = await table.request(`?project_id=eq.${project.projectId}`);
    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/evidence", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.json({ ok: true, data: [] });
  try {
    const table = new SupabaseTable(config, "project_evidence");
    const data = await table.request(`?project_id=eq.${project.projectId}`);
    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/critiques", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.json({ ok: true, data: [] });
  try {
    const table = new SupabaseTable(config, "peer_review_critiques");
    const data = await table.request(`?project_id=eq.${project.projectId}`);
    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
"""

with open("server/routes/project/agentic.ts", "w") as f:
    f.write(new_content)

print("Updated agentic.ts with GET endpoints and imports.")
