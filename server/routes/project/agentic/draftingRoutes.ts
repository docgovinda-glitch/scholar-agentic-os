import express from "express";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { safeParseAnswerField } from "../../../../src/shared/projectStateSchema.ts";
import {
  callOpenRouterText,
  streamOpenRouterJSON,
  getCandidates,
  buildAuthorizedPolicy,
} from "../../../utils/llm.ts";
import { completeWithFailover } from "../../../../src/platform/gateway/gateway.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  evaluateBurstiness,
  type ScholarlyDialect,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../../src/supabaseRest.ts";
import {
  allocateWordBudget,
  countExactWords,
  generateDeterministicSubSectionDraft,
  expandDeterministicDraft,
  type ManuscriptTemplate,
  type WordBudgetBlueprint,
} from "../../../src/utils/wordBudgetAllocator.ts";
import {
  formatCitationLedger,
  scrubCitations,
  type VerifiedSourceItem,
} from "../../../src/utils/citationLockScrubber.ts";
import { chunkAndRerankEvidence } from "../../../src/services/semanticRagEngine.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import { getProjectSafe } from "./helpers.ts";
import type { UserDatasetRecord, DraftSubSectionRequestBody } from "./types.ts";

export const draftingRoutes = express.Router({ mergeParams: true });

// POST /api/projects/:id/agentic/allocate-budget
draftingRoutes.post("/allocate-budget", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const targetTotalWords =
    typeof req.body?.targetTotalWords === "number" && req.body.targetTotalWords > 0
      ? req.body.targetTotalWords
      : 6000;

  const rawTemplate = req.body?.template;
  const template: ManuscriptTemplate =
    rawTemplate === "Theoretical" || rawTemplate === "SystematicReview"
      ? rawTemplate
      : "IMRaD";

  const blueprint = allocateWordBudget(project.projectId, targetTotalWords, template);

  // Persist wordBudgetBlueprint inside project state
  project.answers = {
    ...project.answers,
    word_budget_blueprint: JSON.stringify(blueprint),
    target_word_count: String(targetTotalWords),
    manuscript_template: template,
  };
  await getProjectStore().save(project);

  res.json({
    ok: true,
    blueprint,
  });
});

