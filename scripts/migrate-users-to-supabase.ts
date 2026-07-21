/**
 * One-off migration: users.json -> Supabase (Phase 1, docs/planning/hosting-and-topology.md).
 *
 * Run manually, once, after creating a Supabase project and running
 * supabase/schema.sql:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... [ENCRYPTION_KEY=...] npx tsx scripts/migrate-users-to-supabase.ts
 *
 * Requires the SERVICE ROLE key (bypasses RLS + can create auth users
 * directly) — never put this key in a VITE_-prefixed env var or ship it
 * client-side.
 *
 * Important, unavoidable limitation: existing users' passwords cannot be
 * carried over. users.json only ever stored an opaque client-computed hash
 * (passcodeHash), never a real plaintext password Supabase Auth could hash
 * itself. Each migrated user is created with a random temporary password
 * and immediately issued a real Supabase password-recovery link — send
 * that link to the user so they can set a password they actually know.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_JSON_PATH = path.join(__dirname, "..", "users.json");

interface LegacyUserRecord {
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  affiliation: string;
  authenticId?: string;
  is_approved: boolean;
  modelPreferences?: Record<string, unknown>;
  encryptedApiKeys?: Record<string, string>;
}

const IV_LENGTH = 16;

/** Decrypts a value produced by server.ts's old encryptServerKey (AES-256-CBC), so it can be re-stored (unencrypted, per the open question noted in supabaseAuthService.ts) in the new api_credentials table. Only runs if ENCRYPTION_KEY is provided — otherwise those keys are skipped with a warning, not guessed at. */
function decryptLegacyKey(value: string, encryptionKey: string): string | null {
  try {
    const cipherKey = Buffer.alloc(32);
    cipherKey.write(encryptionKey, "utf-8");
    const [ivHex, ...rest] = value.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(rest.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", cipherKey, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
  } catch {
    return null;
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const legacyEncryptionKey = process.env.ENCRYPTION_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables. Aborting.");
    process.exit(1);
  }

  if (!fs.existsSync(USERS_JSON_PATH)) {
    console.log("No users.json found at repo root — nothing to migrate.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const raw = JSON.parse(fs.readFileSync(USERS_JSON_PATH, "utf-8"));
  const users: LegacyUserRecord[] = raw.users || [];

  console.log(`Found ${users.length} user(s) in users.json to migrate.`);

  for (const user of users) {
    console.log(`\n--- Migrating "${user.username}" ---`);

    const tempPassword = crypto.randomBytes(24).toString("base64url");

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        username: user.username,
        full_name: user.fullName,
        phone: user.phone || "",
        affiliation: user.affiliation,
        authentic_id: user.authenticId || "None",
      },
    });

    if (createError || !created.user) {
      console.error(`  FAILED to create auth user: ${createError?.message}`);
      continue;
    }

    // The on_auth_user_created trigger (supabase/schema.sql) already created
    // a profiles row with is_approved = false — update it to match the
    // legacy record's actual approval state.
    const { error: approvalError } = await supabase
      .from("profiles")
      .update({
        is_approved: user.is_approved,
        model_preferences: user.modelPreferences ?? null,
      })
      .eq("id", created.user.id);

    if (approvalError) {
      console.error(`  Created auth user but failed to sync profile: ${approvalError.message}`);
    }

    if (user.encryptedApiKeys && Object.keys(user.encryptedApiKeys).length > 0) {
      if (!legacyEncryptionKey) {
        console.warn(
          `  ${user.username} has ${Object.keys(user.encryptedApiKeys).length} stored API key(s), but ENCRYPTION_KEY wasn't provided — skipping, cannot decrypt.`
        );
      } else {
        for (const [provider, encryptedValue] of Object.entries(user.encryptedApiKeys)) {
          const decrypted = decryptLegacyKey(encryptedValue, legacyEncryptionKey);
          if (!decrypted) {
            console.warn(`  Could not decrypt stored key for provider "${provider}" — skipping.`);
            continue;
          }
          const { error: keyError } = await supabase.from("api_credentials").upsert({
            user_id: created.user.id,
            provider,
            encrypted_api_key: decrypted,
            api_key_hash: crypto.createHash("sha256").update(decrypted).digest("hex"),
          });
          if (keyError) console.warn(`  Failed to store migrated key for "${provider}": ${keyError.message}`);
        }
      }
    }

    const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: user.email,
    });

    if (linkError) {
      console.warn(`  Migrated, but failed to generate a password-set link: ${linkError.message}`);
    } else {
      console.log(`  Migrated. Send this password-set link to ${user.email}:`);
      console.log(`  ${link.properties.action_link}`);
    }
  }

  console.log("\nDone. This script does not modify or delete users.json — verify in the Supabase dashboard before retiring it.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
