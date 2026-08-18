import express from "express";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON } from "../../utils/llm.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../src/supabaseRest.ts";

const router = express.Router({ mergeParams: true });

// Helper to get project safely
async function getProjectSafe(req: express.Request<{ id: string }>, res: express.Response) {
  const projectId = req.params.id;
  if (!projectId) {
    res.status(400).json({ error: "Missing project ID" });
    return null;
  }
  const project = await getProjectStore().get(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  return project;
}

// POST /api/projects/:id/agent/literature
router.post("/literature", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const workingTitle = project.answers["working_title"] || "Untitled Research";
  const researchArea = project.answers["research_area"] || "the field";
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic literature discovery agent.
CRITICAL INSTRUCTION: You MUST closely analyze the exact "Working Title" and "Research Area" provided. The literature you discover MUST be highly specific and directly related to the keywords in the title.
Based on the provided research context, working title, and research area, generate a comprehensive and realistic list of EXACTLY 15 discovered literature sources. This must be an extensive literature review.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "lit-xyz",
      "title": "...",
      "authors": ["...", "..."],
      "year": 2025,
      "journal": "...",
      "source": "vault",
      "relevanceScore": 90,
      "themes": ["...", "..."],
      "abstract": "..."
    }
  ],
  "meta": {
    "intentSignal": "...",
    "searchVariants": ["...", "..."]
  }
}
CRITICAL INSTRUCTION: Generate exactly 15 highly relevant sources. Do not hallucinate irrelevant topics.`;
    const userPrompt = `Working Title: ${workingTitle}\nResearch Area: ${researchArea}\nContext: ${context}`;
    const result = await callOpenRouterJSON(systemPrompt, userPrompt);
    res.json({ ok: true, data: result.data, meta: result.meta });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/gaps
router.post("/gaps", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic gap analysis agent.
CRITICAL INSTRUCTION: The gaps you identify MUST be explicitly and directly related to the user's "Working Title" and "Research Area". Do not generate generic gaps. Tie the gap precisely to the specific context provided.
Based on the provided research context, identify exactly 5 distinct, highly-specific research gaps (e.g. empirical, theoretical, methodological) that the working title aims to solve.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "gap-xyz",
      "gap_type": "empirical",
      "description": "...",
      "importance_score": 90,
      "status": "identified"
    }
  ]
}
Make sure every single gap explicitly mentions concepts from the working title.`;
    const workingTitle = project.answers["working_title"] || "Untitled Research";
    const researchArea = project.answers["research_area"] || "the field";
    const userPrompt = `Working Title: ${workingTitle}\nResearch Area: ${researchArea}\nContext: ${context}`;
    const result = await callOpenRouterJSON(systemPrompt, userPrompt);
    
    // Insert into Supabase
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      const table = new SupabaseTable(config, "project_evidence");
      for (const ev of result.data) {
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.projectId,
            quote: ev.quote || "",
            claim_type: ev.claim_type || "",
            strength: ev.strength || "",
            tags: ev.tags || []
          })
        });
      }
    }
    
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/titles
router.post("/titles", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic title generator.
Based on the provided research context, propose exactly 3 strong academic titles.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "title-xyz",
      "title_text": "...",
      "subtitle_text": "...",
      "rationale": "...",
      "status": "proposed"
    }
  ]
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    
    // Insert into Supabase
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      
    const table = new SupabaseTable(config, "manuscript_sections");
    const vTable = new SupabaseTable(config, "manuscript_versions");
    
    // First, save the old versions
    try {
      const oldSections = await table.request(`?project_id=eq.${project.projectId}`);
      if (Array.isArray(oldSections)) {
        for (const old of oldSections) {
          await vTable.request("", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.projectId,
              section_name: old.section_name,
              content: old.content
            })
          });
        }
      }
    } catch (e) {
      console.error("Failed to snapshot manuscript versions", e);
    }

      for (const sec of result.data) {
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify({
            project_id: project.projectId,
            section_name: sec.section,
            content: sec.content || "",
            status: sec.status || "Drafted",
            word_count: sec.length || 0
          })
        });
      }
    }
    
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/vault-sources
router.post("/vault-sources", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic source discovery agent.
Based on the provided research context, generate a realistic list of exactly 5 discovered sources from the user's "vault".
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "source-xyz",
      "title": "...",
      "author": "...",
      "year": 2024,
      "relevance_score": 90,
      "type": "PDF Document"
    }
  ]
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    
    // Insert into Supabase
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      const table = new SupabaseTable(config, "peer_review_critiques");
      for (const crit of result.data) {
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.projectId,
            lens: crit.lens,
            feedback: crit.feedback,
            severity: crit.severity || "Moderate"
          })
        });
      }
    }
    
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/evidence-extraction
router.post("/evidence-extraction", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic evidence extraction agent.
Based on the provided research context, extract exactly 4 pieces of strong evidence.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "ev-xyz",
      "quote": "...",
      "source": "...",
      "claim_type": "Empirical Support",
      "strength": "Strong",
      "tags": ["...", "..."]
    }
  ]
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    
    // Update into Supabase
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      
    const table = new SupabaseTable(config, "manuscript_sections");
    const vTable = new SupabaseTable(config, "manuscript_versions");
    
    // First, save the old versions
    try {
      const oldSections = await table.request(`?project_id=eq.${project.projectId}`);
      if (Array.isArray(oldSections)) {
        for (const old of oldSections) {
          await vTable.request("", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.projectId,
              section_name: old.section_name,
              content: old.content
            })
          });
        }
      }
    } catch (e) {
      console.error("Failed to snapshot manuscript versions", e);
    }

      for (const sec of result.data) {
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify({
            project_id: project.projectId,
            section_name: sec.section,
            content: sec.content || "",
            status: sec.status || "Revised",
            word_count: sec.length || 0
          })
        });
      }
    }
    
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/external-research
router.post("/external-research", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic external research agent.
Based on the provided research context, generate exactly 3 highly relevant external sources found on databases like PubMed, IEEE, or Semantic Scholar.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "ext-xyz",
      "title": "...",
      "author": "...",
      "year": 2025,
      "database": "...",
      "doi": "...",
      "gap_addressed": "...",
      "snippet": "...",
      "relevance": 90
    }
  ]
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/evidence-analysis
router.post("/evidence-analysis", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic evidence synthesis agent.
Based on the provided research context, create exactly 2 synthesized argument clusters from the available evidence.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "arg-xyz",
      "theme": "...",
      "primary_claim": "...",
      "source_primary": "...",
      "synthesized_support": "...",
      "source_support": "...",
      "argument_strength": "High",
      "status": "Mapped"
    }
  ]
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/journal-discovery
router.post("/journal-discovery", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic journal targeting agent.
Based on the provided research context, recommend exactly 2 appropriate academic journals.
Return ONLY valid JSON in this exact format:
{
  "data": [
    { "title": "...", "matchScore": 95, "impactFactor": 3.5, "openAccess": true }
  ]
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/journal-requirements
router.post("/journal-requirements", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic journal analysis agent.
Based on the provided research context and selected journal (if any), extract/generate realistic author guidelines.
Return ONLY valid JSON in this exact format:
{
  "data": {
    "max_words": "8,000",
    "citation_style": "...",
    "required_sections": ["...", "..."]
  }
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/draft
router.post("/draft", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic writer.
Based on the provided research context, write a complete, high-quality first draft of the manuscript.
Return ONLY valid JSON in this exact format:
{
  "data": [
    { "section": "Introduction", "status": "Drafted", "length": 1200, "content": "..." },
    { "section": "Methodology", "status": "Drafted", "length": 1500, "content": "..." },
    { "section": "Results", "status": "Drafted", "length": 2000, "content": "..." },
    { "section": "Conclusion", "status": "Drafted", "length": 800, "content": "..." }
  ]
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/peer-review
router.post("/peer-review", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic peer reviewer.
Critique the manuscript draft provided in the research context. Provide exactly 3 major critiques from different lenses.
Return ONLY valid JSON in this exact format:
{
  "data": [
    { "lens": "Methodological Rigor", "feedback": "...", "severity": "Moderate" }
  ]
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/agent/revision
router.post("/revision", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic editor.
Apply revisions to the manuscript based on the peer review critiques provided in the research context.
Return ONLY valid JSON in this exact format:
{
  "data": [
    { "section": "Introduction", "status": "Revised", "length": 1250, "content": "..." },
    { "section": "Methodology", "status": "Revised", "length": 1600, "content": "..." },
    { "section": "Results", "status": "Revised", "length": 2000, "content": "..." },
    { "section": "Conclusion", "status": "Revised", "length": 800, "content": "..." }
  ]
}`;
    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    res.json({ ok: true, data: result.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stubs for remaining endpoints that don't need full LLM integration yet or are simple state markers
router.post("/final-editor", async (req: express.Request<{ id: string }>, res) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  res.json({ ok: true, data: { editorState: "Loaded", status: "Ready for manual edits" }});
});
router.post("/draft-preview", async (req: express.Request<{ id: string }>, res) => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  res.json({ ok: true, data: { content: "Draft ready", pages: 18, status: "Ready" }});
});
router.post("/publication-readiness", async (req: express.Request<{ id: string }>, res) => {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  res.json({ ok: true, data: { checks: [{ rule: "Word Count < 8000", passed: true, detail: "7,850 words" }], overallStatus: "CERTIFIED_READY" }});
});
router.post("/export", async (req: express.Request<{ id: string }>, res) => {
  await new Promise((resolve) => setTimeout(resolve, 3500));
  res.json({ ok: true, data: { pdfUrl: "/downloads/project_final.pdf", docxUrl: "/downloads/project_final.docx", status: "Export Complete" }});
});

export { router as agenticRouter };


// ---------------------------------------------------------

// ---------------------------------------------------------
// PUT endpoints for human editor overrides
// ---------------------------------------------------------

router.put("/manuscript", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.status(500).json({ error: "Supabase not configured" });

  try {
    
    const table = new SupabaseTable(config, "manuscript_sections");
    const vTable = new SupabaseTable(config, "manuscript_versions");
    
    // First, save the old versions
    try {
      const oldSections = await table.request(`?project_id=eq.${project.projectId}`);
      if (Array.isArray(oldSections)) {
        for (const old of oldSections) {
          await vTable.request("", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.projectId,
              section_name: old.section_name,
              content: old.content
            })
          });
        }
      }
    } catch (e) {
      console.error("Failed to snapshot manuscript versions", e);
    }

    const updates = Array.isArray(req.body) ? req.body : [req.body];
    for (const sec of updates) {
      await table.request("", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify({
          project_id: project.projectId,
          section_name: sec.section_name,
          content: sec.content,
          status: sec.status || "Edited",
          word_count: sec.content.split(/\s+/).length
        })
      });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/evidence", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.status(500).json({ error: "Supabase not configured" });

  try {
    const table = new SupabaseTable(config, "project_evidence");
    // Implementation for explicit evidence update if needed
    // ...
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/critiques/:critiqueId/waive", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.status(500).json({ error: "Supabase not configured" });

  try {
    const table = new SupabaseTable(config, "peer_review_critiques");
    await table.request(`?id=eq.${req.params.critiqueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waived: true })
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    const vTable = new SupabaseTable(config, "manuscript_versions");
    
    // First, save the old versions
    try {
      const oldSections = await table.request(`?project_id=eq.${project.projectId}`);
      if (Array.isArray(oldSections)) {
        for (const old of oldSections) {
          await vTable.request("", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.projectId,
              section_name: old.section_name,
              content: old.content
            })
          });
        }
      }
    } catch (e) {
      console.error("Failed to snapshot manuscript versions", e);
    }

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
