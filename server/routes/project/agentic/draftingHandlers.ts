import express from "express";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { getProjectSafe, executeScholarBrainJSON } from "./types.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../../src/supabaseRest.ts";
import {
  scholarBrain,
  buildBoundedRagContext,
  type AcademicDocumentInput,
} from "../../../src/services/scholarBrain.ts";
import { buildScholarlyVoiceSystemPrompt } from "../../../src/utils/scholarlyVoiceGuard.ts";
import {
  handleFrontendLLMOverride,
  resolveRequestAiConfig,
  isServerAiAuthorized,
  createLLMChallengeToken,
} from "../../../utils/llm.ts";

export function registerDraftingHandlers(router: express.Router): void {
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
CITATION INTEGRITY INSTRUCTION:
- Only cite sources with confirmed citation metadata or approved evidence bracket tokens [ev-xxxx].
- If a research source is marked with UNCONFIRMED citation status, incorporate its empirical/factual findings into the text context, but DO NOT fabricate publication details, journal names, years, or authors.
Return ONLY valid JSON in this exact format:
{
  "data": [
    { "section": "Introduction", "status": "Drafted", "length": 1200, "content": "..." },
    { "section": "Methodology", "status": "Drafted", "length": 1500, "content": "..." },
    { "section": "Results", "status": "Drafted", "length": 2000, "content": "..." },
    { "section": "Conclusion", "status": "Drafted", "length": 800, "content": "..." }
  ]
}`;
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[] }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt: `Context: ${context}\nChapter ID to target: ${chapterId || "all"}`,
          taskType: "long-context",
        }
      );
      if (!result) return;

      // Update into Supabase manuscript_sections and version snapshots
      const config = getSupabaseRestConfig();
      if (config && result.data && Array.isArray(result.data)) {
        const table = new SupabaseTable(config, "manuscript_sections");
        const vTable = new SupabaseTable(config, "manuscript_versions");

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
          if (!sec || typeof sec !== "object") continue;
          await table.request("", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify({
              project_id: project.projectId,
              section_name: sec.section || sec.section_name || "Untitled Section",
              content: sec.content || "",
              status: sec.status || "Drafted",
              word_count: typeof sec.length === "number" ? sec.length : (typeof sec.content === "string" ? sec.content.split(/\s+/).length : 0)
            })
          });
        }
      }

      // Always persist into project answers so it is retained even if Supabase is offline
      if (result.data && Array.isArray(result.data)) {
        const nextAnswers = {
          ...project.answers,
          manuscript_draft: JSON.stringify(result.data),
          current_stage: "drafting",
        };
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

  // POST /api/projects/:id/agentic/draft-subsection
  router.post("/draft-subsection", async (req: express.Request<{ id: string }>, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;

    const {
      subsectionTitle = "Subsection Analysis",
      sectionTitle = "Methodological Framework",
      sectionQuery = "",
      wordBudget = 400,
      priorChapters = [],
    } = req.body || {};

    const answers = (project.answers || {}) as Record<string, unknown>;
    const researchQuestion = (answers.workingTitle as string) || (answers.researchQuestion as string) || "";

    // 1. Gather all documents for semantic RAG (vault sources, literature, evidence)
    const vaultSources = Array.isArray(project.evidenceLedger?.sources)
      ? project.evidenceLedger.sources
      : Array.isArray(answers.vault_items)
      ? (answers.vault_items as unknown[])
      : [];

    const ragDocs: AcademicDocumentInput[] = [];

    if (Array.isArray(vaultSources)) {
      for (let i = 0; i < vaultSources.length; i++) {
        const vs = vaultSources[i] as Record<string, unknown>;
        ragDocs.push({
          id: (vs.id as string) || (vs.source_id as string) || `src-${i + 1}`,
          title: (vs.title as string) || "Scholarly Source",
          content: [
            (vs.abstract as string) || "",
            Array.isArray(vs.findings) ? (vs.findings as string[]).join(" ") : "",
            (vs.excerpt as string) || "",
          ].join(" "),
          author: (vs.author as string) || undefined,
          year: (vs.year as string | number) || undefined,
          sourceType: "vault",
        });
      }
    }

    // 2. Build Bounded RAG Context with token budget
    const boundedRag = buildBoundedRagContext(ragDocs, {
      researchQuestion,
      sectionQuery: `${sectionTitle} ${subsectionTitle} ${sectionQuery}`,
      priorChapters: Array.isArray(priorChapters) ? priorChapters : undefined,
    });

    const systemPrompt = `${buildScholarlyVoiceSystemPrompt({ discipline: "Academic Manuscript" })}
You are an expert academic research co-author drafting subsection: "${subsectionTitle}" under section: "${sectionTitle}".
Target Word Budget: approximately ${wordBudget} words.
Ground your claims in the retrieved evidence chunks below. Use [CITE:id] tokens matching the retrieved chunks.
Do NOT fabricate sources.`;

    const userPrompt = `Research Question: ${researchQuestion}
Section: ${sectionTitle}
Subsection: ${subsectionTitle}
Section Objectives / Focus: ${sectionQuery || subsectionTitle}

${boundedRag.formattedContext}

Draft the complete subsection text now.`;

    const wantsStream = Boolean(
      req.headers.accept?.includes("text/event-stream") ||
      req.query.stream === "true" ||
      req.body?.stream === true
    );

    if (wantsStream) {
      await scholarBrain.stream(req, {
        res,
        systemPrompt,
        userPrompt,
        taskType: "drafting",
        vaultSources: ragDocs.map((d) => ({
          id: d.id,
          title: d.title,
          author: d.author,
          year: d.year,
        })),
      });
      return;
    }

    // Standard JSON response
    const streamResult = await scholarBrain.stream(req, {
      systemPrompt,
      userPrompt,
      taskType: "drafting",
      vaultSources: ragDocs.map((d) => ({
        id: d.id,
        title: d.title,
        author: d.author,
        year: d.year,
      })),
    });

    res.json({
      success: true,
      subsectionTitle,
      sectionTitle,
      content: streamResult.cleanText,
      wordCount: streamResult.cleanText.split(/\s+/).filter(Boolean).length,
      ragSummary: {
        chunkCount: boundedRag.chunkCount,
        totalTokens: boundedRag.totalTokens,
        stances: boundedRag.includedStances,
      },
    });
  });

  // POST /api/projects/:id/agent/draft-preview
  router.post("/draft-preview", async (req: express.Request<{ id: string }>, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write(`event: log\ndata: ${JSON.stringify({ message: "Assembling manuscript sections..." })}\n\n`);

    try {
      let content = "";
      let pages = 0;

      // 1. First attempt to load from Supabase if configured
      const config = getSupabaseRestConfig();
      if (config) {
        try {
          const table = new SupabaseTable(config, "manuscript_sections");
          const data = await table.request(`?project_id=eq.${project.projectId}`);
          if (Array.isArray(data) && data.length > 0) {
            content = data.map((s: Record<string, unknown>) => `## ${(s.section_name as string) || (s.section as string) || "Untitled Section"}\n\n${(s.content as string) || ""}`).join("\n\n");
            pages = Math.ceil(content.split(/\s+/).length / 250);
          }
        } catch (e) {
          console.warn("Could not query Supabase manuscript_sections:", e);
        }
      }

      // 2. Fall back to local projectStore answers (manuscript_draft or assembled_draft)
      if (!content) {
        const rawDraft = project.answers?.manuscript_draft || project.answers?.assembled_draft;
        if (rawDraft) {
          try {
            const parsed = typeof rawDraft === "string" ? JSON.parse(rawDraft) : rawDraft;
            if (Array.isArray(parsed) && parsed.length > 0) {
              content = parsed.map((s: Record<string, unknown>) => `## ${(s.section as string) || (s.section_name as string) || "Untitled Section"}\n\n${(s.content as string) || ""}`).join("\n\n");
              pages = Math.ceil(content.split(/\s+/).length / 250);
            } else if (typeof rawDraft === "string" && rawDraft.trim().length > 0) {
              content = rawDraft;
              pages = Math.ceil(content.split(/\s+/).length / 250);
            }
          } catch {
            if (typeof rawDraft === "string" && rawDraft.trim().length > 0) {
              content = rawDraft;
              pages = Math.ceil(content.split(/\s+/).length / 250);
            }
          }
        }
      }

      if (!content) {
        content = "Draft not generated yet. Please navigate to Stage 17 (Drafting) to generate your first draft.";
        pages = 0;
      }

      res.write(`event: log\ndata: ${JSON.stringify({ message: `Rendering preview (${pages} pages)...` })}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: { content, pages, status: "Ready" } })}\n\n`);
      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
        res.end();
      }
    }
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
    let scopedContext: Record<string, unknown> = {};
    
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
      // Late stages: include document structure
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
      if (Array.isArray(history) && history.length > 0) {
        userPrompt += "Conversation History:\n";
        for (const msg of history as Array<{ role?: string; content?: string }>) {
          userPrompt += `${msg.role === "user" ? "User" : "Copilot"}: ${msg.content || ""}\n`;
        }
        userPrompt += "\nNew Message from User:\n";
      }
      userPrompt += message;

      const override = handleFrontendLLMOverride(req, res, { systemPrompt, userPrompt });
      if (override) {
        res.json({ ok: true, response: override });
        return;
      }

      const aiConfig = resolveRequestAiConfig(req);
      const serverAuthorized = await isServerAiAuthorized(req);
      const rawCandidates = serverAuthorized ? aiConfig.candidates : [];
      const candidates = rawCandidates.map((c) => ({
        ...c,
        model: c.model || undefined,
      }));

      if (candidates.length === 0) {
        if (!res.headersSent) {
          const challengeToken = createLLMChallengeToken(req, systemPrompt, userPrompt);
          res.status(426).json({
            requireFrontendLLM: true,
            challengeToken,
            systemPrompt,
            userPrompt,
            taskType: "reasoning",
          });
        }
        return;
      }

      const streamResult = await scholarBrain.stream(req, {
        systemPrompt,
        userPrompt,
        taskType: "reasoning",
        candidates,
      });

      const responseText = streamResult?.cleanText || streamResult?.fullText || "";
      res.json({ ok: true, response: responseText });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RequireFrontendLLMException") return;
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  // PUT /api/projects/:id/agent/manuscript
  router.put("/manuscript", async (req, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    const config = getSupabaseRestConfig();

    try {
      const updates = Array.isArray(req.body) ? req.body : [req.body];

      // 1. If Supabase is configured, snapshot and update
      if (config) {
        try {
          const table = new SupabaseTable(config, "manuscript_sections");
          const vTable = new SupabaseTable(config, "manuscript_versions");
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

          for (const sec of updates) {
            await table.request("", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
              body: JSON.stringify({
                project_id: project.projectId,
                section_name: sec.section_name || sec.section || "Full Manuscript",
                content: sec.content || "",
                status: sec.status || "Edited",
                word_count: typeof sec.content === "string" ? sec.content.split(/\s+/).filter(Boolean).length : 0
              })
            });
          }
        } catch (e) {
          console.warn("Could not save to Supabase manuscript_sections:", e);
        }
      }

      // 2. Always persist to local projectStore answers
      const combinedContent = (updates as Record<string, unknown>[]).map((s: Record<string, unknown>) => (s.content as string) || "").join("\n\n");
      const nextAnswers = {
        ...project.answers,
        manuscript_draft: JSON.stringify(updates),
        assembled_draft: combinedContent,
        current_stage: "final_editor",
      };
      await getProjectStore().save({ ...project, answers: nextAnswers });

      res.json({ ok: true, message: "Manuscript saved successfully" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/:id/agent/manuscript
  router.get("/manuscript", async (req, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    const config = getSupabaseRestConfig();

    try {
      let data: Record<string, unknown>[] = [];

      // 1. Try Supabase if configured
      if (config) {
        try {
          const table = new SupabaseTable(config, "manuscript_sections");
          const sections = await table.request(`?project_id=eq.${project.projectId}&order=id.asc`);
          if (Array.isArray(sections) && sections.length > 0) {
            data = sections as Record<string, unknown>[];
          }
        } catch (e) {
          console.warn("Could not query Supabase manuscript_sections:", e);
        }
      }

      // 2. Fall back to local projectStore answers (manuscript_draft or assembled_draft)
      if (data.length === 0) {
        const rawDraft = project.answers?.manuscript_draft || project.answers?.assembled_draft;
        if (rawDraft) {
          try {
            const parsed = typeof rawDraft === "string" ? JSON.parse(rawDraft) : rawDraft;
            if (Array.isArray(parsed) && parsed.length > 0) {
              data = parsed.map((s: Record<string, unknown>) => ({
                section_name: (s.section as string) || (s.section_name as string) || "Section",
                content: (s.content as string) || "",
                status: (s.status as string) || "Drafted"
              }));
            } else if (typeof rawDraft === "string" && rawDraft.trim().length > 0) {
              data = [{ section_name: "Full Manuscript", content: rawDraft, status: "Drafted" }];
            }
          } catch (_) {
            if (typeof rawDraft === "string" && rawDraft.trim().length > 0) {
              data = [{ section_name: "Full Manuscript", content: rawDraft, status: "Drafted" }];
            }
          }
        }
      }

      res.json({ ok: true, data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });
}
