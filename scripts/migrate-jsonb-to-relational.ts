import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
  console.log("Starting JSONB to Relational Migration...");

  const { data: projects, error } = await supabase.from("projects").select("project_id, answers");
  
  if (error) {
    console.error("Error fetching projects:", error);
    process.exit(1);
  }

  for (const project of projects) {
    console.log(`Migrating project ${project.project_id}...`);
    const answers = project.answers || {};

    // 1. Migrate Manuscript Draft
    const draftStr = answers.manuscript_draft;
    if (draftStr) {
      try {
        const sections = JSON.parse(draftStr);
        if (Array.isArray(sections)) {
          for (const sec of sections) {
            await supabase.from("manuscript_sections").upsert({
              project_id: project.project_id,
              section_name: sec.section,
              content: sec.content || "",
              status: sec.status || "Drafted",
              word_count: sec.length || 0,
            }, { onConflict: "project_id, section_name" });
          }
        }
      } catch (e) {
        console.warn(`Failed to parse manuscript_draft for project ${project.project_id}`);
      }
    }

    // 2. Migrate Peer Review Critique
    const critiqueStr = answers.peer_review_critique;
    if (critiqueStr) {
      try {
        const critiques = JSON.parse(critiqueStr);
        if (Array.isArray(critiques)) {
          for (const crit of critiques) {
            const lens = (crit.lens || crit.category || crit.aspect || crit.type || crit.title || "Methodological Rigor").trim();
            const feedback = (crit.feedback || crit.description || crit.critique || crit.summary || "Pending feedback").trim();
            const severity = crit.severity || "Moderate";
            await supabase.from("peer_review_critiques").insert({
              project_id: project.project_id,
              lens,
              feedback,
              severity,
            });
          }
        }
      } catch (e) {
        console.warn(`Failed to parse peer_review_critique for project ${project.project_id}`);
      }
    }

    // 3. Migrate Evidence
    const evidenceStr = answers.extracted_evidence;
    if (evidenceStr) {
      try {
        const evidence = JSON.parse(evidenceStr);
        if (Array.isArray(evidence)) {
          for (const ev of evidence) {
            await supabase.from("project_evidence").insert({
              project_id: project.project_id,
              quote: ev.quote || "",
              claim_type: ev.claim_type || "",
              strength: ev.strength || "",
              tags: ev.tags || [],
            });
          }
        }
      } catch (e) {
        console.warn(`Failed to parse extracted_evidence for project ${project.project_id}`);
      }
    }

    console.log(`Completed project ${project.project_id}.`);
  }

  console.log("Migration finished successfully.");
}

migrate();
