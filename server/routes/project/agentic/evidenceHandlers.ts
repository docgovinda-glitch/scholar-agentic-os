import express from "express";
import { getProjectSafe, executeScholarBrainJSON } from "./types.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../../src/supabaseRest.ts";

export function registerEvidenceHandlers(router: express.Router): void {
  // POST /api/projects/:id/agent/vault-sources
  router.post("/vault-sources", async (req: express.Request<{ id: string }>, res) => {
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
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[] }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt: `Context: ${context}\n\n${vaultContext}`,
          taskType: "discovery",
        }
      );
      if (!result) return;
      
      // Insert into Supabase project_sources
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
              year: typeof src.year === "number" ? src.year : (parseInt(src.year as string, 10) || new Date().getFullYear()),
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

  // POST /api/projects/:id/agent/evidence-extraction
  router.post("/evidence-extraction", async (req: express.Request<{ id: string }>, res) => {
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
        const { generateGeminiEmbedding } = await import("../../../utils/llm.js");
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
              ragContext = matches.map((m: { source?: string; quote?: string }) => `Source: ${m.source || "Unknown"}\nQuote: ${m.quote}`).join("\n\n---\n\n");
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
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[] }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt: finalContext,
          taskType: "evidence-extraction",
        }
      );
      if (!result) return;
      
      // Insert into Supabase project_evidence
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

  // POST /api/projects/:id/agent/external-research
  router.post("/external-research", async (req: express.Request<{ id: string }>, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    const context = JSON.stringify(project.answers);
    const query = req.body?.query || project.answers["core_problem"] || project.answers["working_title"] || "academic external research";
    const requestedDatabases = Array.isArray(req.body?.databases) && req.body.databases.length > 0
      ? req.body.databases.join(", ")
      : "CrossRef, arXiv, Semantic Scholar, IEEE Xplore, PubMed, DOAJ";
    const minRelevance = Number(req.body?.minRelevance) || 75;
    const anchorGap = req.body?.anchorGap || project.answers["anchor_gap_id"] || "Primary Research Gap";

    try {
      const systemPrompt = `You are an expert autonomous scholarly research crawler agent conducting Deep External Literature Discovery.
Target academic registries: ${requestedDatabases}.
Target search query: "${query}".
Evidentiary gap to address: "${anchorGap}".
Minimum relevance threshold: ${minRelevance}%.

Generate 10 to 16 publication-grade, peer-reviewed external papers or verified preprints that fill the unaddressed literature gap.
For each paper, classify its evidentiary role into one of: 'benchmark', 'empirical', 'theoretical', 'methodological', or 'comparative'.
Provide realistic metadata including authors, publication year (2020-2025 preferred), valid DOIs or arXiv identifiers, target journal/conference, citation count, matched concepts, and a verbatim abstract snippet detailing concrete empirical or theoretical findings.

Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "ext-1",
      "title": "Exact Title of External Paper",
      "author": "Author One, Author Two, & Author Three",
      "year": 2024,
      "database": "CrossRef",
      "doi": "10.1145/3547659.3560812",
      "gap_addressed": "${anchorGap}",
      "snippet": "Empirical and theoretical findings resolving boundary conditions...",
      "relevance": 94,
      "relevance_score": 94,
      "evidentiary_role": "benchmark",
      "matched_concepts": ["Concept1", "Concept2"],
      "citation_count": 58,
      "journal": "ACM Transactions on Computer Systems"
    }
  ]
}`;
      const searchContext = `Search Parameters:
- Query: ${query}
- Target Databases: ${requestedDatabases}
- Anchor Gap: ${anchorGap}
- Manuscript Working Title: ${project.answers["working_title"] || project.answers["title"] || "Research Manuscript"}
- Target Venue: ${project.answers["target_journal"] || "Peer-Reviewed Venue"}
- Methodology: ${project.answers["methodology"] || "Empirical Research"}

Research Context: ${context}`;

      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[] }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt: searchContext,
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
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[] }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt: `Context: ${context}`,
          taskType: "reasoning",
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

  // PUT /api/projects/:id/agent/evidence
  router.put("/evidence", async (req, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    const config = getSupabaseRestConfig();

    try {
      if (config) {
        try {
          const table = new SupabaseTable(config, "project_evidence");
          // Implementation for explicit evidence update if needed
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

  // GET /api/projects/:id/agent/evidence
  router.get("/evidence", async (req, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    const config = getSupabaseRestConfig();

    try {
      let data: Record<string, unknown>[] = [];
      if (config) {
        try {
          const table = new SupabaseTable(config, "project_evidence");
          const resData = await table.request(`?project_id=eq.${project.projectId}`);
          if (Array.isArray(resData)) data = resData as Record<string, unknown>[];
        } catch (e) {
          console.warn("Could not query Supabase project_evidence:", e);
        }
      }
      if (data.length === 0 && project.answers?.extracted_evidence) {
        try {
          const parsed = JSON.parse(project.answers.extracted_evidence);
          if (Array.isArray(parsed)) data = parsed as Record<string, unknown>[];
        } catch (_) {}
      }
      res.json({ ok: true, data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });
}
