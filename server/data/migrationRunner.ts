import fs from "fs";
import path from "path";
import { getDataLayerConfig } from "./config";
import { query, withTransaction } from "./db";

async function ensureMigrationTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runMigrations(): Promise<string[]> {
  const { migrationsPath } = getDataLayerConfig();
  if (!fs.existsSync(migrationsPath)) {
    return [];
  }

  await ensureMigrationTable();
  const applied = await query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version ASC");
  const appliedVersions = new Set(applied.rows.map((row) => row.version));
  const files = fs
    .readdirSync(migrationsPath)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const appliedNow: string[] = [];

  for (const file of files) {
    const version = path.basename(file, ".sql");
    if (appliedVersions.has(version)) continue;
    const sql = fs.readFileSync(path.join(migrationsPath, file), "utf-8");
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
    });
    appliedNow.push(version);
  }

  return appliedNow;
}

