import express from "express";
import { createClient } from "@supabase/supabase-js";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../src/supabaseRest.ts";
import { createUploadInstance } from "../../src/middleware/uploadGuard.ts";
import { loadOwnedProject } from "./core/projectHelpers.ts";

export const filesRouter = express.Router({ mergeParams: true });

const upload = createUploadInstance({ enforceHeavyParseLimit: false });

filesRouter.get("/", async (req: express.Request<{ id: string }>, res) => {
  const projectId = req.params.id;
  const store = getProjectStore();
  const project = await loadOwnedProject(store, req, res);
  if (!project) return;

  const config = getSupabaseRestConfig();
  if (config) {
    try {
      const table = new SupabaseTable(config, "project_files");
      const data = await table.request(`?project_id=eq.${encodeURIComponent(projectId)}&order=uploaded_at.desc`, { method: "GET" });
      return res.json({ data });
    } catch (err) {
      console.error("Failed to fetch files:", err);
      return res.json({ data: [] });
    }
  }

  res.json({ data: [] });
});

filesRouter.post(
  "/",
  async (req: express.Request<{ id: string }>, res, next) => {
    const project = await loadOwnedProject(getProjectStore(), req, res);
    if (!project) return;
    next();
  },
  upload.single("file"),
  async (req: express.Request<{ id: string }>, res) => {
    const projectId = req.params.id;

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

  const config = getSupabaseRestConfig();
  if (!config) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  try {
    const supabase = createClient(config.supabaseUrl, config.serviceRoleKey);
    
    // Generate a unique storage path for the file
    const fileExt = file.originalname.split('.').pop() || '';
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const storagePath = `${projectId}/${Date.now()}_${safeName}`;
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("project-files")
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return res.status(500).json({ error: "Failed to upload file to storage" });
    }

    // Insert into project_files table
    const table = new SupabaseTable(config, "project_files");
    const insertData = {
      project_id: projectId,
      filename: file.originalname,
      storage_path: storagePath,
      size_bytes: file.size,
      mime_type: file.mimetype,
    };
    
    const inserted = await table.request("", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(insertData)
    });

    return res.status(201).json({ data: (inserted as any)[0] || insertData });
  } catch (err) {
    console.error("Failed to process file upload:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
