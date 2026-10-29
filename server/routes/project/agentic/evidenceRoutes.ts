import express from "express";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { streamOpenRouterJSON } from "../../../utils/llm.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../../src/supabaseRest.ts";
import { normalizeUnicodeNFC } from "../../../src/utils/scholarlyVoiceGuard.ts";
import { safeParseAnswerField } from "../../../../src/shared/projectStateSchema.ts";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import { getProjectSafe, userUpload } from "./helpers.ts";
import { discoverMultiPortalSources } from "../../../src/discovery/discovery.ts";
import type { UserDatasetRecord } from "./types.ts";

export const evidenceRoutes = express.Router({ mergeParams: true });

// POST /api/projects/:id/agent/literature
evidenceRoutes.post("/literature", async (req: express.Request<{ id: string }>, res) => {
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, userPrompt, undefined, "discovery");
    if (result) {
      if (result.data && Array.isArray(result.data)) {
        interface DiscoveredLitRef {
          id?: string;
          doi?: string;
          [key: string]: unknown;
        }
        const currentListStr = project.answers["discovered_literature"];
        const existingItems = safeParseAnswerField<DiscoveredLitRef[]>(currentListStr, []);
        const existingDois = new Set(existingItems.map((i) => (i.doi || "").toLowerCase()).filter(Boolean));
        const existingIds = new Set(existingItems.map((i) => i.id).filter(Boolean));
        const newItems = (result.data as DiscoveredLitRef[]).filter((i) => {
          if (i.doi && existingDois.has(i.doi.toLowerCase())) return false;
          if (i.id && existingIds.has(i.id)) return false;
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
    if (res.writableEnded) return;
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/gaps
evidenceRoutes.post("/gaps", async (req: express.Request<{ id: string }>, res) => {
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, userPrompt, undefined, "discovery");
    if (!result) return;
    
    if (result.data && Array.isArray(result.data)) {
      const nextAnswers = { ...project.answers, identified_gaps: JSON.stringify(result.data), current_stage: "gap_identification" };
      await getProjectStore().save({ ...project, answers: nextAnswers });
    }
    
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: unknown) {
    if (res.writableEnded) return;
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/titles
evidenceRoutes.post("/titles", async (req: express.Request<{ id: string }>, res) => {
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`, undefined, "discovery");
    if (!result) return;
    
    if (result.data && Array.isArray(result.data)) {
      const nextAnswers = { ...project.answers, generated_titles: JSON.stringify(result.data), current_stage: "title_selection" };
      await getProjectStore().save({ ...project, answers: nextAnswers });
    }
    
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: unknown) {
    if (res.writableEnded) return;
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/vault-sources
evidenceRoutes.post("/vault-sources", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const vaultItems = req.body?.vaultItems || [];
    const vaultContext = vaultItems.length > 0 
        ? `Available Vault Items:\n${JSON.stringify(vaultItems)}`
        : "No vault items available.";

    const systemPrompt = `You are an expert academic source discovery agent.
Based on the provided research context and the user's provided vault items, select up to 5 of the most relevant sources from the vault. DO NOT invent or hallucinate any sources. If no items match, return an empty array.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "source-xyz",
      "title": "...",
      "author": "...",
      "year": 2024,
      "relevance_score": 90,
      "type": "PDF Document",
      "snippet": "..."
    }
  ]
}`;
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}\n\n${vaultContext}`);
    if (!result) return;
    
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      const table = new SupabaseTable(config, "project_sources");
      for (const src of result.data) {
        if (!src || typeof src !== "object") continue;
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.projectId,
            source_id: `src-vault-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            title: src.title || "Untitled Vault Source",
            authors: Array.isArray(src.authors) ? src.authors : [src.author || "Unknown Author"],
            year: typeof src.year === "number" ? src.year : (parseInt(src.year, 10) || new Date().getFullYear()),
            source_type: "vault",
            authority_tier: "Primary",
            discovered_via: "Agentic Vault Search",
            discovered_at: new Date().toISOString(),
            relevance_score: typeof src.relevance_score === "number" ? src.relevance_score : 90,
            themes: Array.isArray(src.themes) ? src.themes : [],
            abstract: src.snippet || src.type || ""
          })
        });
      }
    }
    
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: unknown) {
    if (res.writableEnded) return;
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/evidence-extraction
evidenceRoutes.post("/evidence-extraction", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  try {
    const systemPrompt = `You are an expert academic evidence extraction agent conducting Deep Multi-Dimensional Evidence Extraction.
Analyze the provided research context, approved vault sources, literature corpus, and attached primary datasets.
Extract 12 to 18 deep, highly granular, publication-grade academic evidence claims.
For each source and dataset, perform multi-lens deep extraction across:
1. Empirical Support: Concrete experimental or observational findings with numerical metrics (sample size N, effect size d, p-value, accuracy, throughput, latency).
2. Benchmark Statistic: Quantitative performance comparisons against state-of-the-art baselines.
3. Theoretical Proof: Mathematical formulations, formal proof bounds, or underlying causal mechanisms.
4. Methodological Rationale: Experimental protocol parameters, sampling criteria, testbed setups, or instrumentation controls.
5. Comparative Baseline: Direct baseline comparisons and trade-offs.

Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "ev-xyz",
      "quote": "Direct verbatim excerpt or concrete statistical finding",
      "source": "Author et al. (Year)",
      "claim_type": "Empirical Support",
      "strength": "Strong",
      "tags": ["Tag1", "Tag2"],
      "page_or_loc": "Section 4.1, Table 2",
      "notes": "Deep analytical context and evidentiary implication"
    }
  ]
}`;
    let ragContext = "";
    try {
      const { generateGeminiEmbedding } = await import("../../../utils/llm.ts");
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
            ragContext = (matches as Array<{ source?: string; quote?: string }>).map((m) => `Source: ${m.source || "Unknown"}\nQuote: ${m.quote}`).join("\n\n---\n\n");
          }
        }
      }
    } catch (e) {
      console.error("Vectorized RAG failed, falling back to full context", e);
    }

    const bodySources = req.body?.sources ? `\n\nApproved Authorized Sources:\n${JSON.stringify(req.body.sources, null, 2)}` : "";
    const bodyDatasets = req.body?.datasets ? `\n\nAttached Datasets & Telemetry:\n${JSON.stringify(req.body.datasets, null, 2)}` : "";
    const finalContext = ragContext
      ? `Top Matched Vault Sources:\n\n${ragContext}${bodySources}${bodyDatasets}`
      : `Research Project Context: ${context}${bodySources}${bodyDatasets}`;
    const result = await streamOpenRouterJSON(req, res, systemPrompt, finalContext);
    if (!result) return;
    
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      const table = new SupabaseTable(config, "project_evidence");
      for (const ev of result.data) {
        if (!ev || typeof ev !== "object") continue;
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.projectId,
            quote: ev.quote || "",
            claim_type: ev.claim_type || "Empirical Support",
            strength: ev.strength || "Strong",
            tags: Array.isArray(ev.tags) ? ev.tags : []
          })
        });
      }
    }
    
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: unknown) {
    if (res.writableEnded) return;
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/external-research
evidenceRoutes.post("/external-research", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const query = String(
    req.body?.query || project.answers["core_problem"] || project.answers["working_title"] || ""
  ).trim();
  const anchorGap = req.body?.anchorGap || project.answers["anchor_gap_id"] || "";
  if (!query) {
    return res.status(400).json({ error: "Add a search query or working title first." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    // Real index search only (OpenAlex, Crossref, DOAJ, DataCite, arXiv).
    // This route used to ask an LLM to "generate" papers with realistic
    // metadata; every result now comes from a scholarly index.
    send("log", { message: `Searching OpenAlex, Crossref, DOAJ, DataCite and arXiv for "${query.slice(0, 120)}"…` });
    const drafts = await discoverMultiPortalSources(query, 16);
    const data = drafts.map((d, idx) => ({
      id: `ext-${Date.now()}-${idx}`,
      title: d.title,
      author: d.authors.join(", "),
      year: d.year,
      database: d.discoveredVia,
      doi: d.doi,
      url: d.url,
      journal: d.venue,
      gap_addressed: anchorGap || undefined,
      snippet: "",
      matched_concepts: [],
    }));
    send("log", { message: `Found ${data.length} records.` });
    send("done", { ok: true, data });
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    send("error", { message: `Literature search failed: ${message}` });
    res.end();
  }
});

// POST /api/projects/:id/agent/evidence-analysis
evidenceRoutes.post("/evidence-analysis", async (req: express.Request<{ id: string }>, res) => {
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
  } catch (err: unknown) {
    if (res.writableEnded) return;
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/journal-discovery
evidenceRoutes.post("/journal-discovery", async (req: express.Request<{ id: string }>, res) => {
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
  } catch (err: unknown) {
    if (res.writableEnded) return;
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/journal-requirements
evidenceRoutes.post("/journal-requirements", async (req: express.Request<{ id: string }>, res) => {
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}`, undefined, "discovery");
    if (!result) return;
    res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: result.data })}\n\n`);
    res.end();
  } catch (err: unknown) {
    if (res.writableEnded) return;
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agentic/upload-user-data
evidenceRoutes.post(
  "/upload-user-data",
  async (req: express.Request<{ id: string }>, res: express.Response, next: express.NextFunction) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    next();
  },
  userUpload.single("file"),
  async (req: express.Request<{ id: string }>, res: express.Response) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;

    try {
      let title = (req.body?.title as string | undefined)?.trim() || "";
      const author = (req.body?.author as string | undefined)?.trim() || "Principal Investigator (Primary Research)";
      const rawText = typeof req.body?.rawText === "string" ? req.body.rawText : undefined;
      const assignedSectionId = typeof req.body?.assignedSectionId === "string" ? req.body.assignedSectionId : undefined;
      const epistemicRole =
        req.body?.epistemicRole === "Supporting" ||
        req.body?.epistemicRole === "Contrasting / Critical" ||
        req.body?.epistemicRole === "Methodological Anchor"
          ? req.body.epistemicRole
          : "Primary User Dataset";

      let textContent = "";
      let format = "txt";
      let sourceType: "quantitative_dataset" | "qualitative_document" | "field_notes" | "raw_text" = "raw_text";
      let summary = "";
      let extractedFindings = "";
      const keyMetrics: string[] = [];

      if (req.file) {
        const filename = req.file.originalname || "user_dataset";
        const ext = filename.split(".").pop()?.toLowerCase() || "";
        format = ext;
        if (!title) title = filename;

        const parsed = await parseDocument({
          data: req.file.buffer,
          filename,
          mimeType: req.file.mimetype,
        });

        if (!parsed.ok) {
          res.status(400).json({ error: `Failed to parse document: ${parsed.error.message}` });
          return;
        }

        textContent = normalizeUnicodeNFC(parsed.data.text || "");
        const meta = parsed.data.metadata || {};

        if (["csv", "xlsx", "xls", "tsv"].includes(ext)) {
          sourceType = "quantitative_dataset";
          const rowCount = typeof meta.rowCount === "number" ? meta.rowCount : textContent.split("\n").length;
          const sheetNames = Array.isArray(meta.sheetNames) ? meta.sheetNames.map(String) : ["Dataset"];
          keyMetrics.push(`Total Rows: ${rowCount}`);
          keyMetrics.push(`Sheets: ${sheetNames.join(", ")}`);
          summary = `Quantitative empirical dataset "${filename}" with ${rowCount} rows across sheets (${sheetNames.join(", ")}).`;

          // Extract first 20 structured rows as empirical findings
          const sampleLines = textContent
            .split("\n")
            .filter((l) => l.trim().length > 0)
            .slice(0, 20);
          extractedFindings = sampleLines.join("\n");
        } else {
          sourceType = "qualitative_document";
          const pages = parsed.data.pages?.length || 1;
          summary = `Qualitative empirical source "${filename}" (${pages} page${pages > 1 ? "s" : ""}, ${textContent.split(/\s+/).length} words).`;
          extractedFindings = textContent.slice(0, 1500).trim();
        }
      } else if (rawText) {
        textContent = normalizeUnicodeNFC(rawText.trim());
        format = req.body?.format || "text";
        sourceType = "field_notes";
        if (!title) title = "Primary Field Notes & Observations";
        const wordCount = textContent.split(/\s+/).length;
        summary = `Direct primary field note entry (${wordCount} words).`;
        extractedFindings = textContent.slice(0, 1500).trim();
        keyMetrics.push(`Word count: ${wordCount}`);
      } else {
        res.status(400).json({ error: "No file or rawText provided for user data ingestion" });
        return;
      }

      const id = `user_data_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const citationToken = `[CITE:${id}]`;

      const datasetItem: UserDatasetRecord = {
        id,
        citationToken,
        title: normalizeUnicodeNFC(title),
        author: normalizeUnicodeNFC(author),
        year: new Date().getFullYear(),
        badge: "Primary User Data / Upload",
        sourceType,
        format,
        summary: normalizeUnicodeNFC(summary),
        extractedFindings: normalizeUnicodeNFC(extractedFindings),
        keyMetrics: keyMetrics.length > 0 ? keyMetrics : undefined,
        assignedSectionId,
        epistemicRole,
        rawContentSample: textContent.slice(0, 3000),
        createdAt: new Date().toISOString(),
      };

      // Read existing user datasets
      const existingDatasets = safeParseAnswerField<UserDatasetRecord[]>(project.answers?.["user_datasets"], []);

      existingDatasets.unshift(datasetItem);

      // Persist in project answers
      project.answers = {
        ...project.answers,
        user_datasets: JSON.stringify(existingDatasets),
      };

      await getProjectStore().save(project);

      // Also if Supabase is configured, sync into project_evidence
      const config = getSupabaseRestConfig();
      if (config) {
        try {
          const table = new SupabaseTable(config, "project_evidence");
          await table.request("", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.projectId,
              source_id: id,
              title: datasetItem.title,
              claim_text: datasetItem.extractedFindings.slice(0, 500),
              status: "approved",
              metadata: {
                badge: datasetItem.badge,
                citationToken: datasetItem.citationToken,
                sourceType: datasetItem.sourceType,
                epistemicRole: datasetItem.epistemicRole,
                assignedSectionId: datasetItem.assignedSectionId,
              },
            }),
          });
        } catch (e) {
          console.warn("Could not insert user dataset into Supabase project_evidence:", e);
        }
      }

      res.json({
        ok: true,
        dataset: datasetItem,
        totalDatasets: existingDatasets.length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  }
);

