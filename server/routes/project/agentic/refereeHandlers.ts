import express from "express";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import {
  getProjectSafe,
  executeScholarBrainJSON,
  generateFiveRefereeCritiques,
  generatePointByPointRebuttalMatrix,
  type AcademicCritiqueItem,
  type RebuttalMatrixItem,
  type RefereeRole,
} from "./types.ts";
import { readTypedProjectState } from "../../../../src/shared/projectStateSchema.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../../src/supabaseRest.ts";
import { getCandidates, buildAuthorizedPolicy } from "../../../utils/llm.ts";
import { completeWithFailover } from "../../../../src/platform/gateway/gateway.ts";
import { buildScholarlyVoiceSystemPrompt } from "../../../src/utils/scholarlyVoiceGuard.ts";

export function registerRefereeHandlers(router: express.Router): void {
  // POST /api/projects/:id/agent/peer-review
  router.post("/peer-review", async (req: express.Request<{ id: string }>, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    const context = JSON.stringify(project.answers);

    try {
      const systemPrompt = `You are a 5-Referee Adversarial Peer Review Simulator for an elite scholarly journal.
Critique the manuscript draft provided in the research context. You must generate EXACTLY 5 distinct, rigorous critiques—one from each of the following 5 peer reviewer personas:
1. "Methodologist" (Lens: "Methodological Rigor & Experimental Design"): Evaluate experimental controls, boundary conditions, algorithmic complexity, and procedural threats to validity.
2. "Domain Specialist" (Lens: "Domain Alignment & Literature Grounding"): Evaluate domain framing, theoretical gaps, related literature integration, and novelty in the field.
3. "Biostatistician" (Lens: "Quantitative Rigor & Telemetry Calibration"): Evaluate statistical power, confidence intervals, sample sizes, distribution assumptions, and variance.
4. "Synthesizer" (Lens: "Cross-Source Synthesis & Validity Threats"): Evaluate cross-source synthesis, argument coherence, evidence-claim linkage, and resolution of contradictory evidence.
5. "Formal Editor" (Lens: "Scholarly Voice, Orthography & Standards Compliance"): Evaluate formal tone, terminology consistency, British English orthography, and 2026 ICMJE/COPE declarations.

Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "crit-ref-01",
      "referee": "Methodologist",
      "lens": "Methodological Rigor & Experimental Design",
      "section": "Section 2: Methodology",
      "severity": "Major",
      "feedback": "...",
      "revisionDirective": "..."
    },
    {
      "id": "crit-ref-02",
      "referee": "Domain Specialist",
      "lens": "Domain Alignment & Literature Grounding",
      "section": "Section 1: Introduction",
      "severity": "Moderate",
      "feedback": "...",
      "revisionDirective": "..."
    },
    {
      "id": "crit-ref-03",
      "referee": "Biostatistician",
      "lens": "Quantitative Rigor & Telemetry Calibration",
      "section": "Section 3: Empirical Results",
      "severity": "Major",
      "feedback": "...",
      "revisionDirective": "..."
    },
    {
      "id": "crit-ref-04",
      "referee": "Synthesizer",
      "lens": "Cross-Source Synthesis & Validity Threats",
      "section": "Section 4: Discussion",
      "severity": "Moderate",
      "feedback": "...",
      "revisionDirective": "..."
    },
    {
      "id": "crit-ref-05",
      "referee": "Formal Editor",
      "lens": "Scholarly Voice, Orthography & Standards Compliance",
      "section": "Manuscript-wide & Declarations",
      "severity": "Minor",
      "feedback": "...",
      "revisionDirective": "..."
    }
  ]
}`;
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown>[] }>(
        req,
        res,
        {
          systemPrompt,
          userPrompt: `Context: ${context}`,
          taskType: "long-context",
        }
      );

      let critiquesData: AcademicCritiqueItem[] = [];
      if (result && Array.isArray(result.data) && result.data.length > 0) {
        const defaultReferees: RefereeRole[] = [
          "Methodologist",
          "Domain Specialist",
          "Biostatistician",
          "Synthesizer",
          "Formal Editor",
        ];
        critiquesData = result.data.map((crit: Record<string, unknown>, idx: number) => {
          const refRole = (crit.referee || defaultReferees[idx % defaultReferees.length]) as RefereeRole;
          return {
            id: (crit.id as string) || `crit-ref-0${idx + 1}`,
            referee: refRole,
            lens: (((crit.lens as string) || (crit.category as string) || "Methodological Rigor")).trim(),
            section: (
              (crit.section as string) ||
              (idx === 0
                ? "Section 2: Methodology"
                : idx === 1
                ? "Section 1: Introduction"
                : "Section 3: Results")
            ).trim(),
            severity: (["Critical", "Major", "Moderate", "Minor"].includes(crit.severity as string)
              ? (crit.severity as "Critical" | "Major" | "Moderate" | "Minor")
              : "Moderate"),
            feedback: (((crit.feedback as string) || "Detailed feedback pending reviewer expansion.")).trim(),
            revisionDirective: (((crit.revisionDirective as string) || "Revise manuscript section accordingly.")).trim(),
            waived: false,
          };
        });
      } else {
        critiquesData = generateFiveRefereeCritiques(project);
      }

      // Insert into Supabase peer_review_critiques with strict lens and feedback validation
      const config = getSupabaseRestConfig();
      if (config) {
        try {
          const table = new SupabaseTable(config, "peer_review_critiques");
          for (const crit of critiquesData) {
            await table.request("", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                project_id: project.projectId,
                lens: crit.lens,
                feedback: crit.feedback,
                severity: crit.severity,
                waived: false,
              }),
            });
          }
        } catch (e) {
          console.warn("Could not insert into Supabase peer_review_critiques:", e);
        }
      }

      // Always persist into project answers so it is retained even if Supabase is offline
      const nextAnswers = {
        ...project.answers,
        peer_review_critiques: JSON.stringify(critiquesData),
        peer_review_completed: "true",
        peer_review_status: "ready",
        peer_review_sealed_at: new Date().toISOString(),
      };
      await getProjectStore().save({ ...project, answers: nextAnswers });

      res.write(`event: done\ndata: ${JSON.stringify({ ok: true, data: critiquesData })}\n\n`);
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

  // POST /api/projects/:id/agent/rebuttal-matrix
  router.post("/rebuttal-matrix", async (req: express.Request<{ id: string }>, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;

    try {
      let matrix: RebuttalMatrixItem[] = [];
      let critiques: AcademicCritiqueItem[] = [];

      if (req.body?.matrix && Array.isArray(req.body.matrix)) {
        matrix = req.body.matrix;
      } else {
        if (req.body?.critiques && Array.isArray(req.body.critiques)) {
          critiques = req.body.critiques;
        } else {
          const typedState = readTypedProjectState(project);
          if (typedState.peer_review_critiques.length > 0) {
            critiques = typedState.peer_review_critiques as unknown as AcademicCritiqueItem[];
          }
        }

        if (critiques.length === 0) {
          critiques = generateFiveRefereeCritiques(project);
        }

        // Generate Point-by-Point Rebuttal Matrix
        matrix = generatePointByPointRebuttalMatrix(critiques, project);
      }

      // If live AI is available and not in test mode, enrich author responses and diffs
      const candidates = getCandidates(req);
      const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

      if (candidates.length > 0 && !isTest) {
        try {
          const systemPrompt = `${buildScholarlyVoiceSystemPrompt({ discipline: "Peer Review Rebuttal Synthesis" })}
You are an expert principal investigator composing a Point-by-Point Author Rebuttal Letter and Revision Matrix responding to peer reviewers.
For each referee critique provided, formulate an authoritative, respectful, and evidence-grounded Author Response and Manuscript Revision Action with find/replace diffs.
Return ONLY valid JSON matching this schema:
{
  "matrix": [
    {
      "id": "string",
      "referee": "Methodologist" | "Domain Specialist" | "Biostatistician" | "Synthesizer" | "Formal Editor",
      "lens": "string",
      "section": "string",
      "critique": "string",
      "severity": "Major" | "Moderate" | "Minor",
      "authorResponse": "string",
      "revisionAction": "string",
      "diff": { "find": "string", "replace": "string" },
      "status": "addressed"
    }
  ]
}`;
          const response = await completeWithFailover(
            {
              taskClass: "verification",
              systemPrompt,
              userPrompt: `Generate structured point-by-point rebuttal matrix for these peer critiques:\n${JSON.stringify(critiques)}`,
              responseFormat: "json",
              segments: [{ label: "critiques", text: JSON.stringify(critiques) }],
            },
            { candidates },
            buildAuthorizedPolicy(candidates)
          );

          if (response.ok && response.value?.text) {
            const raw = response.value.text.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.matrix) && parsed.matrix.length > 0) {
              matrix = parsed.matrix;
            }
          }
        } catch (aiErr) {
          console.warn("AI rebuttal matrix generation note:", aiErr);
        }
      }

      // Derive revision patches from matrix diffs
      const patches = matrix
        .filter((item) => item.diff && item.diff.find && item.diff.replace)
        .map((item, idx) => ({
          id: `patch-${idx + 1}`,
          section: item.section || "Methodology",
          critiqueLens: item.lens,
          severity: item.severity,
          find: item.diff!.find,
          replace: item.diff!.replace,
          explanation: item.revisionAction,
          accepted: true,
        }));

      // Persist in project answers
      const nextAnswers = {
        ...project.answers,
        rebuttal_matrix: JSON.stringify(matrix),
        peer_review_critiques: JSON.stringify(critiques),
        revision_patches: JSON.stringify(patches),
        rebuttal_completed: "true",
        rebuttal_sealed_at: new Date().toISOString(),
      };
      await getProjectStore().save({ ...project, answers: nextAnswers });

      res.json({
        ok: true,
        count: matrix.length,
        data: {
          matrix,
          patches,
          totalCritiques: critiques.length,
          addressedCount: matrix.filter((m) => m.status === "addressed").length,
          status: "Point-by-Point Rebuttal Matrix Synced",
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/:id/agent/rebuttal-matrix
  router.get("/rebuttal-matrix", async (req: express.Request<{ id: string }>, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;

    try {
      const typedState = readTypedProjectState(project);
      let matrix: RebuttalMatrixItem[] = typedState.rebuttal_matrix as unknown as RebuttalMatrixItem[];

      if (matrix.length === 0) {
        let critiques: AcademicCritiqueItem[] = typedState.peer_review_critiques as unknown as AcademicCritiqueItem[];
        if (critiques.length === 0) {
          critiques = generateFiveRefereeCritiques(project);
        }
        matrix = generatePointByPointRebuttalMatrix(critiques, project);
      }

      res.json({ ok: true, data: matrix });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
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
      const result = await executeScholarBrainJSON<{ data: Record<string, unknown> }>(
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

  // PUT /api/projects/:id/agent/critiques/:critiqueId/waive
  router.put("/critiques/:critiqueId/waive", async (req, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    const config = getSupabaseRestConfig();

    try {
      if (config) {
        try {
          const table = new SupabaseTable(config, "peer_review_critiques");
          await table.request(`?id=eq.${req.params.critiqueId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ waived: true })
          });
        } catch (e) {
          console.warn("Could not waive critique in Supabase:", e);
        }
      }

      // Also update project.answers.peer_review_critique locally if present
      if (project.answers?.peer_review_critique) {
        try {
          const critiques = JSON.parse(project.answers.peer_review_critique);
          if (Array.isArray(critiques)) {
            const updated = critiques.map((c: Record<string, unknown>) => c.id === req.params.critiqueId ? { ...c, waived: true } : c);
            await getProjectStore().save({
              ...project,
              answers: { ...project.answers, peer_review_critique: JSON.stringify(updated) }
            });
          }
        } catch (_) {}
      }

      res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/:id/agent/critiques
  router.get("/critiques", async (req, res) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    const config = getSupabaseRestConfig();

    try {
      let data: Record<string, unknown>[] = [];
      if (config) {
        try {
          const table = new SupabaseTable(config, "peer_review_critiques");
          const resData = await table.request(`?project_id=eq.${project.projectId}`);
          if (Array.isArray(resData)) data = resData as Record<string, unknown>[];
        } catch (e) {
          console.warn("Could not query Supabase peer_review_critiques:", e);
        }
      }
      if (data.length === 0 && project.answers?.peer_review_critique) {
        try {
          const parsed = JSON.parse(project.answers.peer_review_critique);
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
