import express from "express";
import { getSupabaseRestConfig, SupabaseTable } from "../../../src/supabaseRest.ts";
import { normalizeUnicodeNFC } from "../../../src/utils/scholarlyVoiceGuard.ts";
import { safeParseAnswerField } from "../../../../src/shared/projectStateSchema.ts";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import { getProjectSafe, patchProjectAnswers, userUpload } from "./helpers.ts";
import type { UserDatasetRecord } from "./types.ts";

export const evidenceRoutes = express.Router({ mergeParams: true });

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
      // No stand-in name: an unnamed dataset is the author's own, and is cited as such.
      const author = (req.body?.author as string | undefined)?.trim() || "";
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
        if (!title) title = "Untitled field notes";
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
      await patchProjectAnswers(project, { user_datasets: JSON.stringify(existingDatasets) });

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
    await patchProjectAnswers(project, { user_datasets: JSON.stringify(datasets) });

    res.json({ ok: true, dataset: existing });
  }
);
