import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const dir = path.resolve(__dirname, "../../supabase/migrations");
const read = (name: string) => fs.readFileSync(path.join(dir, name), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("Coursework relational tables: RLS (fail closed, owner read only)", () => {
  const base = read("20261113180000_coursework_relational_state.sql");
  const fix = read("20261114090000_assignment_owner_read.sql");
  const tables = ["assignment_projects", "assignment_files", "assignment_outline_sections", "assignment_draft_revisions", "assignment_submission_checks"];

  it("enables RLS on every table and never grants the browser writes", () => {
    for (const t of tables) expect(base).toContain(t);
    expect(base).toMatch(/enable row level security/);
    for (const sql of [base, fix]) expect(code(sql)).not.toMatch(/\bfor (insert|update|delete|all)\b/i);
    expect(base).toMatch(/drop policy if exists "Users can view and manage their own assignment projects"/);
  });

  it("checks ownership with a narrow security-definer function pinned to the public schema", () => {
    expect(fix).toMatch(/create or replace function public\.owns_project\(p_project_id text\)\s+returns boolean/);
    expect(fix).toMatch(/security definer/);
    expect(fix).toMatch(/set search_path = public/);
    expect(fix).toMatch(/owner_id = auth\.uid\(\)/);
    expect(fix).toMatch(/revoke all on function public\.owns_project\(text\) from public/);
    expect(fix).toMatch(/for select to authenticated using \(public\.owns_project\(project_id\)\)/);
    expect(read("20261114093000_owns_project_no_anon.sql")).toMatch(/revoke execute on function public\.owns_project\(text\) from anon/);
    expect(read("20261114093000_owns_project_no_anon.sql")).toMatch(/revoke execute on function public\.owns_project\(text\) from anon/);
  });
});