// PUT /api/projects/:id/agentic/user-data/:dataId
evidenceRoutes.put(
  "/user-data/:dataId",
  async (req: express.Request<{ id: string; dataId: string }>, res: express.Response) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;

    const dataId = req.params.dataId;
    const datasets = safeParseAnswerField<UserDatasetRecord[]>(project.answers?.["user_datasets"], []);

    const index = datasets.findIndex((d) => d.id === dataId);
    if (index === -1) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }

    const existing = datasets[index];
    if (req.body?.assignedSectionId !== undefined) {
      existing.assignedSectionId = req.body.assignedSectionId;
    }
    if (req.body?.epistemicRole) {
      existing.epistemicRole = req.body.epistemicRole;
    }
    if (req.body?.extractedFindings) {
      existing.extractedFindings = normalizeUnicodeNFC(req.body.extractedFindings);
    }

    datasets[index] = existing;
    project.answers = {
      ...project.answers,
      user_datasets: JSON.stringify(datasets),
    };
    await getProjectStore().save(project);

    res.json({ ok: true, dataset: existing });
  }
);

evidenceRoutes.put("/evidence", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();

  try {
    if (config) {
      try {
        const table = new SupabaseTable(config, "project_evidence");
      } catch (e) {
        console.warn("Could not update Supabase project_evidence:", e);
      }
    }
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

evidenceRoutes.get("/evidence", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();

  try {
    let data: unknown[] = [];
    if (config) {
      try {
        const table = new SupabaseTable(config, "project_evidence");
        const resData = await table.request(`?project_id=eq.${project.projectId}`);
        if (Array.isArray(resData)) data = resData;
      } catch (e) {
        console.warn("Could not query Supabase project_evidence:", e);
      }
    }
    if (data.length === 0 && project.answers?.extracted_evidence) {
      const parsed = safeParseAnswerField<any[]>(project.answers.extracted_evidence, []);
      if (Array.isArray(parsed)) data = parsed;
    }
    res.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});
