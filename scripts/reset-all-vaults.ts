import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

async function resetWithPostgres(dbUrl: string): Promise<boolean> {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("Connected to PostgreSQL via DATABASE_URL.");
    await client.query("DELETE FROM public.user_vault_items WHERE true;");
    await client.query("DELETE FROM public.user_cloud_integrations WHERE true;");
    await client.query("DELETE FROM public.user_vaults WHERE true;");
    console.log("Successfully wiped all vault records in PostgreSQL.");
    return true;
  } catch (err: any) {
    console.error("PostgreSQL reset error:", err.message);
    return false;
  } finally {
    await client.end();
  }
}

async function resetWithSupabaseRest(supabaseUrl: string, serviceKey: string): Promise<boolean> {
  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log("Connected to Supabase via Service Role REST API.");

    // Delete all user_vault_items
    const { error: itemsErr } = await supabase.from("user_vault_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (itemsErr) console.warn("Notice for user_vault_items:", itemsErr.message);

    // Delete all user_cloud_integrations
    const { error: cloudErr } = await supabase.from("user_cloud_integrations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (cloudErr) console.warn("Notice for user_cloud_integrations:", cloudErr.message);

    // Delete all user_vaults
    const { error: vaultsErr } = await supabase.from("user_vaults").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");
    if (vaultsErr) console.warn("Notice for user_vaults:", vaultsErr.message);

    console.log("Successfully wiped all vault records in Supabase.");
    return true;
  } catch (err: any) {
    console.error("Supabase REST reset error:", err.message);
    return false;
  }
}

async function main() {
  console.log("Starting Knowledge Vault reset for all users...");
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (dbUrl) {
    const ok = await resetWithPostgres(dbUrl);
    if (ok) {
      console.log("Done. All users will now start with a fresh Knowledge Vault onboarding flow.");
      process.exit(0);
    }
  }

  if (supabaseUrl && serviceKey) {
    const ok = await resetWithSupabaseRest(supabaseUrl, serviceKey);
    if (ok) {
      console.log("Done. All users will now start with a fresh Knowledge Vault onboarding flow.");
      process.exit(0);
    }
  }

  console.error(
    "Error: Could not find database connection credentials (DATABASE_URL or VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).\n" +
    "You can run the SQL script manually in the Supabase SQL Editor:\n\n" +
    "  DELETE FROM public.user_vault_items WHERE true;\n" +
    "  DELETE FROM public.user_cloud_integrations WHERE true;\n" +
    "  DELETE FROM public.user_vaults WHERE true;\n"
  );
  process.exit(1);
}

main();
