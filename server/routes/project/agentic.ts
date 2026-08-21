import express from "express";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText, streamOpenRouterJSON, streamOpenRouterText } from "../../utils/llm.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../src/supabaseRest.ts";

const router = express.Router({ mergeParams: true });

// Helper to get project safely
async function getProjectSafe(req: express.Request<any>, res: express.Response) {
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

  const { isBroadened, excludeIds = [], excludeDois = [], excludeTitles = [] } = req.body || {};
  const workingTitle = project.answers["working_title"] || "Untitled Research";
  const researchArea = project.answers["research_area"] || "the field";
  const context = JSON.stringify(project.answers);

  try {
    const exclusionText = (excludeDois.length > 0 || excludeIds.length > 0 || excludeTitles.length > 0)
      ? `\nCRITICAL EXCLUSION LIST: The following DOIs, IDs, and titles have already been discovered or were removed by the researcher. You MUST NOT include them or close duplicates:\n- Excluded DOIs/IDs: ${[...excludeDois, ...excludeIds].filter(Boolean).join(", ") || "None"}\n- Excluded Titles: ${excludeTitles.filter(Boolean).slice(0, 30).join(" | ") || "None"}`
      : "";

    const systemPrompt = isBroadened
      ? `You are an expert academic literature discovery and interdisciplinary research agent.
CRITICAL INSTRUCTION: The researcher has requested to BROADEN the literature search beyond the initial scope.
1. Broaden your search strategy to cover BOTH:
   - The primary research field ("${researchArea}") using expanded terminology, sub-disciplines, and synonyms.
   - Closely related, adjacent, and interdisciplinary fields that offer foundational theories, comparative findings, or analogous methodologies.
2. Generate an extensive set of EXACTLY 15 newly discovered, high-impact scholarly sources.${exclusionText}
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "lit-xyz",
      "doi": "10.1000/xyz123",
      "title": "...",
      "authors": ["...", "..."],
      "year": 2025,
      "journal": "...",
      "source": "external",
      "relevanceScore": 90,
      "themes": ["...", "..."],
      "abstract": "..."
    }
  ],
  "meta": {
    "intentSignal": "broadened_interdisciplinary_search",
    "searchVariants": ["...", "..."]
  }
}`
      : `You are an expert academic literature discovery agent.
CRITICAL INSTRUCTION: You MUST closely analyze the exact "Working Title" and "Research Area" provided. The literature you discover MUST be highly specific and directly related to the keywords in the title.${exclusionText}
Based on the provided research context, working title, and research area, generate a comprehensive and realistic list of EXACTLY 15 discovered literature sources. This must be an extensive literature review.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "lit-xyz",
      "doi": "10.1000/xyz123",
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
    "intentSignal": "primary_literature_discovery",
    "searchVariants": ["...", "..."]
  }
}
CRITICAL INSTRUCTION: Generate exactly 15 highly relevant sources. Do not hallucinate irrelevant topics.`;

    const userPrompt = `Working Title: ${workingTitle}\nResearch Area: ${researchArea}\nContext: ${context}${isBroadened ? "\nMode: Broadened & Interdisciplinary Discovery" : ""}`;
    const result = await streamOpenRouterJSON(req, res, systemPrompt, userPrompt, "openrouter/auto", "discovery");
    if (result) {
      res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data, meta: result.meta })}\n\n`);
      res.end();
    }
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      res.end();
    }
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, userPrompt, "openrouter/auto", "discovery");
    if (!result) return;
    
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
    
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`, "openrouter/auto", "discovery");
    if (!result) return;
    
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
    
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`);
    if (!result) return;
    
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
    
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
    let ragContext = "";
    try {
      const { generateGeminiEmbedding } = await import("../../utils/llm.js");
      const query = project.answers["core_problem"] || project.answers["working_title"] || "academic evidence extraction";
      const embedding = await generateGeminiEmbedding(query);
      
      const config = getSupabaseRestConfig();
      if (config) {
        const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/match_project_evidence`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": config.serviceRoleKey,
            "Authorization": `Bearer ${config.serviceRoleKey}`
          },
          body: JSON.stringify({
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: 5,
            p_id: project.projectId
          })
        });
        if (response.ok) {
          const matches = await response.json();
          if (Array.isArray(matches) && matches.length > 0) {
            ragContext = matches.map((m: any) => `Source: ${m.source || "Unknown"}\nQuote: ${m.quote}`).join("\n\n---\n\n");
          }
        }
      }
    } catch (e) {
      console.error("Vectorized RAG failed, falling back to full context", e);
    }

    const finalContext = ragContext ? `Top Matched Vault Sources:\n\n${ragContext}` : `Context: ${context}`;
    const result = await streamOpenRouterJSON(req, res, systemPrompt, finalContext);
    if (!result) return;
    
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
    
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`);
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`);
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`);
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/journal-requirements
router.post("/journal-requirements", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic journal analysis agent.
Your goal is to perform Rubric Distillation. Distill the massive, verbose author guidelines into a dense, strict JSON ruleset. This will strip out thousands of words of fluff and save tokens in future compliance checks.
Return ONLY valid JSON in this exact format:
{
  "data": {
    "max_words": "8000",
    "citation_style": "APA 7th Edition",
    "required_sections": ["Introduction", "Methods", "Results", "Discussion", "Conclusion"],
    "formatting_rules": ["Double spaced", "12pt Times New Roman"]
  }
}`;
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`, "openrouter/auto", "discovery");
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/draft
router.post("/draft", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  const chapterId = req.body.chapterId;
  const targetChapterMsg = chapterId ? `\nTarget ONLY the chapter with key "${chapterId}".` : "";

  try {
    const systemPrompt = `You are an expert academic writer.
