import express from "express";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { getProjectSafe, executeScholarBrainJSON } from "./types.ts";

export function registerProtocolHandlers(router: express.Router): void {
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
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt,
          taskType: "discovery",
        }
      );

      if (result) {
        if (result.data && Array.isArray(result.data)) {
          const currentListStr = project.answers["discovered_literature"];
          let existingItems: Record<string, unknown>[] = [];
          if (currentListStr) {
            try { existingItems = JSON.parse(currentListStr); } catch (_) {}
          }
          const existingDois = new Set(existingItems.map((i: Record<string, unknown>) => ((i.doi as string) || "").toLowerCase()).filter(Boolean));
          const existingIds = new Set(existingItems.map((i: Record<string, unknown>) => i.id as string).filter(Boolean));
          const newItems = (result.data as Record<string, unknown>[]).filter((i: Record<string, unknown>) => {
            if (i.doi && existingDois.has(((i.doi as string) || "").toLowerCase())) return false;
            if (i.id && existingIds.has(i.id as string)) return false;
            return true;
          });
          const combined = isBroadened ? [...existingItems, ...newItems] : (existingItems.length > 0 && req.body.isAppend ? [...existingItems, ...newItems] : result.data);
          const nextAnswers = { ...project.answers, discovered_literature: JSON.stringify(combined), current_stage: "literature" };
          await getProjectStore().save({ ...project, answers: nextAnswers });
        }
        res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data, meta: result.meta })}\n\n`);
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RequireFrontendLLMException") return;
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
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
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[] }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt,
          taskType: "discovery",
        }
      );
      if (!result) return;
      
      if (result.data && Array.isArray(result.data)) {
        const nextAnswers = { ...project.answers, identified_gaps: JSON.stringify(result.data), current_stage: "gap_identification" };
        await getProjectStore().save({ ...project, answers: nextAnswers });
      }
      
      res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RequireFrontendLLMException") return;
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
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
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[] }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt: `Context: ${context}`,
          taskType: "discovery",
        }
      );
      if (!result) return;
      
      if (result.data && Array.isArray(result.data)) {
        const nextAnswers = { ...project.answers, generated_titles: JSON.stringify(result.data), current_stage: "title_selection" };
        await getProjectStore().save({ ...project, answers: nextAnswers });
      }
      
      res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RequireFrontendLLMException") return;
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
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
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[] }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt: `Context: ${context}`,
          taskType: "discovery",
        }
      );
      if (!result) return;
      res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RequireFrontendLLMException") return;
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
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
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown> }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt: `Context: ${context}`,
          taskType: "discovery",
        }
      );
      if (!result) return;
      res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RequireFrontendLLMException") return;
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
        res.end();
      }
    }
  });
}
