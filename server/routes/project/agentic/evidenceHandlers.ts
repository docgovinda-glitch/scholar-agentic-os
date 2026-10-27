import express from "express";
import multer from "multer";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import { normalizeUnicodeNFC } from "../../../../src/shared/scholarGuardrails.js";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { getProjectSafe, executeScholarBrainJSON, type UserDatasetRecord } from "./types.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../../src/supabaseRest.ts";

// Memory storage for user dataset ingestion (zero disk residual)
const userUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});


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

  // POST /api/projects/:id/agentic/upload-user-data
  router.post(
    "/upload-user-data",
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
        let existingDatasets: UserDatasetRecord[] = [];
        if (project.answers?.["user_datasets"]) {
          try {
            const parsed = JSON.parse(project.answers["user_datasets"]);
            if (Array.isArray(parsed)) existingDatasets = parsed;
          } catch {}
        }

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
  router.put(
    "/user-data/:dataId",
    async (req: express.Request<{ id: string; dataId: string }>, res: express.Response) => {
      const project = await getProjectSafe(req, res);
      if (!project) return;

      const dataId = req.params.dataId;
      let datasets: UserDatasetRecord[] = [];
      if (project.answers?.["user_datasets"]) {
        try {
          const parsed = JSON.parse(project.answers["user_datasets"]);
          if (Array.isArray(parsed)) datasets = parsed;
        } catch {}
      }

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
}