Based on the provided research context, write a complete, high-quality first draft of the manuscript.${targetChapterMsg}
Return ONLY valid JSON in this exact format:
{
  "data": [
    { "section": "Introduction", "status": "Drafted", "length": 1200, "content": "..." },
    { "section": "Methodology", "status": "Drafted", "length": 1500, "content": "..." },
    { "section": "Results", "status": "Drafted", "length": 2000, "content": "..." },
    { "section": "Conclusion", "status": "Drafted", "length": 800, "content": "..." }
  ]
}`;
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}\nChapter ID to target: ${chapterId || "all"}`, "openrouter/auto", "long-context");
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`, "openrouter/auto", "long-context");
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
Instead of rewriting the entire manuscript, you MUST output a JSON array of exact text replacements (patches). This saves output tokens and processing time.
Return ONLY valid JSON in this exact format:
{
  "data": [
    { "section": "Introduction", "find": "exact old sentence or paragraph to replace", "replace": "the new revised text" },
    { "section": "Methodology", "find": "exact old sentence or paragraph to replace", "replace": "the new revised text" }
  ]
}`;
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`, "openrouter/auto", "reasoning");
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/citation-audit
router.post("/citation-audit", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic citation auditor.
Audit the citations in the provided research context, ensuring claims are backed by the provided vault sources.
Identify 5 specific claims and determine if they are verified or flagged.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "cit-xyz",
      "claim": "...",
      "source": "...",
      "status": "verified"
    }
  ]
}
Use 'verified' or 'flagged' for the status.`;
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`);
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/originality-check
router.post("/originality-check", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic originality checker.
Check the manuscript drafts in the context for potential plagiarism, structural overlap, or cliché phrasing.
Calculate an overall originality score (0-100) and flag up to 3 specific sections if needed.
Return ONLY valid JSON in this exact format:
{
  "data": {
    "score": 94,
    "flags": [
      {
        "id": "flag-xyz",
        "section": "Introduction",
        "issue": "Structural overlap",
        "snippet": "...",
        "suggestion": "..."
      }
    ]
  }
}`;
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`);
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});

// Stubs for remaining endpoints that don't need full LLM integration yet or are simple state markers
router.post("/final-editor", async (req: express.Request<{ id: string }>, res) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  res.json({ ok: true, data: { editorState: "Loaded", status: "Ready for manual edits" }});
});
router.post("/draft-preview", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.status(500).json({ error: "Supabase not configured" });

  try {
    const table = new SupabaseTable(config, "manuscript_sections");
    const data = await table.request(`?project_id=eq.${project.projectId}`);
    
    let content = "Draft not generated yet.";
    let pages = 0;
    if (Array.isArray(data) && data.length > 0) {
      content = data.map(s => `## ${s.section_name}\n\n${s.content}`).join("\n\n");
      pages = Math.ceil(content.split(/\s+/).length / 250); // ~250 words per page
    }
    
    res.json({ ok: true, data: { content, pages, status: "Ready" }});
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});
router.post("/publication-readiness", async (req: express.Request<{ id: string }>, res) => {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  res.json({ ok: true, data: { checks: [{ rule: "Word Count < 8000", passed: true, detail: "7,850 words" }], overallStatus: "CERTIFIED_READY" }});
});
router.post("/export", async (req: express.Request<{ id: string }>, res) => {
  await new Promise((resolve) => setTimeout(resolve, 3500));
  res.json({ ok: true, data: { pdfUrl: "/downloads/project_final.pdf", docxUrl: "/downloads/project_final.docx", status: "Export Complete" }});
});