// POST /api/projects/:id/agentic/draft-subsection
draftingRoutes.post(
  "/draft-subsection",
  async (req: express.Request<{ id: string }, unknown, DraftSubSectionRequestBody>, res: express.Response) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;

    const sectionId = req.body?.sectionId || "sec-1";
    const subSectionId = req.body?.subSectionId || "sec-1-sub-1";
    const subSectionTitle = req.body?.subSectionTitle || "Foundational Problem Domain";
    const targetWords =
      typeof req.body?.targetWords === "number" && req.body.targetWords > 0
        ? req.body.targetWords
        : 400;

    const targetDialect: ScholarlyDialect = req.body?.dialect === "en-US" ? "en-US" : "en-GB";

    // 1. Resolve Assigned Sources
    let assignedSources: VerifiedSourceItem[] = [];
    if (Array.isArray(req.body?.assignedSources) && req.body.assignedSources.length > 0) {
      assignedSources = req.body.assignedSources;
    } else if (project.answers?.["vault_sources"]) {
      const parsed = safeParseAnswerField<Record<string, unknown>[]>(project.answers["vault_sources"], []);
      if (Array.isArray(parsed)) {
        assignedSources = parsed.map((item: Record<string, unknown>, idx: number) => ({
          id: String(item.id || `src_${idx + 1}`),
          authors: Array.isArray(item.authors)
            ? (item.authors as string[])
            : String(item.author || item.authors || "Anonymous"),
          year: typeof item.year === "number" ? item.year : String(item.year || "2024"),
          title: String(item.title || "Scholarly Document"),
          doi: typeof item.doi === "string" ? item.doi : undefined,
          url: typeof item.url === "string" ? item.url : undefined,
          stance: (item.stance as "Supporting" | "Contrasting" | "Methodological") || "Supporting",
          keyFindings: typeof item.keyFindings === "string" ? item.keyFindings : undefined,
        }));
      }
    }

    // Also include researcher's uploaded primary user datasets in the citation ledger
    if (project.answers?.["user_datasets"]) {
      const userDatasets = safeParseAnswerField<UserDatasetRecord[]>(project.answers["user_datasets"], []);
      if (Array.isArray(userDatasets)) {
        for (const ud of userDatasets) {
          if (!assignedSources.some((s) => s.id === ud.id)) {
            if (!ud.assignedSectionId || ud.assignedSectionId === subSectionId || ud.assignedSectionId === sectionId) {
              assignedSources.push({
                id: ud.id,
                authors: ud.author || "Principal Investigator (Primary Data)",
                year: ud.year || 2026,
                title: ud.title,
                stance:
                  ud.epistemicRole === "Methodological Anchor"
                    ? "Methodological"
                    : ud.epistemicRole === "Contrasting / Critical"
                    ? "Contrasting"
                    : "Supporting",
                keyFindings: ud.extractedFindings || ud.summary,
              });
            }
          }
        }
      }
    }

    // 2. Format Citation Ledger & Rerank Evidence with Semantic BM25
    const { ledgerPrompt, sourceMap } = formatCitationLedger(assignedSources);
    const ragResult = chunkAndRerankEvidence(subSectionTitle, assignedSources, 2500);

    // 3. Assemble System Prompt for Pass 1 (Grounded Draft)
    const voicePrompt = buildScholarlyVoiceSystemPrompt({ dialect: targetDialect });
    const systemPrompt = `${voicePrompt}

${ledgerPrompt}

${ragResult.formattedContext}

TASK SPECIFICATION:
You are drafting academic sub-section "${subSectionTitle}".
Target Word Budget: approximately ${targetWords} words (must land strictly in 350–500 words).

CRITICAL CITATION RULES:
1. Every factual assertion, quantitative finding, or empirical claim MUST cite evidence using [CITE:source_id] tokens from the ledger above.
2. DO NOT write unverified (Author, Year) strings from memory.
3. Eliminate all AI lexical clichés ("delve", "tapestry", "pivotal", etc.).
4. Maintain high syntactic burstiness with complex multi-clause analytical sentences.`;

    const userPrompt = `Draft the scholarly sub-section "${subSectionTitle}".
Research Context:
- Working Title: ${project.answers?.["working_title"] || (project as { title?: string }).title || project.projectId || "Scholarly Manuscript"}
- Core Research Problem: ${project.answers?.["core_problem"] || "Investigating empirical variance and structural bounds."}
${req.body?.contextPrompt ? `- Author Guidance: ${req.body.contextPrompt}` : ""}
${req.body?.thesisStatement ? `- Thesis Statement: ${req.body.thesisStatement}` : ""}
Target Word Budget: ${targetWords} words.`;

    const candidates = getCandidates(req);
    const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

    const wantsStream = req.headers.accept?.includes("text/event-stream") || req.query.stream === "true";
    if (wantsStream) {
      await scholarBrain.stream(
        req,
        {
          systemPrompt,
          userPrompt,
          taskClass: "drafting",
          dialect: targetDialect,
        },
        res
      );
      return;
    }

    let draftText = "";

    if (candidates.length > 0 && !isTest) {
      try {
        const response = await completeWithFailover(
          {
            taskClass: "drafting",
            systemPrompt,
            userPrompt,
            segments: [{ label: "subSection", text: userPrompt }],
          },
          { candidates },
          buildAuthorizedPolicy(candidates)
        );
        if (response.ok && response.value?.text) {
          draftText = response.value.text;
        }
      } catch (e) {
        console.warn("Pass 1 AI Gateway draft failed, falling back to deterministic synthesis", e);
      }
    }

    // Fallback if AI inference didn't yield text
    if (!draftText.trim()) {
      draftText = generateDeterministicSubSectionDraft(
        subSectionTitle,
        assignedSources,
        targetWords,
        targetDialect,
        req.body?.contextPrompt
      );
    }

    // 4. Pass 2 (Deterministic Word-Count Controller)
    const wordCountPass1 = countExactWords(draftText);

    // If word count is more than 8% below targetWords, execute Evidence-Grounded Expansion Pass
    if (wordCountPass1 < targetWords * 0.92) {
      const deficit = targetWords - wordCountPass1;

      if (candidates.length > 0 && !isTest) {
        try {
          const expansionPrompt = `The preceding draft for "${subSectionTitle}" is ${wordCountPass1} words, which is below the target budget of ${targetWords} words.
Expand this draft by approximately ${deficit} words by providing a deeper methodological comparison and critical synthesis of the registered sources: ${assignedSources.map((s) => `[CITE:${s.id}]`).join(", ")}.
Ensure the final text lands within ±5% of ${targetWords} words without conversational filler or cliché repetitions.

Existing Draft:
${draftText}`;

          const expansionResponse = await completeWithFailover(
            {
              taskClass: "refinement",
              systemPrompt,
              userPrompt: expansionPrompt,
              segments: [{ label: "expansion", text: expansionPrompt }],
            },
            { candidates },
            buildAuthorizedPolicy(candidates)
          );
          if (expansionResponse.ok && expansionResponse.value?.text && expansionResponse.value.text.trim().length > 0) {
            draftText = expansionResponse.value.text;
          }
        } catch (e) {
          console.warn("Pass 2 AI expansion failed, applying deterministic expansion", e);
          draftText = expandDeterministicDraft(draftText, assignedSources, deficit, targetDialect);
        }
      } else {
        // Offline / test deterministic expansion
        draftText = expandDeterministicDraft(draftText, assignedSources, deficit, targetDialect);
      }
    }

    // 5. Post-Generation Scrubber & Voice Guard
    const scrubResult = scrubCitations(draftText, sourceMap, { dialect: targetDialect });
    const sanitized = sanitizeScholarlyText(scrubResult.scrubbedText, {
      dialect: targetDialect,
      stripCliches: true,
    });
    const burstinessMetrics = evaluateBurstiness(sanitized);
    const actualWords = countExactWords(sanitized);
    const deviationPercentage = Math.round(((actualWords - targetWords) / targetWords) * 100 * 10) / 10;

    // 6. Persistence into project state
    if (project.answers?.["word_budget_blueprint"]) {
      const blueprint = safeParseAnswerField<WordBudgetBlueprint | null>(project.answers["word_budget_blueprint"], null);
      if (blueprint && Array.isArray(blueprint.sections)) {
        let found = false;
        for (const sec of blueprint.sections) {
          for (const sub of sec.subSections) {
            if (sub.id === subSectionId) {
              sub.content = sanitized;
              sub.actualWords = actualWords;
              sub.draftedAt = new Date().toISOString();
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) {
          project.answers["word_budget_blueprint"] = JSON.stringify(blueprint);
        }
      }
    }

    // Also update drafted_subsections dictionary
    const existingDrafted = safeParseAnswerField<Record<string, unknown>>(project.answers?.["drafted_subsections"], {});
    existingDrafted[subSectionId] = {
      sectionId,
      subSectionId,
      title: subSectionTitle,
      content: sanitized,
      actualWords,
      targetWords,
      updatedAt: new Date().toISOString(),
    };
    project.answers = {
      ...project.answers,
      drafted_subsections: JSON.stringify(existingDrafted),
    };
    await getProjectStore().save(project);

    res.json({
      ok: true,
      sectionId,
      subSectionId,
      title: subSectionTitle,
      content: sanitized,
      actualWords,
      targetWords,
      deviationPercentage,
      burstinessMetrics,
      warnings: scrubResult.chronologicalWarnings,
      unverifiedClaimsCount: scrubResult.unverifiedClaimsCount,
      resolvedCitationsCount: scrubResult.resolvedCitationsCount,
      strippedCitations: scrubResult.strippedCitations,
      citedSources: scrubResult.citedSources,
    });
  }
);

// POST /api/projects/:id/agent/draft
draftingRoutes.post("/draft", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const context = JSON.stringify(project.answers);

  const chapterId = req.body?.chapterId;
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
    const result = await streamOpenRouterJSON(req, res, systemPrompt, `Context: ${context}\nChapter ID to target: ${chapterId || "all"}`, undefined, "long-context");
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
        const s = sec as Record<string, unknown>;
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify({
            project_id: project.projectId,
            section_name: s.section || s.section_name || "Untitled Section",
            content: s.content || "",
            status: s.status || "Drafted",
            word_count: typeof s.length === "number" ? s.length : (typeof s.content === "string" ? s.content.split(/\s+/).length : 0)
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

// POST /api/projects/:id/agentic/draft-preview
draftingRoutes.post("/draft-preview", async (req: express.Request<{ id: string }>, res) => {
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
          content = data.map((s: Record<string, unknown>) => `## ${s.section_name || s.section || "Untitled Section"}\n\n${s.content || ""}`).join("\n\n");
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
        const parsed = safeParseAnswerField<Record<string, unknown>[]>(rawDraft, []);
        if (Array.isArray(parsed) && parsed.length > 0) {
          content = parsed.map((s) => `## ${s.section || s.section_name || "Untitled Section"}\n\n${s.content || ""}`).join("\n\n");
          pages = Math.ceil(content.split(/\s+/).length / 250);
        } else if (typeof rawDraft === "string" && rawDraft.trim().length > 0) {
          content = rawDraft;
          pages = Math.ceil(content.split(/\s+/).length / 250);
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
    if (res.writableEnded) return;
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/projects/:id/agent/copilot-chat
draftingRoutes.post("/copilot-chat", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const { stage, message, history = [] } = req.body || {};
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
    // Late stages (Drafting, Editing, Publishing): include document structure/abstract, but omit full heavy manuscript body to save tokens
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

    const result = await callOpenRouterText(req, res, systemPrompt, userPrompt);
    if (!result) return;
    res.json({ ok: true, response: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

// PUT /api/projects/:id/agentic/manuscript
draftingRoutes.put("/manuscript", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();

  try {
    const updates: Array<{ section_name?: string; section?: string; content?: string; status?: string }> =
      Array.isArray(req.body) ? req.body : [req.body];

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
                section_name: (old as Record<string, unknown>).section_name,
                content: (old as Record<string, unknown>).content
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
    const combinedContent = updates.map((s) => s.content || "").join("\n\n");
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

// GET /api/projects/:id/agentic/manuscript
draftingRoutes.get("/manuscript", async (req, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const config = getSupabaseRestConfig();

  try {
    let data: Array<{ section_name: string; content: string; status: string }> = [];

    // 1. Try Supabase if configured
    if (config) {
      try {
        const table = new SupabaseTable(config, "manuscript_sections");
        const sections = await table.request(`?project_id=eq.${project.projectId}&order=id.asc`);
        if (Array.isArray(sections) && sections.length > 0) {
          data = sections as Array<{ section_name: string; content: string; status: string }>;
        }
      } catch (e) {
        console.warn("Could not query Supabase manuscript_sections:", e);
      }
    }

    // 2. Fall back to local projectStore answers (manuscript_draft or assembled_draft)
    if (data.length === 0) {
      const rawDraft = project.answers?.manuscript_draft || project.answers?.assembled_draft;
      if (rawDraft) {
        const parsed = safeParseAnswerField<Record<string, unknown>[]>(rawDraft, []);
        if (Array.isArray(parsed) && parsed.length > 0) {
          data = parsed.map((s) => ({
            section_name: String(s.section || s.section_name || "Section"),
            content: String(s.content || ""),
            status: String(s.status || "Drafted")
          }));
        } else if (typeof rawDraft === "string" && rawDraft.trim().length > 0) {
          data = [{ section_name: "Full Manuscript", content: rawDraft, status: "Drafted" }];
        }
      }
    }

    res.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});
