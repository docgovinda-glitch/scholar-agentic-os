import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Extracts all `public.<table_name>` columns defined across `supabase/*.sql`
 * and `supabase/migrations/*.sql` (`CREATE TABLE` and `ALTER TABLE ... ADD COLUMN`).
 */
function loadRepoSchemaTableColumns(): Map<string, Set<string>> {
  const tableColumns = new Map<string, Set<string>>();
  const sqlFiles = [
    ...fs
      .readdirSync(path.resolve(process.cwd(), "supabase"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => `supabase/${f}`),
    ...fs
      .readdirSync(path.resolve(process.cwd(), "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => `supabase/migrations/${f}`),
  ];

  // Seed baseline projects table (defined in pgProjectStore.ts / restProjectStore.ts)
  tableColumns.set(
    "projects",
    new Set(["project_id", "owner_id", "title", "output_type", "created_at", "updated_at", "state"])
  );

  for (const relPath of sqlFiles) {
    const fullPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) continue;
    const raw = fs
      .readFileSync(fullPath, "utf8")
      .replace(/--[^\n]*/g, "");

    const createStartRegex =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = createStartRegex.exec(raw)) !== null) {
      const tableName = match[1].toLowerCase();
      let depth = 1;
      let idx = match.index + match[0].length;
      while (idx < raw.length && depth > 0) {
        if (raw[idx] === "(") depth++;
        else if (raw[idx] === ")") depth--;
        idx++;
      }
      const body = raw.slice(match.index + match[0].length, idx - 1);
      const cols = tableColumns.get(tableName) ?? new Set<string>();
      // Split top-level comma-separated column definitions
      let colDepth = 0;
      let current = "";
      const definitions: string[] = [];
      for (const ch of body) {
        if (ch === "(") colDepth++;
        else if (ch === ")") colDepth--;
        if (ch === "," && colDepth === 0) {
          definitions.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
      if (current.trim()) definitions.push(current);

      for (const rawDef of definitions) {
        const line = rawDef.trim();
        if (!line) continue;
        if (/^(primary\s+key|foreign\s+key|unique|check|constraint)\b/i.test(line)) continue;
        const colMatch = line.match(/^"?([a-zA-Z0-9_]+)"?\s+[a-zA-Z0-9_]/);
        if (colMatch) {
          cols.add(colMatch[1].toLowerCase());
        }
      }
      tableColumns.set(tableName, cols);
    }

    const alterRegex =
      /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)/gi;
    while ((match = alterRegex.exec(raw)) !== null) {
      const tableName = match[1].toLowerCase();
      const colName = match[2].toLowerCase();
      const cols = tableColumns.get(tableName) ?? new Set<string>();
      cols.add(colName);
      tableColumns.set(tableName, cols);
    }
  }

  return tableColumns;
}

describe("SQL Runbooks & Hotfix Migrations — Schema & Column Verification", () => {
  const tableColumns = loadRepoSchemaTableColumns();

  it("verifies all public.* tables and columns referenced in COMPROMISE_CHECKS.md, PROD_CHECKS.md, and HOTFIX_DEPLOY.md exist in the repo schema", () => {
    const expectedTableColumns: Record<string, string[]> = {
      admin_users: ["user_id", "scopes", "granted_by", "granted_at", "note"],
      admin_audit_log: ["id", "admin_id", "action", "target_type", "target_id", "details", "created_at"],
      profiles: ["id", "username", "full_name", "phone", "phone_country_code", "phone_e164", "affiliation", "user_type", "education_level", "account_status", "created_at", "updated_at"],
      credit_balances: ["user_id", "balance", "daily_used", "daily_reset_at", "monthly_used", "monthly_reset_at", "updated_at"],
      credit_ledger: ["id", "user_id", "delta", "reason", "request_id", "note", "created_at"],
      user_entitlements: ["user_id", "plan_id", "status", "start_date", "expiry", "granted_by", "updated_at"],
      ai_usage_ledger: ["id", "user_id", "provider_id", "model_id", "tier", "task_type", "input_tokens", "output_tokens", "provider_cost_usd", "scholar_credits_charged", "request_id", "status", "created_at"],
      premium_requests: ["id", "user_id", "status"],
      project_files: ["id", "project_id", "filename", "storage_path", "size_bytes", "mime_type", "uploaded_at"],
      manuscript_versions: ["project_id", "section_name", "created_at"],
      peer_review_critiques: ["id", "project_id", "lens", "severity", "waived", "created_at"],
      api_credentials: ["user_id", "provider", "encrypted_api_key", "api_key_hash", "updated_at"],
      user_cloud_integrations: ["user_id", "provider", "access_token", "refresh_token"],
      project_research_gaps: ["id", "project_id"],
      project_titles: ["id", "project_id"],
      project_journal_candidates: ["id", "project_id"],
    };

    for (const [table, cols] of Object.entries(expectedTableColumns)) {
      const schemaCols = tableColumns.get(table);
      expect(schemaCols, `Table public.${table} must exist in repo schema`).toBeDefined();
      for (const col of cols) {
        expect(
          schemaCols!.has(col),
          `Column public.${table}.${col} must exist in repo schema (found: ${[...schemaCols!].join(", ")})`
        ).toBe(true);
      }
    }
  });

  it("ensures COMPROMISE_CHECKS.md, PROD_CHECKS.md, and HOTFIX_DEPLOY.md do not reference any non-existent column names", () => {
    const docs = [
      "COMPROMISE_CHECKS.md",
      "PROD_CHECKS.md",
      "HOTFIX_DEPLOY.md",
      "HOTFIX2_DEPLOY.md",
    ];

    const forbiddenPatterns = [
      "au.is_active",
      "au.notes",
      "au.created_at",
      "cb.balance_credits",
      "cb.lifetime_granted_credits",
      "cb.lifetime_used_credits",
      "cl.delta_credits",
      "ue.grant_reason",
      "ue.starts_at",
      "ue.expires_at",
      "pf.file_name",
      "pf.file_size",
      "pf.created_at",
      "actor_id",
      "waiver_reason",
    ];

    for (const doc of docs) {
      const content = fs.readFileSync(path.resolve(process.cwd(), doc), "utf8");
      for (const bad of forbiddenPatterns) {
        expect(content, `${doc} must not contain invalid column reference '${bad}'`).not.toContain(bad);
      }
    }
  });

  it("verifies 20261028010000_purge_plaintext_credentials.sql deletes plaintext rows in api_credentials and user_cloud_integrations", () => {
    const purgeSql = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261028010000_purge_plaintext_credentials.sql"),
      "utf8"
    );
    expect(purgeSql).toContain("DELETE FROM public.api_credentials");
    expect(purgeSql).toContain("DELETE FROM public.user_cloud_integrations");
    expect(purgeSql).toContain("DROP POLICY IF EXISTS \"Users can view own cloud integrations\" ON public.user_cloud_integrations;");
  });
});