// POST /api/projects/:id/agent/copilot-chat
router.post("/copilot-chat", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  
  const { stage, message, history = [] } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  // 1. Stage-Scoped Context Engine
  let scopedContext: Record<string, any> = {};
  
  if (stage === "definition" || stage === "literature" || stage === "gap_identification" || stage === "gap_selection" || stage === "title_selection" || stage === "title_lock") {
    // Early stages: only need answers
    scopedContext = {
      core_problem: project.answers["core_problem"],
      literature_review: project.answers["literature_review"],
      gap_identified: project.answers["gap_identified"],
      gap_selected: project.answers["gap_selected"],
      working_title: project.answers["working_title"] || project.answers["title"]
    };
  } else if (stage === "vault_sources" || stage === "source_approval_vault" || stage === "evidence_extraction" || stage === "external_research" || stage === "evidence_analysis" || stage === "manual_review") {
    // Evidence stages: include claim graph, but omit massive document
    scopedContext = {
      working_title: project.answers["working_title"] || project.answers["title"],
      claim_graph: project.claimGraph,
      evidence_ledger: project.evidenceLedger
    };
  } else {
    // Late stages (Drafting, Editing, Publishing): include document structure/abstract, but maybe omit full heavy manuscript body to save tokens, or include it if strictly needed.
    scopedContext = {
      working_title: project.answers["working_title"] || project.answers["title"],
      document_structure: project.document ? "Blocks count: " + project.document.blocks.length : "None yet",
      rubric_report: project.rubricReport ? { readyForG6: project.rubricReport.readyForG6, summary: "Truncated for context" } : null
    };
  }

  try {
    const systemPrompt = `You are a helpful AI Copilot integrated into a research workspace. 
The user is currently on the stage: "${stage}".
Here is the context of their project for this stage:
${JSON.stringify(scopedContext)}

Answer the user's question concisely. Be highly academic and professional. Use markdown formatting.`;

    // Construct the user prompt including history
    let userPrompt = "";
    if (history.length > 0) {
      userPrompt += "Conversation History:\n";
      for (const msg of history) {
        userPrompt += `${msg.role === "user" ? "User" : "Copilot"}: ${msg.content}\n`;
      }
      userPrompt += "\nNew Message from User:\n";
    }
    userPrompt += message;

    const result = await streamOpenRouterText(req, res, systemPrompt, userPrompt);
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, response: result })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
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
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
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
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});

// ---------------------------------------------------------
// GET endpoints for fetching relational data
// ---------------------------------------------------------

router.get("/manuscript", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: [] })}\n\n`);
    res.end();
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
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});

router.get("/evidence", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: [] })}\n\n`);
    res.end();
  try {
    const table = new SupabaseTable(config, "project_evidence");
    const data = await table.request(`?project_id=eq.${project.projectId}`);
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});

router.get("/critiques", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();
  if (!config) return res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: [] })}\n\n`);
    res.end();
  try {
    const table = new SupabaseTable(config, "peer_review_critiques");
    const data = await table.request(`?project_id=eq.${project.projectId}`);
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data })}\n\n`);
    res.end();
  } catch (err: any) {
    if (err.message === "RequireFrontendLLMException") return;
        if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error
data: ${JSON.stringify({ message: err.message })}

`);
      res.end();
    }
  }
});
