/**
 * Re-wraps the content keys of every saved user key (`public.user_provider_keys`)
 * from OLD_MASTER_KEY to NEW_MASTER_KEY in one PostgreSQL transaction. Run it
 * BEFORE you change MASTER_KEY on the server: after the change, any row still
 * wrapped under the old key can no longer be read and that user's saved keys
 * stop syncing.
 *
 * Safety:
 * - Dry-run by default: every row is unwrapped and checked in memory, nothing is written.
 * - `--execute` writes inside one BEGIN ... COMMIT, so a partial re-wrap is impossible.
 * - A row that the OLD key cannot read is never touched. `--execute` refuses to run
 *   while any such row exists, unless you pass `--skip-unreadable` (those rows stay
 *   unreadable, as they already were).
 * - Prints counts only: never a key, a provider id or a user id.
 *
 * Usage:
 *   OLD_MASTER_KEY="<old-b64-or-hex>" NEW_MASTER_KEY="<new-b64>" DATABASE_URL="<pg-url>" \
 *     npx tsx scripts/rewrap-user-keys.ts            # dry run
 *   ... npx tsx scripts/rewrap-user-keys.ts --execute [--skip-unreadable]
 */
import pg from "pg";
import { rewrapKeyRow } from "../server/src/aiEngine/rewrapKeys.ts";
import type { EncryptedPayload } from "../src/services/crypto/types.ts";

function parseMasterKey(envName: string): Buffer {
  const raw = process.env[envName]?.trim();
  if (!raw) throw new Error(`Missing required environment variable: ${envName}`);
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`${envName} must decode to exactly 32 bytes (got ${buf.length} bytes).`);
  return buf;
}

interface Row {
  user_id: string;
  provider_id: string;
  encrypted_cek: EncryptedPayload;
  encrypted_key: EncryptedPayload;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const execute = args.has("--execute");
  const skipUnreadable = args.has("--skip-unreadable");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("Missing required environment variable: DATABASE_URL");
  const oldKey = parseMasterKey("OLD_MASTER_KEY");
  const newKey = parseMasterKey("NEW_MASTER_KEY");

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Row>(
      "SELECT user_id, provider_id, encrypted_cek, encrypted_key FROM public.user_provider_keys FOR UPDATE"
    );

    let readable = 0;
    let unreadable = 0;
    const updates: Array<{ row: Row; cek: EncryptedPayload }> = [];
    for (const row of rows) {
      const outcome = rewrapKeyRow(row, oldKey, newKey);
      if (outcome.status === "ok") {
        readable += 1;
        updates.push({ row, cek: outcome.encrypted_cek });
      } else {
        unreadable += 1;
      }
    }

    if (execute && unreadable > 0 && !skipUnreadable) {
      throw new Error(`${unreadable} row(s) cannot be read with OLD_MASTER_KEY. Check the key, or pass --skip-unreadable to leave those rows as they are.`);
    }

    let updated = 0;
    if (execute) {
      for (const { row, cek } of updates) {
        await client.query(
          "UPDATE public.user_provider_keys SET encrypted_cek = $1::jsonb, updated_at = now() WHERE user_id = $2 AND provider_id = $3",
          [JSON.stringify(cek), row.user_id, row.provider_id]
        );
        updated += 1;
      }
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
    console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", totalRows: rows.length, readableWithOldKey: readable, unreadableWithOldKey: unreadable, updatedRows: updated }));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    oldKey.fill(0);
    newKey.fill(0);
    await client.end();
  }
}

main().catch((err) => {
  console.error("Rewrap failed:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
