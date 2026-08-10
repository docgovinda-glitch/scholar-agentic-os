/**
 * Seeds public.ai_providers / public.ai_models from the existing runtime
 * catalogs (src/config/providerCatalog.ts, src/config/localRunnerCatalog.ts)
 * — deliberately NOT a second, hand-maintained copy of provider data. The
 * catalogs stay the single source of truth for request-shape details
 * (baseUrl, chatPath, apiStyle) that the AI Gateway needs at runtime; this
 * script projects them into the DB-backed registry the Admin AI
 * Infrastructure panel and Model Registry (Section 6) read from, so the two
 * never drift apart the way the pre-providerCatalog.ts code once did.
 *
 * Safe to re-run: every write is an upsert on each table's primary key.
 * Run manually after schema_ai_engine.sql:
 *
 *   npx tsx scripts/seedAiRegistry.ts
 *
 * Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment (same variables the running server uses).
 */

import { CLOUD_PROVIDERS } from "../src/config/providerCatalog";
import { LOCAL_RUNNERS } from "../src/config/localRunnerCatalog";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  process.exit(1);
}

async function upsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetch(`${SUPABASE_URL!.replace(/\/+$/, "")}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${table} upsert failed: ${res.status} ${detail.slice(0, 500)}`);
  }
}

async function main() {
  const providerRows = [
    ...CLOUD_PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      category: "byok" as const, // Section 2 category; Free-vs-Paid is per-provider, already captured in free_tier_kind below.
      api_style: p.apiStyle,
      base_url: p.baseUrl,
      docs_url: p.getKeyUrl,
      free_tier_kind: p.freeTier,
      free_tier_note: p.freeTierNote,
      metadata: { chatPath: p.chatPath, modelsPath: p.modelsPath, defaultModel: p.defaultModel, icon: p.icon, color: p.color },
    })),
    ...LOCAL_RUNNERS.map((r) => ({
      id: r.id,
      name: r.name,
      category: "local" as const,
      api_style: r.apiStyle,
      base_url: r.defaultEndpoint,
      docs_url: r.installUrl,
      free_tier_kind: null,
      free_tier_note: null,
      metadata: { healthPath: r.healthPath, difficulty: r.difficulty, hasGui: r.hasGui, icon: r.icon },
    })),
  ];

  await upsert("ai_providers", providerRows);
  console.log(`Upserted ${providerRows.length} providers.`);

  const modelRows = CLOUD_PROVIDERS.flatMap((p) =>
    p.models.map((modelId) => ({
      id: `${p.id}:${modelId}`,
      provider_id: p.id,
      model_id: modelId,
      display_name: modelId,
      // Suggestions carried over as-is — providerCatalog.ts's own header
      // notes these are not authoritative; the live "refresh models" call
      // is still how the actual current list is confirmed per provider.
      free_eligible: p.freeTier === "free" || p.freeTier === "freemium",
      capabilities: {},
      modalities: ["text"],
    }))
  );

  await upsert("ai_models", modelRows);
  console.log(`Upserted ${modelRows.length} models.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
