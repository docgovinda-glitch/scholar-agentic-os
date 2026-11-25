/**
 * Finds duplicate project rows (same owner, format and title) and, with --apply,
 * deletes the BLANK ones. A row with any content is never deleted; groups that
 * hold more than one row with content are only reported for manual review.
 *
 *   npx tsx scripts/dedupe-blank-projects.ts           # dry run, deletes nothing
 *   npx tsx scripts/dedupe-blank-projects.ts --apply   # deletes the blank clones
 *
 * Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment and
 * never prints them. Point it at a local or staging project first.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { isBlankProject } from "../src/desk/projectNaming";

dotenv.config();

interface Row {
  project_id: string;
  owner_id: string | null;
  output_type_id: string | null;
  answers: Record<string, unknown> | null;
  document: Record<string, unknown> | null;
  updated_at: string | null;
}

const apply = process.argv.includes("--apply");
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const hasContent = (r: Row) =>
  !isBlankProject({
    answers: (r.answers ?? {}) as Record<string, unknown>,
    hasDocument: !!r.document && Object.keys(r.document).length > 0,
    outputTypeId: r.output_type_id ?? undefined,
  });

async function main() {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("projects")
      .select("project_id, owner_id, output_type_id, answers, document, updated_at")
      .order("updated_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const title = typeof r.answers?.title === "string" ? r.answers.title.trim().toLowerCase() : "";
    if (!title) continue; // untitled drafts are numbered separately in the UI
    const k = `${r.owner_id}|${r.output_type_id}|${title}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const toDelete: string[] = [];
  let review = 0;
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const withContent = list.filter(hasContent);
    const blanks = list.filter((r) => !hasContent(r));
    // Keep one row: the newest with content, else the newest overall.
    const keep = withContent[0] ?? list[0];
    const doomed = blanks.filter((r) => r.project_id !== keep.project_id);
    if (withContent.length > 1) review++;
    console.log(
      `${k.split("|").slice(1).join(" | ")}: ${list.length} rows, keep ${keep.project_id}, ` +
        `delete ${doomed.length} blank${withContent.length > 1 ? `, ${withContent.length} have content (manual review)` : ""}`
    );
    toDelete.push(...doomed.map((r) => r.project_id));
  }

  console.log(`\n${rows.length} projects scanned. ${toDelete.length} blank duplicates, ${review} groups need manual review.`);
  if (!apply) {
    console.log("Dry run: nothing deleted. Re-run with --apply to delete the blank duplicates.");
    return;
  }
  for (let i = 0; i < toDelete.length; i += 100) {
    const { error } = await supabase.from("projects").delete().in("project_id", toDelete.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
  console.log(`Deleted ${toDelete.length} rows.`);
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
